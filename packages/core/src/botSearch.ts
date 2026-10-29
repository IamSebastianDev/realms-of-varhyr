/** Bounded turn-plan search. The heuristic bot remains available as a baseline.
 * No clock-based cutoff: identical observations and settings produce identical
 * commands. All shortlisted plans and replies run through the real engine. */
import type { Command, GameState, PlayerId, Registry } from "@realms/contracts";
import {
  apply,
  autoPayment,
  combatDamage,
  decisionPlayer,
  effectiveStats,
  inResponseStep,
  laneBlocks,
  legalActions,
  other,
  previewDamage,
} from "./index";
import { botCommand, energyPlans, playOptions } from "./bot";
import { energyProductionOptions } from "./production";
import { sampleSearchWorld, searchEvents, observationBotCommand } from "./botSearchWorld";

export type SearchOptions = {
  /** Maximum engine transitions per turn-plan search (candidate + each reply). */
  transitions: number;
  replyTransitions: number;
  width: number;
  /** Card plays / activations, with energy payment treated as one macro action. */
  depth: number;
  samples: number;
  finalists: number;
};
export const defaultSearchOptions: Readonly<SearchOptions> = {
  transitions: 600,
  replyTransitions: 160,
  width: 4,
  depth: 4,
  samples: 2,
  finalists: 4,
};
type Step = { actor: PlayerId; command: Command };
type Plan = { state: GameState; steps: Step[]; score: number };
type Budget = { used: number; limit: number };
export type SearchDecision = {
  command: Command;
  transitions: number;
  plans: number;
  replies: number;
  samples: number;
  /** The best projected score; not a calibrated win probability. */
  score: number | null;
};

const output = (s: GameState, id: string, r: Registry) =>
  Math.max(
    0,
    ...energyProductionOptions(r.cards[s.cards[id].definitionId], r).map((p) =>
      Object.values(p).reduce((a, b) => a + b, 0),
    ),
  );
/** Both hands are valued by count; no opponent-private identities enter evaluation. */
export function evaluateSearchPosition(s: GameState, actor: PlayerId, r: Registry): number {
  if (s.outcome) return s.outcome === actor ? 100000 : s.outcome === "draw" ? 0 : -100000;
  const value = (p: PlayerId) => {
    let units = 0,
      energy = 0;
    for (const id of s.players[p].board)
      if (id) {
        const stats = effectiveStats(s, id, r);
        const produced = output(s, id, r);
        energy += produced;
        units +=
          stats.attack * (r.cards[s.cards[id].definitionId].type === "holding" ? 0.5 : 2) +
          Math.max(0, stats.defense - s.cards[id].damage) * 0.8;
      }
    return (
      s.players[p].life * 2 + s.players[p].hand.length * 0.8 + units + 20 * (1 - 0.6 ** energy)
    );
  };
  return value(actor) - value(other(actor));
}
function advance(s: GameState, command: Command, r: Registry, budget: Budget): GameState | null {
  if (budget.used >= budget.limit || s.outcome) return null;
  budget.used++;
  const result = apply(s, { actor: decisionPlayer(s), expectedRevision: s.revision, command }, r);
  return result.error ? null : { ...result.state, events: searchEvents(result.state) };
}
/** Specialized choice heuristics must not overlook a win that is already public.
 * Reprise needs one extra step: selecting a spell is followed by its free cast.
 * Preview with the engine, within the same budget as the rest of the search. */
function winningChoice(s: GameState, r: Registry, budget: Budget): Command | null {
  const choice = s.pending;
  const actor = decisionPlayer(s);
  if (choice?.kind === "damage-target" && choice.options.includes(other(actor))) {
    if (choice.amount < s.players[other(actor)].life) return null;
    const command: Command = { type: "choose", choiceId: choice.id, option: other(actor) };
    return advance(s, command, r, budget)?.outcome === actor ? command : null;
  }
  if (s.freeCast) {
    for (const command of playOptions(s, s.freeCast.cardId, r)) {
      const after = advance(s, command, r, budget);
      if (!after) break;
      if (
        after.outcome === actor ||
        (!after.outcome &&
          after.pending?.kind === "damage-target" &&
          winningChoice(after, r, budget))
      )
        return command;
    }
  } else if (choice?.kind === "reprise") {
    for (const option of choice.options) {
      const command: Command = { type: "choose", choiceId: choice.id, option };
      const chosen = advance(s, command, r, budget);
      if (!chosen) break;
      if (winningChoice(chosen, r, budget)) return command;
    }
  }
  return null;
}
function forcedCommand(s: GameState, r: Registry, budget: Budget): Command {
  return winningChoice(s, r, budget) ?? botCommand(s, r);
}
function signature(s: GameState) {
  return JSON.stringify([
    s.active,
    s.phase,
    s.players,
    s.cards,
    s.combat,
    s.pending,
    s.responseStep,
    s.responseQueue,
    s.freeCast,
    s.outcome,
    s.rng,
    s.events.map((e) => [e.type, e.player]),
  ]);
}
function uniquePlans(plans: Plan[]) {
  const seen = new Set<string>();
  return plans.filter((p) => {
    const key = signature(p.state);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
/** Keep distinct material, economy and survival candidates instead of allowing
 * four placements of one high-scoring creature to crowd out every other plan. */
function portfolio(plans: Plan[], actor: PlayerId, r: Registry, count: number): Plan[] {
  const candidates = uniquePlans(plans);
  const economy = (s: GameState) =>
    s.players[actor].board.reduce((n, id) => n + (id ? output(s, id, r) : 0), 0);
  const rankings = [
    [...candidates].sort((a, b) => b.score - a.score),
    [...candidates].sort((a, b) => b.score + economy(b.state) * 3 - a.score - economy(a.state) * 3),
    [...candidates].sort(
      (a, b) =>
        b.score + b.state.players[actor].life * 2 - a.score - a.state.players[actor].life * 2,
    ),
  ];
  const result: Plan[] = [];
  // Preserve the main ranking's winner, then diversify by first action as well as state.
  const first = (p: Plan) => JSON.stringify(p.steps[0]?.command);
  for (let i = 0; result.length < count && i < candidates.length; i++) {
    for (const ranking of rankings) {
      const pick = ranking.find(
        (p) => !result.includes(p) && !result.some((q) => first(q) === first(p)),
      );
      if (pick && result.length < count) result.push(pick);
    }
    if (result.length >= count) break;
    const pick = rankings[0].find((p) => !result.includes(p));
    if (pick) result.push(pick);
  }
  return result;
}

/** Joint lane assignments: one Guard must never be counted as blocking twice.
 * Approximate combat values order candidates; real engine resolution decides. */
export function searchAttackCandidates(s: GameState, r: Registry, count = 4): Command[] {
  const legal = legalActions(s, r);
  const attackers = legal.attackers.filter((id) => effectiveStats(s, id, r).attack > 0);
  const actor = s.active;
  const worth = new Map<string, number>();
  for (const p of [actor, other(actor)])
    for (const id of s.players[p].board)
      if (id) {
        const stats = effectiveStats(s, id, r);
        const energy = output(s, id, r);
        worth.set(id, stats.attack * 2 + stats.defense * 0.8 + energy * 5);
      }
  const candidates: { command: Command; score: number }[] = [];
  function visit(index: number, chosen: string[], lanes: Record<string, number>, used: number) {
    if (index === attackers.length) {
      const blocks = laneBlocks(s, chosen, lanes, r);
      const damage = new Map<string, number>();
      for (const id of chosen)
        for (const hit of combatDamage(s, id, blocks, r))
          damage.set(
            hit.target,
            (damage.get(hit.target) ?? 0) + previewDamage(s, hit.target, hit.amount, r),
          );
      const face = damage.get(other(actor)) ?? 0;
      let score = face >= s.players[other(actor)].life ? 100000 : face * 4;
      for (const [id, amount] of damage)
        if (s.cards[id] && amount + s.cards[id].damage >= effectiveStats(s, id, r).defense)
          score += (s.cards[id].controller === actor ? -1 : 1) * (worth.get(id) ?? 0);
      candidates.push({
        command: { type: "attack", attackers: [...chosen], lanes: { ...lanes } },
        score,
      });
      return;
    }
    const id = attackers[index];
    visit(index + 1, chosen, lanes, used);
    for (const lane of legal.lanes[id])
      if (!(used & (1 << lane))) {
        chosen.push(id);
        lanes[id] = lane;
        visit(index + 1, chosen, lanes, used | (1 << lane));
        chosen.pop();
        delete lanes[id];
      }
  }
  visit(0, [], {}, 0);
  const ranked = candidates.sort((a, b) => b.score - a.score);
  const selected = ranked.slice(0, count).map((p) => p.command);
  // Passing is always a genuine alternative, even in an apparently winning trade.
  if (!selected.some((c) => c.type === "attack" && !c.attackers.length))
    selected.push({ type: "attack", attackers: [], lanes: {} });
  return selected;
}

/** Resolve public/pending decisions with the baseline's specialized routines.
 * A response spell is actually played; the opponent is never forced to pass. */
function settle(
  plan: Plan,
  actor: PlayerId,
  r: Registry,
  budget: Budget,
  attack?: Command,
): Plan | null {
  let s = plan.state;
  const steps = [...plan.steps];
  for (let i = 0; i < 40 && !s.outcome; i++) {
    if (s.active !== actor && !s.responseStep) break;
    let command: Command;
    if (s.pending || s.freeCast || inResponseStep(s)) command = forcedCommand(s, r, budget);
    else if (s.phase === "attack" && s.combat?.stage === "declare")
      command = attack ?? searchAttackCandidates(s, r, 1)[0];
    else command = s.combat?.stage === "review" ? { type: "confirm-combat" } : { type: "end" };
    const mover = decisionPlayer(s);
    const next = advance(s, command, r, budget);
    if (!next) return null;
    steps.push({ actor: mover, command });
    s = next;
  }
  if (!s.outcome && s.active === actor) return null;
  return { state: s, steps, score: evaluateSearchPosition(s, actor, r) };
}

function moves(s: GameState, r: Registry, budget: Budget): Plan[] {
  const actor = decisionPlayer(s),
    plans: Plan[] = [];
  if (s.pending || s.freeCast || inResponseStep(s)) {
    if (s.pending?.kind === "draw") {
      for (const option of s.pending.options) {
        let bottomScore = -Infinity;
        for (const other of ["bottom", "discard"] as const) {
          const command: Command = {
            type: "choose",
            choiceId: s.pending.id,
            option,
            other,
          };
          const after = advance(s, command, r, budget);
          if (!after) continue;
          const score = evaluateSearchPosition(after, actor, r);
          if (other === "bottom") bottomScore = score;
          // Keep a discard line when the engine shows a current benefit (e.g.
          // Dirge). Otherwise prefer the extra library card and preserve the
          // small beam for different keeps and subsequent card plays.
          if (other === "discard" && score <= bottomScore) continue;
          plans.push({ state: after, steps: [{ actor, command }], score });
        }
      }
      return plans;
    }
    const command = forcedCommand(s, r, budget),
      after = advance(s, command, r, budget);
    return after
      ? [
          {
            state: after,
            steps: [{ actor, command }],
            score: evaluateSearchPosition(after, actor, r),
          },
        ]
      : [];
  }
  if (s.phase !== "play") return [];
  let payments = energyPlans(s, r);
  // Legal channel options are printed output; replacement hooks (e.g. Trade)
  // can add energy. Preview those channels rather than declaring their casts
  // unaffordable before consulting the engine.
  const replaced = new Map<
    string,
    { printed: Record<string, number>; actual: Record<string, number> }
  >();
  if (
    Object.values(s.players).some((p) =>
      p.board.some(
        (id) =>
          id &&
          r.cards[s.cards[id].definitionId].abilities.some(
            (a) => r.abilities[a.id].before?.["energy.generate.before"],
          ),
      ),
    )
  ) {
    for (const source of legalActions(s, r).energy)
      for (const [option, printed] of source.options.entries()) {
        const command: Command = { type: "energy", cardId: source.cardId, option };
        const after = advance(s, command, r, budget);
        if (!after) continue;
        const before = s.players[actor].energy;
        const actual = Object.fromEntries(
          Object.entries(after.players[actor].energy).map(([color, amount]) => [
            color,
            amount - (before[color] ?? 0),
          ]),
        );
        replaced.set(JSON.stringify(command), { printed, actual });
      }
    payments = payments.map((plan) => {
      const pool = { ...plan.pool };
      for (const command of plan.commands) {
        const change = replaced.get(JSON.stringify(command));
        if (!change) continue;
        for (const [color, amount] of Object.entries(change.printed))
          pool[color] = (pool[color] ?? 0) - amount;
        for (const [color, amount] of Object.entries(change.actual))
          pool[color] = (pool[color] ?? 0) + amount;
      }
      return { ...plan, pool };
    });
  }
  // Identical copies have identical deployment choices.
  const hand = [
    ...new Map(s.players[actor].hand.map((id) => [s.cards[id].definitionId, id])).values(),
  ];
  const seenFunding = new Set<string>();
  for (const funding of payments) {
    // Skip a payment if no hand card is affordable. Avoid generating useless energy-only moves.
    if (!hand.some((id) => autoPayment(funding.pool, r.cards[s.cards[id].definitionId].cost)))
      continue;
    let funded: GameState | null = s;
    const steps: Step[] = [];
    for (const command of funding.commands) {
      funded = advance(funded, command, r, budget);
      if (!funded) break;
      steps.push({ actor, command });
    }
    if (!funded) continue;
    const key = signature(funded);
    if (seenFunding.has(key)) continue;
    seenFunding.add(key);
    for (const id of hand)
      for (const command of playOptions(funded, id, r)) {
        const after = advance(funded, command, r, budget);
        if (after)
          plans.push({
            state: after,
            steps: [...steps, { actor, command }],
            score: evaluateSearchPosition(after, actor, r),
          });
      }
  }
  for (const action of legalActions(s, r).activations) {
    if (action.energyOptions) continue; // Already included in complete payments (Primal etc.).
    for (const target of action.requiresTarget ? action.targets : [undefined])
      for (const slot of action.slots ?? [undefined]) {
        const command: Command = {
          type: "activate",
          cardId: action.cardId,
          ability: action.ability,
          target,
          slot,
        };
        const after = advance(s, command, r, budget);
        if (after)
          plans.push({
            state: after,
            steps: [{ actor, command }],
            score: evaluateSearchPosition(after, actor, r),
          });
      }
  }
  return uniquePlans(plans);
}

/** Branch on coordinated attacks and on preserving the board. All endings are
 * compared at the same boundary (the next player's draw), never mid-combat. */
function finishes(plan: Plan, actor: PlayerId, r: Registry, budget: Budget): Plan[] {
  let node = plan;
  for (let i = 0; i < 40 && !node.state.outcome; i++) {
    const s = node.state;
    if (s.active !== actor && !s.responseStep)
      return [{ ...node, score: evaluateSearchPosition(s, actor, r) }];
    if (!s.pending && !s.freeCast && !s.responseStep && s.combat?.stage === "declare")
      return searchAttackCandidates(s, r, 2).flatMap((attack) => {
        const result = settle(node, actor, r, budget, attack);
        return result ? [result] : [];
      });
    const command: Command =
      s.pending || s.freeCast || s.responseStep
        ? forcedCommand(s, r, budget)
        : s.combat?.stage === "review"
          ? { type: "confirm-combat" }
          : { type: "end" };
    const after = advance(s, command, r, budget);
    if (!after) return [];
    node = {
      state: after,
      steps: [...node.steps, { actor: decisionPlayer(s), command }],
      score: 0,
    };
  }
  return node.state.outcome
    ? [{ ...node, score: evaluateSearchPosition(node.state, actor, r) }]
    : [];
}

function turnPlans(
  initial: GameState,
  actor: PlayerId,
  r: Registry,
  options: SearchOptions,
  budget: Budget,
): Plan[] {
  let frontier: Plan[] = [
    { state: initial, steps: [], score: evaluateSearchPosition(initial, actor, r) },
  ];
  let complete: Plan[] = [];
  for (
    let depth = 0;
    depth <= options.depth && frontier.length && budget.used < budget.limit;
    depth++
  ) {
    const expanded: Plan[] = [];
    for (const node of frontier) {
      // Finish every candidate through combat before judging a temporary buff,
      // entry trigger, or a creature spent for energy rather than attacking.
      complete.push(...finishes(node, actor, r, budget));
      if (depth === options.depth || node.state.outcome) continue;
      const generationBudget = {
        used: budget.used,
        limit: Math.min(
          budget.limit,
          budget.used + Math.max(16, Math.floor((budget.limit - budget.used) * 0.4)),
        ),
      };
      const choices = moves(node.state, r, generationBudget);
      budget.used = generationBudget.used;
      for (const move of choices) {
        const next = { ...move, steps: [...node.steps, ...move.steps] };
        if (next.state.outcome) {
          complete.push(next);
          continue;
        }
        const endings = finishes(next, actor, r, budget);
        if (endings.length) {
          complete.push(...endings);
          // Carry the pre-combat state forward; preview scoring includes combat.
          expanded.push({ ...next, score: Math.max(...endings.map((p) => p.score)) });
        }
      }
    }
    complete = portfolio(complete, actor, r, options.finalists);
    frontier = portfolio(expanded, actor, r, options.width);
  }
  return complete.sort((a, b) => b.score - a.score);
}

function replayPlan(
  initial: GameState,
  plan: Plan,
  actor: PlayerId,
  r: Registry,
  budget: Budget,
): Plan | null {
  let node: Plan = { state: initial, steps: [], score: 0 };
  for (const step of plan.steps) {
    if (node.state.outcome || (node.state.active !== actor && !node.state.responseStep)) break;
    const mover = decisionPlayer(node.state);
    // Different sampled cards can open different choices or death responses.
    const command =
      mover !== actor || mover !== step.actor ? forcedCommand(node.state, r, budget) : step.command;
    const after = advance(node.state, command, r, budget);
    if (!after) return settle(node, actor, r, budget);
    node = { state: after, steps: [...node.steps, { actor: mover, command }], score: 0 };
  }
  return node.state.outcome || node.state.active !== actor ? node : settle(node, actor, r, budget);
}

/** Only the first command is executed. Replan after every actual draw, choice,
 * death response and opponent action; hypothetical continuations are not queued. */
export function searchDecision(
  state: GameState,
  registry: Registry,
  overrides: Partial<SearchOptions> = {},
): SearchDecision {
  const options = { ...defaultSearchOptions, ...overrides };
  const limits: SearchOptions = {
    transitions: 10000,
    replyTransitions: 10000,
    width: 16,
    depth: 8,
    samples: 8,
    finalists: 12,
  };
  for (const key of Object.keys(options) as (keyof SearchOptions)[])
    if (!Number.isSafeInteger(options[key]) || options[key] < 1 || options[key] > limits[key])
      throw new Error(`Invalid search option: ${key}`);
  const actor = decisionPlayer(state);
  const fallback = (transitions = 0): SearchDecision => {
    const budget = { used: 0, limit: Math.max(0, options.transitions - transitions) };
    // These options are public, but casts may draw cards. Never preview against
    // the live hidden library order when checking their immediate consequences.
    const command =
      state.pending?.kind === "damage-target" || state.pending?.kind === "reprise" || state.freeCast
        ? winningChoice(sampleSearchWorld(state, actor, registry), registry, budget)
        : null;
    return {
      command: command ?? observationBotCommand(state, registry),
      transitions: transitions + budget.used,
      plans: 0,
      replies: 0,
      samples: 0,
      score: null,
    };
  };
  // Existing routines cover forced choices and short death-response windows.
  if (
    state.outcome ||
    (state.pending && state.pending.kind !== "draw") ||
    state.freeCast ||
    state.responseStep ||
    !["draw", "play", "attack"].includes(state.phase)
  )
    return fallback();
  const worlds = Array.from({ length: options.samples }, (_, i) =>
    sampleSearchWorld(state, actor, registry, i),
  );
  const budget: Budget = { used: 0, limit: options.transitions };
  const plans = turnPlans(worlds[0], actor, registry, options, budget);
  if (!plans.length) return fallback(budget.used);
  let transitions = budget.used,
    replies = 0;
  let best: { plan: Plan; score: number } | undefined;
  for (const plan of plans) {
    const values: number[] = [];
    for (const [index, world] of worlds.entries()) {
      const replyBudget: Budget = { used: 0, limit: options.replyTransitions };
      const after = index === 0 ? plan : replayPlan(world, plan, actor, registry, replyBudget);
      if (!after) {
        values.push(-100000);
        continue;
      }
      const counter = after.state.outcome
        ? []
        : turnPlans(
            after.state,
            other(actor),
            registry,
            {
              ...options,
              finalists: 1,
              width: Math.min(2, options.width),
              depth: Math.min(2, options.depth),
            },
            replyBudget,
          );
      replies += counter.length;
      const score = counter.length
        ? Math.min(...counter.map((p) => evaluateSearchPosition(p.state, actor, registry)))
        : evaluateSearchPosition(after.state, actor, registry);
      values.push(score);
      transitions += replyBudget.used;
    }
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    // Some caution about uncertain replies, rather than perfect foresight of a
    // single sampled hand. Terminal results remain overwhelmingly important.
    const score = mean * 0.75 + Math.min(...values) * 0.25;
    if (!best || score > best.score) best = { plan, score };
    if (score === 100000) break; // A win in every sampled world needs no further replies.
  }
  const command = best?.plan.steps.find((step) => step.actor === actor)?.command;
  return command
    ? {
        command,
        transitions,
        plans: plans.length,
        replies,
        samples: options.samples,
        score: best!.score,
      }
    : fallback(transitions);
}
export function searchBotCommand(state: GameState, registry: Registry): Command {
  return searchDecision(state, registry).command;
}
