import {
  castBindings,
  type Command,
  type GameState,
  type PlayerId,
  type Pool,
  type Registry,
} from "@realms/contracts";
import { energyProductionOptions } from "./production";
import { weights as W } from "./botWeights";
import {
  apply,
  autoPayment,
  blockerFor,
  combatDamage,
  decisionPlayer,
  effectiveStats,
  inResponseStep,
  legalActions,
  other,
  previewDamage,
  reachableLanes,
} from "./index";

export type EnergyPlan = { pool: Pool; commands: Command[]; penalty: number };
const add = (a: Pool, b: Pool): Pool => {
  const pool = { ...a };
  for (const key of Object.keys(b) as (keyof Pool)[]) pool[key] = (pool[key] ?? 0) + (b[key] ?? 0);
  return pool;
};
// A static buff is worth what it gives the friendly creatures it reaches now (board) and soon (hand, at half weight).
function supportValue(state: GameState, id: string, registry: Registry): number {
  const source = state.cards[id],
    def = registry.cards[source.definitionId];
  if (
    !def.abilities.some((b) => registry.abilities[b.id].static) ||
    source.slot === null ||
    source.slot === undefined
  )
    return 0;
  const owner = state.players[source.controller];
  let total = 0;
  for (const other of [
    ...owner.board.filter((c): c is string => !!c && c !== id),
    ...owner.hand.filter((c) => registry.cards[state.cards[c].definitionId].type === "creature"),
  ]) {
    const weight = owner.board.includes(other) ? 1 : W.handSupport;
    const battlefield = {
      cards: Object.fromEntries(
        [state.players.p1, state.players.p2]
          .flatMap((pl) => pl.board)
          .filter((c): c is string => !!c)
          .map((c) => [c, state.cards[c]]),
      ),
      players: { p1: { board: state.players.p1.board }, p2: { board: state.players.p2.board } },
    };
    for (const binding of def.abilities) {
      const mod = registry.abilities[binding.id].static?.(
        source,
        state.cards[other],
        binding.params,
        registry,
        battlefield as never,
      );
      total +=
        weight * ((mod?.attack ?? 0) * W.attack + (mod?.defense ?? 0) * W.defense) * W.support;
    }
  }
  return total;
}
/** A spell effect that can return one of the caster's own creatures to hand. */
const friendlyBounce = (binding: { id: string; params: Record<string, unknown> }) =>
  binding.id === "bounce" &&
  ((binding.params.target as string[] | undefined) ?? ["friendly"]).includes("friendly");
function creatureValue(state: GameState, id: string, registry: Registry): number {
  const def = registry.cards[state.cards[id].definitionId],
    stats = effectiveStats(state, id, registry);
  const outputs = energyProductionOptions(def, registry);
  return (
    stats.attack * (def.type === "holding" ? W.attack * W.holding : W.attack) +
    (stats.defense - state.cards[id].damage * W.damage) * W.defense +
    Math.max(
      ...(outputs.length ? outputs : [{}]).map((p) => Object.values(p).reduce((a, b) => a + b, 0)),
    ) *
      W.output +
    supportValue(state, id, registry) +
    def.abilities.reduce(
      (n, a) =>
        n +
        (a.id === "armor"
          ? Number(a.params.amount)
          : ["collector", "deathbound"].includes(a.id)
            ? 1
            : 0),
      0,
    )
  );
}
function colorsOnBoard(
  state: GameState,
  actor: PlayerId,
  registry: Registry,
  removed: string[] = [],
): Set<string> {
  return new Set(
    state.players[actor].board.flatMap((id) =>
      id && !removed.includes(id)
        ? registry.cards[state.cards[id].definitionId].stats!.energyOutputs.flatMap((pool) =>
            Object.keys(pool).filter((color) => color !== "neutral"),
          )
        : [],
    ),
  );
}
const DEAD_CARD = 0;
/** Energy a creature or holding can make in one go (its best option). */
const outputOf = (state: GameState, id: string, registry: Registry) => {
  const options = energyProductionOptions(registry.cards[state.cards[id].definitionId], registry);
  return Math.max(0, ...options.map((pool) => Object.values(pool).reduce((a, b) => a + b, 0)));
};
const totalOutput = (state: GameState, player: PlayerId, registry: Registry) =>
  state.players[player].board.reduce((n, id) => n + (id ? outputOf(state, id, registry) : 0), 0);
/** Energy is worth the most when there is little of it: the first producers carry the whole game, later ones add less. */
const economy = (energy: number) => W.econ * (1 - W.econDecay ** energy);
/** What the owner loses in economy if this card leaves the board (negative of what a producer in hand gains). */
const economyLoss = (state: GameState, id: string, registry: Registry) => {
  const total = totalOutput(state, state.cards[id].controller, registry);
  return economy(total) - economy(total - outputOf(state, id, registry));
};
function positionValue(state: GameState, actor: PlayerId, registry: Registry): number {
  if (state.outcome) return state.outcome === actor ? 10000 : state.outcome === "draw" ? 0 : -10000;
  // A creature printed with no Defense dies on arrival, so it is worth a card in hand only while support on the board keeps it alive.
  const handValue = (p: PlayerId) =>
    state.players[p].hand.reduce(
      (n, id) =>
        n +
        (registry.cards[state.cards[id].definitionId].type === "creature" &&
        effectiveStats(state, id, registry).defense <= 0
          ? DEAD_CARD
          : W.hand),
      0,
    );
  const value = (p: PlayerId) =>
    state.players[p].life * W.life +
    economy(totalOutput(state, p, registry)) +
    handValue(p) +
    colorsOnBoard(state, p, registry).size * W.colors +
    state.players[p].board.reduce((n, id) => n + (id ? creatureValue(state, id, registry) : 0), 0);
  return value(actor) - value(other(actor));
}
function tryCommand(state: GameState, command: Command, registry: Registry): GameState | null {
  const result = apply(
    state,
    { actor: decisionPlayer(state), expectedRevision: state.revision, command },
    registry,
  );
  return result.error ? null : result.state;
}
// At most five producers: enumerate output combinations, never permutations. This
// uses only public board information and our own hand, not the opponent's hand.
export function energyPlans(state: GameState, registry: Registry): EnergyPlan[] {
  const actor = decisionPlayer(state),
    inResponse = inResponseStep(state);
  let plans: EnergyPlan[] = [
    {
      pool: inResponse ? state.players[actor].responseEnergy : state.players[actor].energy,
      commands: [],
      penalty: 0,
    },
  ];
  const legal = legalActions(state, registry),
    producers = new Map<string, { command: Command; output: Pool }[]>();
  for (const source of legal.energy)
    producers.set(
      source.cardId,
      source.options.map((output, option) => ({
        output,
        command: { type: "energy", cardId: source.cardId, option },
      })),
    );
  for (const action of legal.activations)
    if (action.energyOptions) {
      const options = action.energyOptions.map((output) => ({
        output,
        command: {
          type: "activate" as const,
          cardId: action.cardId,
          ability: action.ability,
          target: Object.keys(output)[0],
        },
      }));
      producers.set(action.cardId, [...(producers.get(action.cardId) ?? []), ...options]);
    }
  // Group by source so a plan never channels and activates the same creature.
  for (const [cardId, options] of producers) {
    const previous = plans;
    plans = [...previous];
    for (const plan of previous)
      for (const { command, output } of options)
        plans.push({
          pool: add(plan.pool, output),
          commands: [...plan.commands, command],
          penalty:
            plan.penalty +
            effectiveStats(state, cardId, registry).attack * W.spendAttack +
            W.spendBase,
        });
  }
  return plans.sort((a, b) => a.penalty - b.penalty || a.commands.length - b.commands.length);
}
export function playOptions(state: GameState, id: string, registry: Registry): Command[] {
  const card = legalActions(state, registry).playable.find((c) => c.cardId === id);
  if (!card) return [];
  const commands: Command[] = [];
  const def = registry.cards[state.cards[id].definitionId];
  // A modal spell is tried once per legal mode, each with that mode's own targets and positions.
  for (const choice of card.modes ?? [undefined]) {
    const mode = choice?.mode,
      slotsLegal = choice ? choice.slots : card.slots,
      targetsLegal = choice ? choice.targets : card.targets,
      needsTarget = choice ? choice.requiresTarget : card.requiresTarget,
      field =
        def.type !== "spell" ||
        castBindings(def, mode).some((b) => registry.abilities[b.id].placement);
    for (const consume of card.consumes.length ? card.consumes : [undefined]) {
      const slots = field
        ? [...new Set([...slotsLegal, ...(consume ? [state.cards[consume].slot!] : [])])]
        : [undefined];
      // Prefer central space on equal scores, but evaluate every legal deployment.
      slots.sort((a, b) => [2, 1, 3, 0, 4].indexOf(a!) - [2, 1, 3, 0, 4].indexOf(b!));
      for (const target of needsTarget ? targetsLegal : [undefined])
        for (const slot of slots)
          commands.push({
            type: "play",
            cardId: id,
            consume,
            target,
            slot,
            ...(mode === undefined ? {} : { mode }),
          });
    }
  }
  return commands;
}
/** One affordable way to spend part of the turn: its first command, the position after it, and what it is worth beyond doing nothing. */
type Move = { command: Command; after: GameState; gain: number; score: number };
function collectMoves(state: GameState, registry: Registry): { moves: Move[]; baseline: number } {
  const actor = decisionPlayer(state),
    p = state.players[actor],
    plans = energyPlans(state, registry),
    baseline =
      positionValue(state, actor, registry) -
      (W.exposure ? W.exposure * exposure(state, actor, registry) : 0);
  const moves: Move[] = [];
  // Reuse engine-validated states for plans shared by different cards.
  const funded = new Map<EnergyPlan, GameState | null>();
  const fund = (plan: EnergyPlan) => {
    if (funded.has(plan)) return funded.get(plan)!;
    let next: GameState | null = state;
    for (const command of plan.commands) {
      next = tryCommand(next, command, registry);
      if (!next) break;
    }
    funded.set(plan, next);
    return next;
  };
  const consider = (after: GameState, command: Command, plan: EnergyPlan) => {
    const def =
      command.type === "play"
        ? registry.cards[state.cards[command.cardId].definitionId]
        : undefined;
    // A cheap cantrip cycles a card rather than adding one. A small fixed incentive
    // avoids inspecting unrevealed library contents and stops near deck exhaustion.
    const cycle =
      !after.outcome &&
      p.deck.length > 4 &&
      def?.cast?.some((a) => a.id === "draw" && a.params.amount === 1)
        ? W.cycle
        : 0;
    let settled = after;
    if (W.resolve)
      for (
        let k = 0;
        k < 3 && settled.pending && settled.pending.player === actor && !settled.outcome;
        k++
      ) {
        const next = tryCommand(settled, botCommand(settled, registry), registry);
        if (!next) break;
        settled = next;
      }
    let adjust = 0;
    if (def?.type === "spell" && def.cast && command.type === "play") {
      if (W.tempBuff < 1) {
        let buff = 0;
        for (const b of def.cast) {
          const amount = Number(b.params.amount ?? 0);
          if (b.id === "rage") buff += amount * W.attack;
          else if (b.id === "steadfast") buff += amount * W.defense;
          else if (b.id === "bolster")
            buff +=
              state.players[actor].board.filter(Boolean).length *
              (Number(b.params.attack ?? 0) * W.attack + Number(b.params.defense ?? 0) * W.defense);
        }
        adjust -= (1 - W.tempBuff) * buff;
      }
    }
    const risk =
      W.exposure && !settled.outcome ? W.exposure * exposure(settled, actor, registry) : 0;
    const gain = positionValue(settled, actor, registry) - risk - plan.penalty + cycle + adjust;
    moves.push({
      command: plan.commands[0] ?? command,
      after: settled,
      gain,
      score: gain - baseline,
    });
  };
  for (const action of legalActions(state, registry).activations) {
    for (const target of action.requiresTarget ? action.targets : [undefined])
      for (const slot of action.slots ?? [undefined]) {
        const command: Command = {
          type: "activate",
          cardId: action.cardId,
          ability: action.ability,
          target,
          slot,
        };
        const after = tryCommand(state, command, registry);
        const penalty =
          registry.cards[state.cards[action.cardId].definitionId].type === "creature"
            ? effectiveStats(state, action.cardId, registry).attack * W.spendAttack
            : 0;
        if (after) consider(after, command, { pool: p.energy, commands: [], penalty });
      }
  }
  const seen = new Set<string>();
  const candidates = p.hand.filter((id) => {
    const def = state.cards[id].definitionId;
    if (seen.has(def)) return false;
    seen.add(def);
    return true;
  });
  for (const id of candidates) {
    const def = registry.cards[state.cards[id].definitionId];
    if (def.cast?.some((a) => a.id === "channel")) {
      // Conversion is worth a card only if it enables a useful follow-up now.
      // Do not score spare energy as value: it expires at the phase boundary.
      if (state.phase !== "play" || inResponseStep(state)) continue;
      for (const plan of plans) {
        if (!autoPayment(plan.pool, def.cost)) continue;
        const ready = fund(plan);
        if (!ready) continue;
        for (const ritual of playOptions(ready, id, registry)) {
          const converted = tryCommand(ready, ritual, registry);
          if (!converted || converted.outcome) continue;
          for (const nextId of candidates) {
            if (
              nextId === id ||
              registry.cards[state.cards[nextId].definitionId].cast?.some((a) => a.id === "channel")
            )
              continue;
            for (const followup of playOptions(converted, nextId, registry)) {
              const after = tryCommand(converted, followup, registry);
              if (after) consider(after, ritual, plan);
            }
          }
        }
      }
      continue;
    }
    if (def.cast?.some(friendlyBounce)) {
      // Bounce only when the same turn can complete a material upgrade. Returning
      // and replaying the same creature would otherwise form an endless loop.
      if (state.phase !== "play" || inResponseStep(state) || p.board.includes(null)) continue;
      for (const upgrade of candidates) {
        const nextDef = registry.cards[state.cards[upgrade].definitionId];
        if (nextDef.type === "spell" || nextDef.abilities.some((a) => a.id === "consume")) continue;
        if (
          !p.board.some(
            (victim) =>
              victim &&
              creatureValue(state, upgrade, registry) > creatureValue(state, victim, registry) + 2,
          )
        )
          continue;
        const combined = {
          generic: def.cost.generic + nextDef.cost.generic,
          factions: add(def.cost.factions, nextDef.cost.factions),
        };
        const plan = plans.find((plan) => autoPayment(plan.pool, combined));
        if (!plan) continue;
        const ready = fund(plan);
        if (!ready) continue;
        for (const bounce of playOptions(ready, id, registry)) {
          if (
            bounce.type !== "play" ||
            !bounce.target ||
            creatureValue(state, upgrade, registry) <=
              creatureValue(state, bounce.target, registry) + 2
          )
            continue;
          const returned = tryCommand(ready, bounce, registry);
          if (!returned) continue;
          for (const deploy of playOptions(returned, upgrade, registry)) {
            const after = tryCommand(returned, deploy, registry);
            if (after) consider(after, bounce, plan);
          }
        }
      }
      continue;
    }
    if (
      def.type !== "spell" &&
      !p.board.includes(null) &&
      !def.abilities.some((a) => a.id === "consume")
    )
      continue;
    if (def.type === "spell" && !def.timing?.includes(inResponseStep(state) ? "response" : "play"))
      continue;
    const plan = plans.find((plan) => autoPayment(plan.pool, def.cost));
    if (!plan) continue; // No speculative partial payments for unreachable costs.
    // Keep the last slot available when an existing hand upgrade can be paid
    // next readiness cycle. Filling it with a weaker free body locks the board.
    if (
      def.type !== "spell" &&
      p.board.filter(Boolean).length === 4 &&
      !def.abilities.some((a) => a.id === "consume")
    ) {
      // Next cycle starts with an empty pool: energy channelled this turn must not count twice.
      const nextCycle = {
        ...state,
        players: W.freshCycle
          ? { ...state.players, [actor]: { ...state.players[actor], energy: {} } }
          : state.players,
        cards: Object.fromEntries(
          Object.entries(state.cards).map(([cid, c]) => [
            cid,
            c.controller === actor ? { ...c, exhausted: false } : c,
          ]),
        ),
      };
      const future = energyPlans(nextCycle, registry);
      if (
        !(W.holdExposure && exposure(state, actor, registry) > 0) &&
        p.hand.some((cid) => {
          const alternative = registry.cards[state.cards[cid].definitionId];
          return (
            alternative.type !== "spell" &&
            creatureValue(state, cid, registry) > creatureValue(state, id, registry) + 2 &&
            future.some((f) => autoPayment(f.pool, alternative.cost))
          );
        })
      )
        continue;
    }
    const ready = fund(plan);
    if (!ready) continue;
    for (const command of playOptions(ready, id, registry)) {
      const after = tryCommand(ready, command, registry);
      if (after) consider(after, command, plan);
    }
  }
  return { moves, baseline };
}
function planPlay(state: GameState, registry: Registry): Command {
  const { moves, baseline } = collectMoves(state, registry);
  let best: { score: number; command: Command } = { score: W.minPlay, command: { type: "end" } };
  const depth = inResponseStep(state) ? 1 : Math.round(W.depth);
  if (depth <= 1) {
    for (const move of moves) if (move.score > best.score) best = move;
    return best.command;
  }
  // Look ahead through the rest of this turn: a cheap play now can leave energy for a second one, which one-ply scoring never sees.
  const actor = decisionPlayer(state);
  const finish = (move: Move, left: number): number => {
    if (
      left <= 1 ||
      move.after.outcome ||
      move.after.pending ||
      decisionPlayer(move.after) !== actor
    )
      return move.gain;
    const next = collectMoves(move.after, registry).moves.sort((a, b) => b.score - a.score);
    let top = move.gain + W.minPlay;
    // Chaining a further play pays for the plan's own cost again, so compare against stopping here.
    for (const follow of next.slice(0, W.breadth)) {
      const through =
        finish(follow, left - 1) - positionValue(move.after, actor, registry) + move.gain;
      if (through > top) top = through;
    }
    return top - W.minPlay;
  };
  const ranked = [...moves].sort((a, b) => b.score - a.score).slice(0, W.breadth);
  for (const move of ranked) {
    const score = finish(move, depth) - baseline;
    if (score > best.score) best = { score, command: move.command };
  }
  return best.command;
}
/** The best way for `attackers` (any side) to choose lanes. Defenders block automatically, so each option is scored by its known outcome. */
function bestAttack(
  state: GameState,
  attackers: string[],
  lanesOf: (id: string) => number[],
  lethal: number,
  registry: Registry,
): { chosen: { id: string; lane: number }[]; score: number; life: number } {
  type Option = { lane: number; life: number; score: number };
  const options = new Map<string, Option[]>();
  for (const attacker of attackers) {
    const own = state.cards[attacker].slot!,
      list: Option[] = [];
    // Own lane first so equal outcomes keep the straight-ahead attack.
    for (const lane of [...lanesOf(attacker)].sort(
      (a, b) => Math.abs(a - own) - Math.abs(b - own),
    )) {
      const blocker = blockerFor(state, attacker, lane, registry);
      if (!blocker) {
        list.push({
          lane,
          life: effectiveStats(state, attacker, registry).attack,
          score: effectiveStats(state, attacker, registry).attack * W.openDamage,
        });
        continue;
      }
      const damage = new Map<string, number>();
      for (const hit of combatDamage(state, attacker, [{ attacker, blocker }], registry))
        damage.set(hit.target, previewDamage(state, hit.target, hit.amount, registry));
      const blockerDies =
        (damage.get(blocker) ?? 0) + state.cards[blocker].damage >=
        effectiveStats(state, blocker, registry).defense;
      const attackerDies =
        (damage.get(attacker) ?? 0) + state.cards[attacker].damage >=
        effectiveStats(state, attacker, registry).defense;
      list.push({
        lane,
        life: 0,
        score:
          (blockerDies
            ? creatureValue(state, blocker, registry) * W.killBlocker +
              economyLoss(state, blocker, registry) * W.denial
            : 0) -
          (attackerDies
            ? creatureValue(state, attacker, registry) * W.loseAttacker +
              economyLoss(state, attacker, registry) * W.denial
            : 0),
      });
    }
    options.set(attacker, list);
  }
  let bestScore = 0,
    bestLife = 0,
    best: { id: string; lane: number }[] = [];
  const visit = (
    index: number,
    used: number,
    score: number,
    life: number,
    chosen: { id: string; lane: number }[],
  ) => {
    if (index === attackers.length) {
      const total = score + (life >= lethal ? 1000 : 0);
      if (total > bestScore) {
        bestScore = total;
        bestLife = life;
        best = [...chosen];
      }
      return;
    }
    visit(index + 1, used, score, life, chosen); // Sit this attacker out.
    for (const option of options.get(attackers[index])!)
      if (!(used & (1 << option.lane)))
        visit(index + 1, used | (1 << option.lane), score + option.score, life + option.life, [
          ...chosen,
          { id: attackers[index], lane: option.lane },
        ]);
  };
  visit(0, 0, 0, 0, []);
  return { chosen: best, score: bestScore, life: bestLife };
}
/** What the opponent's best attack next turn would gain them against `victim`'s board as it stands (their creatures all count as ready). */
function exposure(state: GameState, victim: PlayerId, registry: Registry): number {
  const foe = other(victim);
  const attackers = state.players[foe].board.filter(
    (id): id is string => !!id && effectiveStats(state, id, registry).attack > 0,
  );
  if (!attackers.length) return 0;
  return bestAttack(
    state,
    attackers,
    (id) => reachableLanes(state.cards[id].slot),
    state.players[victim].life,
    registry,
  ).score;
}
/** Choose attackers and lanes. */
function chooseAttacks(state: GameState, registry: Registry): Command {
  const actor = decisionPlayer(state),
    legal = legalActions(state, registry);
  const attackers = legal.attackers.filter((id) => effectiveStats(state, id, registry).attack > 0);
  const { chosen } = bestAttack(
    state,
    attackers,
    (id) => legal.lanes[id],
    state.players[other(actor)].life,
    registry,
  );
  return {
    type: "attack",
    attackers: chosen.map((a) => a.id),
    lanes: Object.fromEntries(chosen.map((a) => [a.id, a.lane])),
  };
}
/** Return up to `max` of the most expensive cards (total cost 4+), but always keep a cheap play so the opening is not empty. */
function chooseMulligan(
  state: GameState,
  registry: Registry,
  hand: string[],
  max: number,
): string[] {
  const cost = (id: string) => {
    const c = registry.cards[state.cards[id].definitionId].cost;
    return c.generic + Object.values(c.factions).reduce((a, b) => a + b, 0);
  };
  const def = (id: string) => registry.cards[state.cards[id].definitionId];
  // A support card (a static buff) that is cheap to cast keeps the creatures that need it alive.
  const support = hand.some(
    (id) =>
      cost(id) <= 2 &&
      def(id).type === "creature" &&
      def(id).abilities.some((b) => registry.abilities[b.id].static),
  );
  const dead = (id: string) =>
    !support && def(id).type === "creature" && effectiveStats(state, id, registry).defense <= 0;
  const cheapLive = hand.filter((id) => cost(id) <= 1 && !dead(id)).length;
  const toss = [...hand]
    .filter((id) => cost(id) >= 4 || dead(id))
    .sort((a, b) => Number(dead(b)) - Number(dead(a)) || cost(b) - cost(a) || (a < b ? -1 : 1));
  return toss.slice(0, cheapLive ? max : Math.max(max, 0));
}
// A bounded, deterministic heuristic opponent issuing the same commands as a
// human. It plans complete payments and evaluates casts with the actual engine.
export function botCommand(state: GameState, registry: Registry): Command {
  const actor = decisionPlayer(state),
    p = state.players[actor];
  if (state.pending) {
    const choice = state.pending;
    if (choice.kind === "mulligan")
      return {
        type: "mulligan",
        cardIds: chooseMulligan(state, registry, choice.options, choice.max),
      };
    if (choice.kind === "library-pick") {
      // Take the most valuable creature; holdings and ties keep the cheapest-first option order.
      const value = (id: string) =>
        registry.cards[state.cards[id].definitionId].type !== "spell"
          ? creatureValue(state, id, registry) +
            W.denial *
              (economy(totalOutput(state, actor, registry) + outputOf(state, id, registry)) -
                economy(totalOutput(state, actor, registry)))
          : 0;
      const best = choice.options.reduce((a, b) => (value(b) > value(a) ? b : a));
      return { type: "choose", choiceId: choice.id, option: best };
    }
    if (choice.kind === "reprise") {
      // Cast the most expensive spell: it saves the most energy.
      const price = (id: string) => {
        const cost = registry.cards[state.cards[id].definitionId].cost;
        return cost.generic + Object.values(cost.factions).reduce((a, b) => a + b, 0);
      };
      const best = choice.options.reduce((a, b) => (price(b) > price(a) ? b : a));
      return { type: "choose", choiceId: choice.id, option: best };
    }
    if (choice.kind === "damage-target") {
      // Finish off the most valuable creature the damage kills; otherwise hit the enemy player.
      const kills = choice.options.filter((id) => {
        const card = state.cards[id];
        return (
          card &&
          registry.cards[card.definitionId].type === "creature" &&
          effectiveStats(state, id, registry).defense - card.damage <= choice.amount
        );
      });
      const best = kills.length
        ? kills.reduce((a, c) =>
            creatureValue(state, c, registry) + economyLoss(state, c, registry) * W.denial >
            creatureValue(state, a, registry) + economyLoss(state, a, registry) * W.denial
              ? c
              : a,
          )
        : choice.options[choice.options.length - 1];
      return { type: "choose", choiceId: choice.id, option: best };
    }
    if (choice.kind === "hand-discard") {
      // Take the most expensive card; ties keep hand order.
      const price = (id: string) => {
        const cost = registry.cards[state.cards[id].definitionId].cost;
        return cost.generic + Object.values(cost.factions).reduce((a, b) => a + b, 0);
      };
      const best = choice.options.reduce((a, b) => (price(b) > price(a) ? b : a));
      return { type: "choose", choiceId: choice.id, option: best };
    }
    if (choice.kind === "response-energy") {
      const option = choice.options.findIndex((output) =>
        p.hand.some((id) => {
          const def = registry.cards[state.cards[id].definitionId];
          return (
            def.type === "spell" &&
            def.timing?.includes("response") &&
            autoPayment(add(p.responseEnergy, output), def.cost)
          );
        }),
      );
      return { type: "choose", choiceId: choice.id, option: Math.max(0, option) };
    }
    const plans = energyPlans({ ...state, pending: null }, registry);
    const score = (id: string) => {
      const def = registry.cards[state.cards[id].definitionId],
        free = def.cost.generic + Object.values(def.cost.factions).reduce((a, b) => a + b, 0) === 0;
      if (def.type !== "spell") {
        const fits = p.board.includes(null) || def.abilities.some((a) => a.id === "consume");
        return (
          (fits ? 1 : 0.15) * creatureValue(state, id, registry) +
          (free && p.board.filter(Boolean).length < 3 ? 8 : 0) +
          (fits && plans.some((plan) => autoPayment(plan.pool, def.cost)) ? 3 : 0)
        );
      }
      return def.cast?.some(friendlyBounce) ? (p.board.includes(null) ? 1 : 5) : 6;
    };
    // Keep the best card. A promising second card goes under the library for later; a weak one is discarded.
    const ranked = [...choice.options].sort((a, b) => score(b) - score(a));
    return {
      type: "choose",
      choiceId: choice.id,
      option: ranked[0],
      other: ranked[1] && score(ranked[1]) >= 5 ? "bottom" : "discard",
    };
  }
  if (state.freeCast) {
    // A free spell has to be cast: take the option that leaves the best position.
    let best: { score: number; command: Command } | null = null;
    for (const command of playOptions(state, state.freeCast.cardId, registry)) {
      const after = tryCommand(state, command, registry);
      const score = after ? positionValue(after, actor, registry) : -Infinity;
      if (!best || score > best.score) best = { score, command };
    }
    if (best) return best.command;
  }
  if (state.phase === "play" || inResponseStep(state)) return planPlay(state, registry);
  if (state.combat?.stage === "declare") return chooseAttacks(state, registry);
  if (state.combat?.stage === "review") return { type: "confirm-combat" };
  return { type: "end" };
}
