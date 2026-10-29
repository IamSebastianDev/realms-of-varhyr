import * as v from "valibot";
import type {
  AbilityBinding,
  BattlefieldState,
  BeforePayload,
  CardDefinition,
  CardInstance,
  Combat,
  Command,
  CommandEnvelope,
  Cost,
  DeadSnapshot,
  EnergyType,
  GameEvent,
  GameState,
  HookContext,
  InternalOrder,
  LegalActions,
  Player,
  PlayerId,
  PlayerView,
  Pool,
  Registry,
} from "@realms/contracts";
import { battlefieldPositions, castBindings, deckRules, positionName } from "@realms/contracts";
import { describeAbility } from "@realms/extensions/describeAbility";
import { energyProductionOptions } from "./production";
export const RULES_VERSION = "varhir-rules-0.21";
const nonnegative = v.pipe(v.number(), v.integer(), v.minValue(0));
const paymentSchema = v.record(v.pipe(v.string(), v.regex(/^[a-z][a-z0-9_-]*$/)), nonnegative);
export const commandSchema = v.variant("type", [
  v.object({
    type: v.literal("play"),
    cardId: v.string(),
    slot: v.optional(nonnegative),
    target: v.optional(v.string()),
    consume: v.optional(v.string()),
    payment: v.optional(paymentSchema),
    mode: v.optional(nonnegative),
  }),
  v.object({ type: v.literal("energy"), cardId: v.string(), option: nonnegative }),
  v.object({
    type: v.literal("activate"),
    cardId: v.string(),
    ability: nonnegative,
    target: v.optional(v.string()),
    slot: v.optional(nonnegative),
  }),
  v.object({
    type: v.literal("attack"),
    attackers: v.array(v.string()),
    lanes: v.optional(v.record(v.string(), nonnegative)),
  }),
  v.object({ type: v.literal("confirm-combat") }),
  v.object({ type: v.literal("mulligan"), cardIds: v.array(v.string()) }),
  v.object({
    type: v.literal("choose"),
    choiceId: v.string(),
    option: v.union([v.string(), nonnegative]),
    other: v.optional(v.picklist(["discard", "bottom"])),
  }),
  v.object({ type: v.literal("end") }),
  v.object({ type: v.literal("concede") }),
]);
/** The network boundary uses exactly the engine's command schema. */
export const parseCommand = (input: unknown): Command => v.parse(commandSchema, input);

export const other = (p: PlayerId): PlayerId => (p === "p1" ? "p2" : "p1");
const requireRule = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};
/** Draft decks are built from what was picked, so only the legendary limit applies; every other copy count is allowed. */
export type DeckCheck = { draft?: boolean };
export function validateDeck(deck: string[], registry: Registry, check: DeckCheck = {}): string[] {
  const errors: string[] = [];
  if (deck.length < deckRules.minimumCards)
    errors.push(`A deck needs at least ${deckRules.minimumCards} cards.`);
  const counts: Record<string, number> = {};
  for (const id of deck) {
    const card = registry.cards[id];
    if (!card) {
      errors.push(`Unknown card: ${id}`);
      continue;
    }
    const count = (counts[card.deckLimitKey] = (counts[card.deckLimitKey] ?? 0) + 1);
    if (
      count >
      (card.legendary
        ? deckRules.copiesPerLegendary
        : check.draft
          ? Infinity
          : deckRules.copiesPerCard)
    )
      errors.push(`Too many copies of ${card.name}.`);
  }
  return errors;
}
function random(state: GameState): number {
  let x = state.rng;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  state.rng = x >>> 0;
  return state.rng / 4294967296;
}
function shuffle<T>(state: GameState, array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random(state) * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function definition(
  state: GameState | Pick<PlayerView, "cards">,
  id: string,
  registry: Registry,
): CardDefinition {
  return registry.cards[state.cards[id].definitionId];
}
export function effectiveStats(
  state: Pick<GameState, "cards" | "players"> | Pick<PlayerView, "cards" | "players">,
  id: string,
  registry: Registry,
) {
  const card = state.cards[id],
    printed = registry.cards[card.definitionId].stats;
  if (!printed) return { attack: 0, defense: 0 };
  let attack = printed.attack + (card.attackBonus ?? 0),
    defense = printed.defense + (card.defenseBonus ?? 0);
  // Give continuous effects the same public battlefield context in the engine and player-view renderer.
  // Private hands/libraries and other match fields must not influence a static modifier.
  // Both discard piles are public too, so abilities may count what lies in them.
  const battlefield: BattlefieldState = {
    cards: Object.fromEntries(
      [state.players.p1, state.players.p2]
        .flatMap((player) => [...player.board, ...player.discard])
        .filter((id): id is string => !!id)
        .map((id) => [id, state.cards[id]]),
    ),
    players: {
      p1: {
        board: state.players.p1.board,
        discard: state.players.p1.discard,
        spellsCast: state.players.p1.spellsCast,
      },
      p2: {
        board: state.players.p2.board,
        discard: state.players.p2.discard,
        spellsCast: state.players.p2.spellsCast,
      },
    },
  };
  for (const player of [state.players.p1, state.players.p2])
    for (const sid of player.board) {
      if (!sid) continue;
      const source = state.cards[sid];
      for (const binding of registry.cards[source.definitionId].abilities) {
        const modifier = registry.abilities[binding.id].static?.(
          source,
          card,
          binding.params,
          registry,
          battlefield,
        );
        attack += modifier?.attack ?? 0;
        defense += modifier?.defense ?? 0;
      }
    }
  return { attack: Math.max(0, attack), defense: Math.max(0, defense) };
}
// Pure damage preview: replacement hooks are read without issuing their effects.
// Used by the bot to compare single-block trades with armor applied.
export function previewDamage(
  state: GameState,
  target: string,
  amount: number,
  registry: Registry,
): number {
  const card = state.cards[target];
  if (!card) return amount;
  let payload: BeforePayload = { amount };
  const event: GameEvent = {
    seq: state.sequence,
    type: "damage.before",
    message: "",
    cardId: target,
    visibility: "public",
  };
  for (const binding of [...registry.cards[card.definitionId].abilities].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  )) {
    payload =
      registry.abilities[binding.id].before?.["damage.before"]?.(
        { state, registry, source: card, event, issue: () => {} },
        binding.params,
        payload,
      ) ?? payload;
  }
  const damage = payload.amount ?? amount;
  requireRule(Number.isInteger(damage) && damage >= 0, "Invalid damage modifier.");
  return damage;
}
export function combatDamage(
  state: GameState,
  attacker: string,
  assignments: Combat["blocks"],
  registry: Registry,
): Extract<InternalOrder, { type: "damage" }>[] {
  if (state.cards[attacker]?.zone !== "board") return [];
  const block = assignments.find((a) => a.attacker === attacker);
  const attack = effectiveStats(state, attacker, registry).attack;
  if (!block)
    return [{ type: "damage", target: other(state.active), amount: attack, source: attacker }];
  // A declared block prevents player damage even if its blocker has left play.
  if (state.cards[block.blocker]?.zone !== "board") return [];
  // Snapshot both attacks before either hit or any death/trigger resolution.
  return [
    { type: "damage", target: block.blocker, amount: attack, source: attacker },
    {
      type: "damage",
      target: attacker,
      amount: effectiveStats(state, block.blocker, registry).attack,
      source: block.blocker,
    },
  ];
}
/** Whether this pair may ever block (types, flank restrictions). Lane geometry is separate: see laneBlocks. */
export function canBlock(
  state: Pick<GameState, "cards">,
  attackerId: string,
  blockerId: string,
  registry: Registry,
): boolean {
  const attacker = state.cards[attackerId],
    blocker = state.cards[blockerId];
  if (
    !attacker ||
    !blocker ||
    attacker.zone !== "board" ||
    blocker.zone !== "board" ||
    attacker.controller === blocker.controller ||
    definition(state, attackerId, registry).type !== "creature"
  )
    return false;
  return [attacker, blocker].every((source) =>
    definition(state, source.id, registry).abilities.every(
      (binding) =>
        registry.abilities[binding.id].canBlock?.(
          source,
          attacker,
          blocker,
          binding.params,
          registry,
        ) !== false,
    ),
  );
}
/** An attacker may target its own lane or one adjacent lane; lanes never wrap. */
export function reachableLanes(slot: number | null): number[] {
  return slot === null
    ? []
    : [slot - 1, slot, slot + 1].filter((lane) => lane >= 0 && lane < battlefieldPositions.length);
}
const abilitiesOf = (state: Pick<GameState, "cards">, id: string, registry: Registry) =>
  definition(state, id, registry).abilities;
/** Guards that would step in for `attacker` aimed at `lane`, nearest slot first. */
function interceptors(
  state: Pick<GameState, "cards" | "players">,
  attackerId: string,
  lane: number,
  registry: Registry,
): string[] {
  const attacker = state.cards[attackerId],
    board = state.players[other(attacker.controller)].board;
  return [lane - 1, lane + 1].flatMap((slot) => {
    const id = board[slot];
    return id &&
      abilitiesOf(state, id, registry).some((b) =>
        registry.abilities[b.id].intercepts?.(state.cards[id], attacker, lane, b.params, registry),
      ) &&
      canBlock(state, attackerId, id, registry)
      ? [id]
      : [];
  });
}
/** Who blocks `attacker` aimed at `lane`: a free adjacent Guard, otherwise the card in the lane if it can block. */
export function blockerFor(
  state: Pick<GameState, "cards" | "players">,
  attackerId: string,
  lane: number,
  registry: Registry,
  used: ReadonlySet<string> = new Set(),
): string | null {
  const guard = interceptors(state, attackerId, lane, registry).find((id) => !used.has(id));
  if (guard) return guard;
  const id = state.players[other(state.cards[attackerId].controller)].board[lane];
  return id && !used.has(id) && canBlock(state, attackerId, id, registry) ? id : null;
}
/** Blocking is automatic. A Guard sitting in a targeted lane always blocks there first; the remaining attackers go left to right,
 * each met by a free adjacent Guard, else by the card in the lane. A card blocks at most one attacker. */
export function laneBlocks(
  state: GameState,
  attackers: string[],
  lanes: Record<string, number>,
  registry: Registry,
): Combat["blocks"] {
  const board = state.players[other(state.active)].board,
    used = new Set<string>(),
    blockers = new Map<string, string>();
  for (const attacker of attackers) {
    const id = board[lanes[attacker]];
    if (
      id &&
      abilitiesOf(state, id, registry).some((b) => registry.abilities[b.id].intercepts) &&
      canBlock(state, attacker, id, registry)
    ) {
      blockers.set(attacker, id);
      used.add(id);
    }
  }
  for (const attacker of [...attackers].sort((x, y) => lanes[x] - lanes[y])) {
    if (blockers.has(attacker)) continue;
    const id = blockerFor(state, attacker, lanes[attacker], registry, used);
    if (id) {
      blockers.set(attacker, id);
      used.add(id);
    }
  }
  return attackers.flatMap((attacker) =>
    blockers.has(attacker) ? [{ attacker, blocker: blockers.get(attacker)! }] : [],
  );
}
export function autoPayment(pool: Pool, cost: Cost): Pool | null {
  const paid: Pool = {},
    available = { ...pool };
  for (const color of Object.keys(cost.factions).sort()) {
    const needed = color === "neutral" ? 0 : (cost.factions[color] ?? 0);
    if ((available[color] ?? 0) < needed) return null;
    if (needed) {
      paid[color] = needed;
      available[color] = (available[color] ?? 0) - needed;
    }
  }
  let remaining = cost.generic;
  // Prefer neutral energy; remaining faction IDs sort deterministically.
  for (const color of [
    "neutral",
    ...Object.keys(available)
      .filter((c) => c !== "neutral")
      .sort(),
  ]) {
    const spend = Math.min(remaining, available[color] ?? 0);
    if (spend) paid[color] = (paid[color] ?? 0) + spend;
    remaining -= spend;
  }
  return remaining ? null : paid;
}
function validPayment(pool: Pool, cost: Cost, paid: Pool, colors: EnergyType[]) {
  if (Object.keys(paid).some((c) => !colors.includes(c as EnergyType))) return false;
  let total = 0,
    required = cost.generic;
  for (const color of colors) {
    const amount = paid[color] ?? 0,
      specific = color === "neutral" ? 0 : (cost.factions[color] ?? 0);
    if (!Number.isInteger(amount) || amount < specific || amount < 0 || amount > (pool[color] ?? 0))
      return false;
    total += amount;
    required += specific;
  }
  return total === required;
}
function addEnergy(pool: Pool, output: Pool) {
  for (const color of Object.keys(output))
    if (output[color]) pool[color] = (pool[color] ?? 0) + output[color]!;
}
/** Whenever a creature with an energy output dies, its owner gets that energy as response energy and a window to spend it on response spells. */
export const inResponseStep = (state: Pick<GameState, "responseStep">) => !!state.responseStep;
export function decisionPlayer(state: GameState): PlayerId {
  return state.pending?.player ?? state.responseStep ?? state.active;
}
function blankPlayer(id: PlayerId, name: string): Player {
  return {
    id,
    name,
    life: 10,
    deck: [],
    hand: [],
    board: [null, null, null, null, null],
    discard: [],
    energy: {},
    responseEnergy: {},
  };
}
export const MULLIGAN_MAX = 2;
const OPENING_HAND = 5;
/** A creature or holding that costs nothing and makes energy: the card a hand needs to get going. */
const isFreeProducer = (card: CardDefinition, registry: Registry) =>
  card.type !== "spell" &&
  card.cost.generic + Object.values(card.cost.factions).reduce((sum, n) => sum + n, 0) === 0 &&
  energyProductionOptions(card, registry).some((output) =>
    Object.values(output).some((n) => n > 0),
  );
/**
 * How many free producers the opening hand should ideally hold. It follows the deck: a hand wants about twice the
 * share of producers a random one would hold (10 in 30 cards asks for 3, 7 asks for 2, 3 asks for 1), never more than 3.
 */
export const idealOpeningProducers = (producers: number, deckSize: number) =>
  producers === 0
    ? 0
    : Math.max(1, Math.min(3, Math.round((producers / deckSize) * OPENING_HAND * 1.8)));
/** Opening hands are weighted, not fair: shuffle three times and keep the library whose first hand is closest to the ideal. */
function weightedShuffle(state: GameState, ids: string[], registry: Registry): string[] {
  const free = ids.filter((id) =>
    isFreeProducer(registry.cards[state.cards[id].definitionId], registry),
  ).length;
  const ideal = idealOpeningProducers(free, ids.length);
  let best: string[] | null = null,
    bestGap = Infinity;
  for (let attempt = 0; attempt < 3; attempt++) {
    const candidate = shuffle(state, ids);
    const held = candidate
      .slice(-OPENING_HAND)
      .filter((id) =>
        isFreeProducer(registry.cards[state.cards[id].definitionId], registry),
      ).length;
    if (Math.abs(held - ideal) < bestGap) {
      best = candidate;
      bestGap = Math.abs(held - ideal);
    }
  }
  return best!;
}
/** `mulligan` lets each player replace up to two opening cards, player one first. */
export function createMatch(
  registry: Registry,
  decks: [string[], string[]],
  seed = 731,
  options: {
    mulligan?: boolean;
    /** Decks come from a draft: copy limits other than the legendary one are waived. */ draft?: boolean;
    /** Fixed card order per library, applied after the shuffle. Used by the tutorial. */ stack?: [
      string[],
      string[],
    ];
  } = {},
): GameState {
  for (const deck of decks)
    requireRule(
      !validateDeck(deck, registry, { draft: options.draft }).length,
      validateDeck(deck, registry, { draft: options.draft }).join(" "),
    );
  const state: GameState = {
    rulesVersion: RULES_VERSION,
    contentVersion: registry.version,
    seed: seed >>> 0,
    rng: seed >>> 0 || 1,
    revision: 0,
    sequence: 0,
    turn: 1,
    active: "p1",
    phase: "play",
    players: { p1: blankPlayer("p1", "Player one"), p2: blankPlayer("p2", "Player two") },
    cards: {},
    combat: null,
    responseStep: null,
    pending: null,
    outcome: null,
    outcomeReason: null,
    events: [],
  };
  decks.forEach((deck, index) => {
    const player: PlayerId = index === 0 ? "p1" : "p2";
    deck.forEach((definitionId, i) => {
      const id = `${player}-${i}`;
      state.cards[id] = {
        id,
        definitionId,
        owner: player,
        controller: player,
        zone: "deck",
        slot: null,
        exhausted: false,
        damage: 0,
      };
      state.players[player].deck.push(id);
    });
    state.players[player].deck = options.stack?.[index]?.length
      ? shuffle(state, state.players[player].deck)
      : weightedShuffle(state, state.players[player].deck, registry);
    // Tutorial control: `stack` lists the cards to draw first, in order (opening hand, then mulligan and turn draws).
    const taken: string[] = [];
    for (const definitionId of options.stack?.[index] ?? []) {
      const id = state.players[player].deck.find(
        (candidate) =>
          state.cards[candidate].definitionId === definitionId && !taken.includes(candidate),
      );
      requireRule(id, `Cannot stack ${definitionId}: not enough copies in the deck.`);
      taken.push(id!);
    }
    if (taken.length)
      state.players[player].deck = [
        ...state.players[player].deck.filter((id) => !taken.includes(id)),
        ...taken.reverse(),
      ];
  });
  const tx = new Transaction(state, registry);
  tx.draw("p1", 5);
  tx.draw("p2", 5);
  tx.emit("turn.started", "Player one begins. First draw phase is skipped.");
  tx.emit("phase.started", "Play phase begins.");
  if (options.mulligan) {
    tx.emit(
      "mulligan.started",
      `Opening hands: ${state.players.p1.name} may replace up to ${MULLIGAN_MAX} cards first.`,
    );
    state.pending = {
      id: `mulligan-${state.sequence}`,
      player: "p1",
      kind: "mulligan",
      options: [...state.players.p1.hand],
      max: MULLIGAN_MAX,
    };
  }
  return state;
}
class Transaction {
  queue: {
    order: InternalOrder;
    effect?: { cardId: string; abilityId: string; target?: string; event: GameEvent };
  }[] = [];
  budget = 256;
  inCombat = false;
  /** Deaths outside combat on the inactive player's side, waiting to open a response step. */ fresh: DeadSnapshot[] =
    [];
  target?: string;
  slot?: number;
  constructor(
    public state: GameState,
    public registry: Registry,
  ) {}
  context(source: CardInstance, event: GameEvent, abilityId?: string): HookContext {
    return {
      state: this.state,
      registry: this.registry,
      source,
      event,
      target: this.target,
      slot: this.slot,
      issue: (order) => {
        // Attribute announced ability effects without exposing private draw identities or parsing log prose.
        const effect =
          abilityId && this.registry.abilities[abilityId].announce
            ? {
                event,
                cardId: source.id,
                abilityId,
                target:
                  "target" in order
                    ? order.target
                    : event.type === "creature.destroyed"
                      ? event.cardId
                      : undefined,
              }
            : undefined;
        this.queue.push({ order, effect });
      },
    };
  }
  sources(event?: GameEvent): CardInstance[] {
    const sources = [this.state.active, other(this.state.active)].flatMap((p) =>
      this.state.players[p].board
        .filter((id): id is string => !!id)
        .map((id) => this.state.cards[id]),
    );
    if (event?.snapshot && !sources.some((c) => c.id === event.snapshot!.id))
      sources.push(event.snapshot);
    return sources.sort(
      (a, b) =>
        Number(a.controller !== this.state.active) - Number(b.controller !== this.state.active) ||
        (a.slot ?? 5) - (b.slot ?? 5) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  }
  emit(type: string, message: string, data: Partial<GameEvent> = {}) {
    const event: GameEvent = {
      seq: ++this.state.sequence,
      type,
      message,
      visibility: "public",
      ...data,
    };
    this.state.events.push(event);
    for (const source of this.sources(event)) {
      const bindings = [...this.registry.cards[source.definitionId].abilities].sort((a, b) =>
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
      );
      for (const binding of bindings)
        this.registry.abilities[binding.id].hooks?.[type]?.(
          this.context(source, event, binding.id),
          binding.params,
        );
    }
    return event;
  }
  before(type: string, source: CardInstance, payload: BeforePayload): BeforePayload {
    const event: GameEvent = {
      seq: this.state.sequence,
      type,
      message: "",
      cardId: source.id,
      visibility: "public",
    };
    let result = payload;
    for (const binding of [...this.registry.cards[source.definitionId].abilities].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    )) {
      result =
        this.registry.abilities[binding.id].before?.[type]?.(
          this.context(source, event, binding.id),
          binding.params,
          result,
        ) ?? result;
    }
    return result;
  }
  draw(player: PlayerId, amount: number, zone: "hand" | "choice" = "hand"): string[] {
    const p = this.state.players[player],
      drawn: string[] = [];
    for (let i = 0; i < amount && !this.state.outcome; i++) {
      if (!p.deck.length) {
        this.emptyLibrary(player);
        break;
      }
      const id = p.deck.pop()!;
      this.state.cards[id].zone = zone;
      if (zone === "hand") p.hand.push(id);
      drawn.push(id);
      this.emit(
        "card.drawn",
        `Drew ${this.registry.cards[this.state.cards[id].definitionId].name}.`,
        { player, cardId: id, visibility: player },
      );
      if (!p.deck.length) this.emptyLibrary(player);
    }
    return drawn;
  }
  detach(card: CardInstance) {
    const p = this.state.players[card.owner];
    if (card.zone === "board") {
      this.state.players[card.controller].board[card.slot!] = null;
      // A choice opened earlier in the same resolution (kindle, before its spell finishes) must not offer a card that left.
      const open = this.state.pending;
      if (open?.kind === "damage-target")
        open.options = open.options.filter((id) => id !== card.id);
    } else if (card.zone === "hand") p.hand = p.hand.filter((id) => id !== card.id);
    else if (card.zone === "discard") p.discard = p.discard.filter((id) => id !== card.id);
    else if (card.zone === "deck") p.deck = p.deck.filter((id) => id !== card.id);
    card.slot = null;
  }
  deploy(card: CardInstance, player: PlayerId, slot: number, ready = false) {
    requireRule(
      (card.zone === "hand" || card.zone === "discard") &&
        card.owner === player &&
        card.controller === player,
      "Deploy a field card from your own hand or discard pile.",
    );
    const def = definition(this.state, card.id, this.registry);
    requireRule(def.type !== "spell", "Only creatures and holdings can be deployed.");
    requireRule(
      Number.isInteger(slot) &&
        slot >= 0 &&
        slot < battlefieldPositions.length &&
        this.state.players[player].board[slot] === null,
      "Choose a free battlefield position.",
    );
    this.detach(card);
    card.zone = "board";
    card.slot = slot;
    this.state.players[player].board[slot] = card.id;
    card.exhausted =
      this.before(def.type === "holding" ? "holding.enter.before" : "creature.enter.before", card, {
        exhausted: !ready,
      }).exhausted ?? !ready;
    this.emit(
      "card.played",
      `${this.state.players[player].name} plays ${def.name} in ${positionName(slot)}.`,
      { player, cardId: card.id },
    );
    this.emit(
      def.type === "holding" ? "holding.entered" : "creature.entered",
      `${def.name} enters ${card.exhausted ? "exhausted" : "ready"}.`,
      { cardId: card.id },
    );
  }
  discard(id: string) {
    const card = this.state.cards[id];
    this.detach(card);
    card.zone = "discard";
    card.damage = 0;
    delete card.attackBonus;
    delete card.defenseBonus;
    card.exhausted = false;
    this.state.players[card.owner].discard.push(id);
  }
  destroy(id: string) {
    const card = this.state.cards[id];
    if (!card || card.zone !== "board") return;
    const snapshot = { ...card };
    // A creature leaves response energy for its owner, on any turn and whatever killed it.
    if (definition(this.state, id, this.registry).type === "creature") {
      const outputs = structuredClone(this.registry.cards[card.definitionId].stats!.energyOutputs);
      if (outputs.length) this.fresh.push({ card: snapshot, outputs });
    }
    this.discard(id);
    this.emit(
      definition(this.state, id, this.registry).type === "holding"
        ? "holding.destroyed"
        : "creature.destroyed",
      `${this.registry.cards[card.definitionId].name} is destroyed.`,
      { cardId: id, player: snapshot.controller, snapshot },
    );
  }
  stateChecks() {
    for (const p of [this.state.players.p1, this.state.players.p2])
      for (const id of p.board) {
        if (
          id &&
          this.state.cards[id].damage >= effectiveStats(this.state, id, this.registry).defense
        )
          this.destroy(id);
      }
  }
  sourceNote(source?: string) {
    const card = source ? this.state.cards[source] : undefined;
    return card ? ` from ${this.registry.cards[card.definitionId].name}` : "";
  }
  dealDamage(order: Extract<InternalOrder, { type: "damage" }>) {
    requireRule(Number.isInteger(order.amount) && order.amount >= 0, "Invalid damage amount.");
    if (order.target === "p1" || order.target === "p2") {
      this.state.players[order.target].life -= order.amount;
      this.emit(
        "damage.dealt",
        `${this.state.players[order.target].name} takes ${order.amount} damage${this.sourceNote(order.source)}.`,
        { target: order.target, amount: order.amount },
      );
    } else {
      const card = this.state.cards[order.target];
      if (card?.zone === "board") {
        const amount =
          this.before("damage.before", card, { amount: order.amount }).amount ?? order.amount;
        requireRule(Number.isInteger(amount) && amount >= 0, "Invalid damage modifier.");
        card.damage += amount;
        this.emit(
          "damage.dealt",
          `${this.registry.cards[card.definitionId].name} takes ${amount} damage${this.sourceNote(order.source)}.`,
          { target: card.id, cardId: card.id, amount },
        );
      }
    }
  }
  drain() {
    if (this.state.outcome) {
      this.queue = [];
      return;
    }
    this.stateChecks();
    while (this.queue.length && !this.state.outcome) {
      requireRule(--this.budget > 0, "RESOLUTION_LIMIT: extension chain exceeded 256 operations.");
      const { order, effect } = this.queue.shift()!;
      if (order.type === "damage") this.dealDamage(order);
      else if (order.type === "boost") {
        const card = this.state.cards[order.target];
        requireRule(
          !!card &&
            card.zone === "board" &&
            this.registry.cards[card.definitionId].type === "creature",
          "Only a creature on the field can be strengthened.",
        );
        for (const amount of [order.attack ?? 0, order.defense ?? 0])
          requireRule(
            Number.isSafeInteger(amount) && amount >= 0 && amount <= 100,
            "Invalid stat bonus.",
          );
        if (order.attack) card.attackBonus = (card.attackBonus ?? 0) + order.attack;
        if (order.defense) card.defenseBonus = (card.defenseBonus ?? 0) + order.defense;
        this.emit(
          "creature.boosted",
          `${this.registry.cards[card.definitionId].name} gets ${[order.attack ? `+${order.attack} Attack` : "", order.defense ? `+${order.defense} Defense` : ""].filter(Boolean).join(" and ")} until end of turn.`,
          { cardId: card.id, amount: (order.attack ?? 0) + (order.defense ?? 0) },
        );
      } else if (order.type === "heal") {
        requireRule(Number.isInteger(order.amount) && order.amount >= 0, "Invalid heal amount.");
        this.state.players[order.target].life += order.amount;
        this.emit(
          "life.restored",
          `${this.state.players[order.target].name} restores ${order.amount} life.`,
          { target: order.target, amount: order.amount },
        );
      } else if (order.type === "draw") {
        requireRule(
          Number.isInteger(order.amount) && order.amount >= 0 && order.amount <= 100,
          "Invalid draw amount.",
        );
        this.draw(order.player, order.amount);
      } else if (order.type === "damage-pick") {
        requireRule(order.player === "p1" || order.player === "p2", "Invalid damage chooser.");
        requireRule(
          Number.isSafeInteger(order.amount) && order.amount >= 0 && order.amount <= 100,
          "Invalid damage amount.",
        );
        const foe = other(order.player),
          source = this.state.cards[order.source];
        // Only one choice can be open at a time; any further one simply hits the enemy player.
        if (this.state.pending || !source)
          this.dealDamage({
            type: "damage",
            target: foe,
            amount: order.amount,
            source: order.source,
          });
        else
          this.state.pending = {
            id: `damage-${this.state.sequence}`,
            player: order.player,
            kind: "damage-target",
            options: [...this.state.players[foe].board.filter((id): id is string => !!id), foe],
            amount: order.amount,
            source: order.source,
            sourceName: this.registry.cards[source.definitionId].name,
          };
      } else if (order.type === "ransack") {
        requireRule(order.player === "p1" || order.player === "p2", "Invalid ransack player.");
        const me = this.state.players[order.player],
          foe = this.state.players[other(order.player)];
        const sourceName = order.source
          ? this.registry.cards[this.state.cards[order.source].definitionId].name
          : "Ransack";
        if (!foe.hand.length)
          this.emit("hand.inspected", `${me.name} looks at ${foe.name}'s empty hand.`, {
            player: order.player,
            cardId: order.source,
          });
        // A second choice cannot open while one is pending; it simply finds nothing to take.
        else if (!this.state.pending) {
          this.state.pending = {
            id: `ransack-${this.state.sequence}`,
            player: order.player,
            kind: "hand-discard",
            options: [...foe.hand],
            sourceName,
          };
          this.emit("hand.inspected", `${me.name} looks at ${foe.name}'s hand.`, {
            player: order.player,
            cardId: order.source,
          });
        }
      } else if (order.type === "search") {
        requireRule(order.player === "p1" || order.player === "p2", "Invalid search player.");
        const wanted = this.registry.cards[order.card];
        requireRule(!!wanted, "Unknown card to search for.");
        const p = this.state.players[order.player];
        const found = p.deck.filter((id) => this.state.cards[id].definitionId === order.card);
        if (!found.length)
          this.emit("card.searched", `${p.name} finds no ${wanted.name} in the library.`, {
            player: order.player,
            cardId: order.source,
          });
        p.deck = p.deck.filter((id) => !found.includes(id));
        for (const id of found) {
          this.state.cards[id].zone = "hand";
          p.hand.push(id);
          this.emit("card.searched", `${p.name} musters ${wanted.name} from the library.`, {
            player: order.player,
            cardId: id,
          });
        }
      } else if (order.type === "search-subtype" || order.type === "search-cost") {
        requireRule(order.player === "p1" || order.player === "p2", "Invalid search player.");
        if (order.type === "search-subtype")
          requireRule(!!order.subtype, "Missing subtype to search for.");
        else
          requireRule(Number.isInteger(order.maxCost) && order.maxCost >= 0, "Invalid cost limit.");
        const p = this.state.players[order.player];
        const matches = (id: string) => {
          const def = this.registry.cards[this.state.cards[id].definitionId];
          if (order.type === "search-subtype")
            return def.type === "creature" && def.subtypes.includes(order.subtype);
          const total =
            def.cost.generic + Object.values(def.cost.factions).reduce((sum, n) => sum + n, 0);
          return def.type !== "spell" && total <= order.maxCost;
        };
        // The top of the library is the end of the array.
        const found = p.deck.filter(matches).reverse();
        const what =
          order.type === "search-subtype"
            ? order.subtype
            : `creature or holding costing ${order.maxCost} or less`;
        const sourceName = order.source
          ? this.registry.cards[this.state.cards[order.source].definitionId].name
          : "Search";
        if (!found.length)
          this.emit("card.searched", `${p.name} finds no ${what} in the library.`, {
            player: order.player,
            cardId: order.source,
          });
        // A second choice cannot open while one is pending; the topmost match is taken instead.
        else if (order.first || this.state.pending) {
          const id = found[0];
          p.deck.splice(p.deck.indexOf(id), 1);
          this.state.cards[id].zone = "hand";
          p.hand.push(id);
          // The card may be one the open choice still offers: swap in another copy, or drop the option.
          const open = this.state.pending;
          if (open?.kind === "library-pick" && open.options.includes(id)) {
            const copy = found.find(
              (other) =>
                other !== id &&
                p.deck.includes(other) &&
                this.state.cards[other].definitionId === this.state.cards[id].definitionId,
            );
            open.options = copy
              ? open.options.map((option) => (option === id ? copy : option))
              : open.options.filter((option) => option !== id);
            if (!open.options.length) this.state.pending = null;
          }
          this.emit(
            "card.searched",
            `${p.name} finds ${this.registry.cards[this.state.cards[id].definitionId].name} in the library.`,
            { player: order.player, cardId: id },
          );
        } else {
          // One entry per distinct card, cheapest first, so the choice does not reveal the library order.
          const price = (id: string) => {
            const cost = this.registry.cards[this.state.cards[id].definitionId].cost;
            return cost.generic + Object.values(cost.factions).reduce((sum, n) => sum + n, 0);
          };
          const seen = new Set<string>();
          const options = found
            .filter((id) => {
              const key = this.state.cards[id].definitionId;
              return seen.has(key) ? false : (seen.add(key), true);
            })
            .sort((a, b) => {
              const da = this.registry.cards[this.state.cards[a].definitionId],
                db = this.registry.cards[this.state.cards[b].definitionId];
              return price(a) - price(b) || (da.name < db.name ? -1 : da.name > db.name ? 1 : 0);
            });
          this.state.pending = {
            id: `search-${this.state.sequence}`,
            player: order.player,
            kind: "library-pick",
            options,
            sourceName,
          };
          this.emit("card.searched", `${p.name} searches the library.`, {
            player: order.player,
            cardId: order.source,
          });
        }
      } else if (order.type === "mill") {
        requireRule(
          Number.isInteger(order.amount) && order.amount >= 0 && order.amount <= 100,
          "Invalid mill amount.",
        );
        const p = this.state.players[order.player];
        // The last card stays: only drawing it can empty a library.
        for (let i = 0; i < order.amount && p.deck.length > 1; i++) {
          const id = p.deck[p.deck.length - 1];
          this.discard(id);
          this.emit(
            "card.discarded",
            `${this.registry.cards[this.state.cards[id].definitionId].name} is put into the discard pile from the library.`,
            { player: order.player, cardId: id },
          );
        }
      } else if (order.type === "gain-energy") {
        requireRule(order.player === "p1" || order.player === "p2", "Invalid energy recipient.");
        requireRule(
          this.state.phase === "play" || inResponseStep(this.state),
          "Energy spells require a casting phase.",
        );
        for (const [color, amount] of Object.entries(order.output))
          requireRule(
            this.registry.energyTypes.includes(color) &&
              Number.isSafeInteger(amount) &&
              amount >= 0,
            "Invalid generated energy.",
          );
        const player = this.state.players[order.player];
        addEnergy(inResponseStep(this.state) ? player.responseEnergy : player.energy, order.output);
        const source = order.source ? this.state.cards[order.source] : undefined;
        this.emit(
          "energy.generated",
          `${source ? this.registry.cards[source.definitionId].name : player.name} generates energy.`,
          {
            player: order.player,
            cardId: source?.id,
            amount: Object.values(order.output).reduce((sum, value) => sum + value, 0),
          },
        );
      } else if (order.type === "deploy") {
        requireRule(
          !this.state.pending &&
            ((this.state.phase === "play" && this.state.active === order.player) ||
              (inResponseStep(this.state) && decisionPlayer(this.state) === order.player)),
          "Deploy while you can cast spells.",
        );
        const card = this.state.cards[order.target];
        requireRule(card, "Select a card to deploy.");
        // The activation's hand target is not an on-entry damage target.
        const previousTarget = this.target;
        this.target = undefined;
        this.deploy(card, order.player, order.slot, order.ready);
        this.target = previousTarget;
      } else if (order.type === "destroy") this.destroy(order.target);
      else if (order.type === "reprise") {
        requireRule(order.player === "p1" || order.player === "p2", "Invalid reprise player.");
        const options = repriseChoices(this.state, order.player, this.registry);
        // Nothing to cast, or another choice already waiting: the effect does nothing.
        if (options.length && !this.state.pending)
          this.state.pending = {
            id: `reprise-${this.state.sequence}`,
            player: order.player,
            kind: "reprise",
            options,
            sourceName: order.source
              ? this.registry.cards[this.state.cards[order.source].definitionId].name
              : "Reprise",
          };
      } else if (order.type === "ready") {
        const card = this.state.cards[order.target];
        if (card?.zone === "board" && card.exhausted) {
          card.exhausted = false;
          this.emit("card.readied", `${this.registry.cards[card.definitionId].name} is readied.`, {
            cardId: card.id,
          });
        }
      } else if (order.type === "return") {
        const card = this.state.cards[order.target];
        if (card?.zone === "board") {
          this.detach(card);
          card.zone = "hand";
          card.damage = 0;
          delete card.attackBonus;
          delete card.defenseBonus;
          card.exhausted = false;
          card.controller = card.owner;
          this.state.players[card.owner].hand.push(card.id);
          this.emit(
            "card.returned",
            `${this.registry.cards[card.definitionId].name} returns to hand.`,
            { cardId: card.id },
          );
        }
      }
      if (effect) {
        const { event, ...attribution } = effect;
        // Decorate the committed cause instead of adding an event: choice IDs and old replays retain their sequence.
        (event.effects ??= []).push(attribution);
      }
      if (!this.state.outcome) this.stateChecks();
    }
  }
  finish(
    outcome: NonNullable<GameState["outcome"]>,
    reason: NonNullable<GameState["outcomeReason"]>,
    message: string,
  ) {
    if (this.state.outcome) return;
    this.state.outcome = outcome;
    this.state.outcomeReason = reason;
    // Terminal turn draws must not leave unlocated choice cards or an active
    // choice dialog. Preserve their private identities in their owners' hands.
    for (const card of Object.values(this.state.cards))
      if (card.zone === "choice") {
        card.zone = "hand";
        this.state.players[card.owner].hand.push(card.id);
      }
    this.state.pending = null;
    this.emit("game.ended", message);
    this.queue = []; // Library depletion ends resolution immediately.
  }
  emptyLibrary(player: PlayerId) {
    this.finish(
      other(player),
      "empty-library",
      `${this.state.players[player].name} loses: their library is empty.`,
    );
  }
  checkOutcome() {
    const p1 = this.state.players.p1.life <= 0,
      p2 = this.state.players.p2.life <= 0;
    if ((p1 || p2) && !this.state.outcome) {
      const outcome = p1 && p2 ? "draw" : p1 ? "p2" : "p1";
      this.finish(
        outcome,
        "life",
        outcome === "draw"
          ? "The match ends in a draw."
          : `${this.state.players[outcome].name} wins.`,
      );
    }
  }
  /** Gives `player` the energy of their fallen creatures. A creature with two outputs asks which one first. */
  responseOutputs(player: PlayerId, dead: DeadSnapshot[]) {
    const p = this.state.players[player];
    for (let i = 0; i < dead.length; i++) {
      const snapshot = dead[i];
      if (!snapshot.outputs.length) continue;
      if (snapshot.outputs.length === 1) addEnergy(p.responseEnergy, snapshot.outputs[0]);
      else {
        this.state.pending = {
          id: `choice-${this.state.sequence}-${i}`,
          player,
          kind: "response-energy",
          options: snapshot.outputs,
          sourceName: this.registry.cards[snapshot.card.definitionId].name,
          remaining: dead.slice(i + 1),
        };
        return;
      }
    }
    this.emit("response.opened", `${p.name} may cast response spells, then close the window.`, {
      player,
    });
  }
  /** Opens the next waiting window. False when nobody is waiting. */
  openWindow(): boolean {
    const next = this.state.responseQueue?.shift();
    if (!next) {
      this.state.responseStep = null;
      return false;
    }
    this.state.responseStep = next.player;
    this.responseOutputs(next.player, next.dead);
    return true;
  }
  /** The window's owner is done: their response energy expires, then the next player's window opens, or play resumes. */
  closeWindow() {
    const player = this.state.responseStep!;
    this.state.players[player].responseEnergy = {};
    this.state.responseStep = null;
    this.emit("response.closed", "Response energy expires.", { player });
    if (this.openWindow() || this.state.outcome) return;
    if (this.state.combat?.stage === "response") {
      this.state.phase = "end";
      this.state.combat = null;
      this.emit("phase.started", "End phase. Ready your surviving field cards and pass the turn.");
    }
  }
  /** Deaths from one action are gathered, then each owner gets one window: the active player first. Deaths inside a window add to its pool. */
  settleDeaths() {
    const dead = this.fresh;
    this.fresh = [];
    if (!dead.length || this.state.outcome) return;
    const queue = (this.state.responseQueue ??= []),
      window = this.state.responseStep,
      inside: DeadSnapshot[] = [];
    for (const entry of dead) {
      const owner = entry.card.controller;
      if (owner === window) {
        inside.push(entry);
        continue;
      }
      const waiting = queue.find((item) => item.player === owner);
      if (waiting) waiting.dead.push(entry);
      else queue.push({ player: owner, dead: [entry] });
    }
    if (!window)
      queue.sort(
        (x, y) => Number(y.player === this.state.active) - Number(x.player === this.state.active),
      );
    if (inside.length) this.responseOutputs(window!, inside);
    if (!window) this.openWindow();
  }
  combat() {
    const combat = this.state.combat!,
      assignments = combat.blocks;
    this.emit("combat.confirmed", "The attacker confirms combat.", { player: this.state.active });
    this.inCombat = true;
    for (const a of assignments)
      this.emit(
        definition(this.state, a.blocker, this.registry).type === "holding"
          ? "holding.blocked"
          : "creature.blocked",
        `${definition(this.state, a.blocker, this.registry).name} blocks ${definition(this.state, a.attacker, this.registry).name}.`,
        { cardId: a.blocker, target: a.attacker },
      );
    this.drain();
    for (const id of combat.attackers) {
      if (this.state.outcome) break;
      if (this.state.cards[id].zone !== "board") continue;
      // Apply both sides' hits before death checks or queued triggers. A
      // declared block still prevents spillover if its blocker disappeared.
      for (const order of combatDamage(this.state, id, assignments, this.registry))
        this.dealDamage(order);
      this.drain();
    }
    this.inCombat = false;
    this.checkOutcome();
    if (this.state.outcome) return;
    // Fallen creatures open their owners' response steps as soon as this action ends.
    if (this.fresh.length) combat.stage = "response";
    else {
      this.state.phase = "end";
      this.state.combat = null;
      this.emit("phase.started", "End phase. Ready your surviving field cards and pass the turn.");
    }
  }
}
/** Targets of a ranged deployment effect for a card entering `slot`: enemy creatures in its own and the two neighbouring lanes, plus the enemy player. */
export function reachTargets(
  state: Pick<GameState, "cards" | "players">,
  actor: PlayerId,
  slot: number,
  registry: Registry,
): string[] {
  const foe = other(actor);
  return [
    ...reachableLanes(slot).flatMap((lane) => {
      const id = state.players[foe].board[lane];
      return id && definition(state, id, registry).type === "creature" ? [id] : [];
    }),
    foe,
  ];
}
function targetOptions(
  state: GameState,
  actor: PlayerId,
  bindings: AbilityBinding[],
  registry: Registry,
  /** The card using an activated ability, so a target may exclude it. */
  sourceId?: string,
): { targets: string[]; required: boolean } {
  let targets: string[] | null = null;
  for (const b of bindings) {
    const extension = registry.abilities[b.id],
      kind = extension.target;
    if (!kind) continue;
    const params = { ...extension.defaults, ...b.params };
    const side =
      kind === "friendly-creature" ||
      kind === "friendly-discard-creature" ||
      kind === "friendly-field" ||
      kind === "friendly-hand-field"
        ? actor
        : other(actor);
    const options =
      kind === "friendly-discard-creature"
        ? state.players[actor].discard.filter((id) => {
            const def = definition(state, id, registry);
            return (
              def.type === "creature" &&
              (typeof b.params?.subtype !== "string" || def.subtypes.includes(b.params.subtype))
            );
          })
        : kind === "energy-type"
          ? registry.energyTypes.filter((color) => color !== "neutral")
          : kind === "friendly-hand-field"
            ? state.players[actor].hand.filter(
                (id) => definition(state, id, registry).type !== "spell",
              )
            : (kind === "any-creature"
                ? [
                    ...((extension.targetSides?.(params) ?? ["friendly", "enemy"]).includes(
                      "friendly",
                    )
                      ? state.players[actor].board
                      : []),
                    ...((extension.targetSides?.(params) ?? ["friendly", "enemy"]).includes("enemy")
                      ? state.players[other(actor)].board
                      : []),
                  ]
                : state.players[side].board
              ).filter(
                (id): id is string =>
                  !!id &&
                  !(extension.targetOthers && id === sourceId) &&
                  (!(
                    kind === "friendly-creature" ||
                    kind === "enemy-creature" ||
                    kind === "any-creature" ||
                    kind === "enemy-reach"
                  ) ||
                    definition(state, id, registry).type === "creature") &&
                  (extension.targetFilter?.(definition(state, id, registry), params) ?? true),
              );
    if (kind === "enemy-any" || kind === "enemy-reach") options.push(other(actor));
    targets = targets === null ? options : targets.filter((id) => options.includes(id));
  }
  return { targets: targets ?? [], required: targets !== null && targets.length > 0 };
}
/** Spells in the player's discard pile that could be cast for free right now: one per distinct card, and only if the engine would let the player play it. */
function repriseChoices(state: GameState, actor: PlayerId, registry: Registry): string[] {
  const seen = new Set<string>(),
    options: string[] = [];
  for (const id of state.players[actor].discard) {
    const def = registry.cards[state.cards[id].definitionId];
    if (def.type !== "spell" || seen.has(def.id)) continue;
    const probe = { ...state, pending: null, freeCast: { player: actor, cardId: id } };
    if (!legalActions(probe, registry).playable.some((a) => a.cardId === id)) continue;
    seen.add(def.id);
    options.push(id);
  }
  return options;
}
function playPayload(state: GameState, card: CardInstance, registry: Registry) {
  // A free cast pays nothing, not even additional costs.
  if (state.freeCast?.cardId === card.id)
    return { cost: { generic: 0, factions: {} }, consume: false };
  return new Transaction(state, registry).before("card.play.before", card, {
    cost: structuredClone(registry.cards[card.definitionId].cost),
    consume: false,
  });
}
export function legalActions(state: GameState, registry: Registry): LegalActions {
  const actor = decisionPlayer(state),
    legal: LegalActions = {
      actor,
      playable: [],
      energy: [],
      activations: [],
      attackers: [],
      lanes: {},
      canEnd: false,
    };
  if (state.outcome || state.pending) return legal;
  const p = state.players[actor];
  if (state.phase === "play" || inResponseStep(state)) {
    const inResponse = inResponseStep(state);
    // A spell being cast for free is the only thing the player can do.
    for (const id of state.freeCast ? [state.freeCast.cardId] : p.hand) {
      const card = state.cards[id],
        def = registry.cards[card.definitionId];
      if (inResponse && (def.type !== "spell" || !def.timing!.includes("response"))) continue;
      if (!inResponse && def.type === "spell" && !def.timing!.includes("play")) continue;
      const payload = playPayload(state, card, registry);
      if (!autoPayment(inResponse ? p.responseEnergy : p.energy, payload.cost!)) continue;
      const slots = p.board.map((id, i) => (id === null ? i : -1)).filter((i) => i >= 0);
      // Consume sacrifices a creature that produces at least the required energy (its best single output).
      const costOf = (cardId: string) => {
        const cost = definition(state, cardId, registry).cost;
        return (
          cost.generic + Object.values(cost.factions ?? {}).reduce((sum, n) => sum + (n ?? 0), 0)
        );
      };
      const consumes = payload.consume
        ? p.board.filter(
            (id): id is string =>
              !!id &&
              definition(state, id, registry).type === "creature" &&
              costOf(id) >= (payload.consumeMin ?? 0),
          )
        : [];
      if (payload.consume && !consumes.length) continue;
      if (def.type !== "spell" && !slots.length && !consumes.length) continue;
      const printed = def.abilities.filter((b) => !registry.abilities[b.id].activate);
      // A modal spell offers each mode with its own targets and positions; only modes that can resolve now are listed.
      if (def.type === "spell" && def.modal) {
        const modes = (def.cast ?? []).flatMap((binding, mode) => {
          const extension = registry.abilities[binding.id],
            options = targetOptions(state, actor, [...printed, binding], registry);
          if (extension.target && !options.targets.length) return [];
          if (extension.placement && !slots.length) return [];
          return [
            {
              mode,
              targets: options.targets,
              requiresTarget: options.required,
              slots: extension.placement ? slots : [],
            },
          ];
        });
        if (!modes.length) continue;
        legal.playable.push({
          cardId: id,
          slots: [],
          targets: [],
          requiresTarget: false,
          consumes,
          ...(payload.returns ? { returns: true } : {}),
          modes,
        });
        continue;
      }
      const targeting = targetOptions(state, actor, [...printed, ...(def.cast ?? [])], registry);
      // Required spell targets cannot disappear into an illegal target-free cast.
      if (
        def.type === "spell" &&
        def.cast?.some((b) => registry.abilities[b.id].target) &&
        !targeting.targets.length
      )
        continue;
      if (
        def.type === "spell" &&
        def.cast?.some((b) => registry.abilities[b.id].placement) &&
        !slots.length
      )
        continue;
      const reach =
        def.type !== "spell" &&
        def.abilities.some((b) => registry.abilities[b.id].target === "enemy-reach");
      legal.playable.push({
        cardId: id,
        slots,
        targets: targeting.targets,
        requiresTarget: targeting.required,
        consumes,
        ...(payload.returns ? { returns: true } : {}),
        ...(reach
          ? {
              slotTargets: Object.fromEntries(
                p.board.map((_, position) => [
                  position,
                  reachTargets(state, actor, position, registry),
                ]),
              ),
            }
          : {}),
      });
    }
    if (!inResponse && !state.freeCast)
      for (const id of p.board) {
        if (!id) continue;
        const spent = state.cards[id].exhausted;
        const def = definition(state, id, registry);
        if (!spent && def.type === "creature" && def.stats!.energyOutputs.length)
          legal.energy.push({ cardId: id, options: def.stats!.energyOutputs });
        def.abilities.forEach((binding, ability) => {
          // An exhausted card can only use abilities that do not exhaust it.
          if (spent && registry.abilities[binding.id].exhausts !== false) return;
          if (
            !registry.abilities[binding.id].activate ||
            registry.abilities[binding.id].canActivate?.(
              state.cards[id],
              state,
              binding.params,
              registry,
            ) === false
          )
            return;
          const targeting = targetOptions(state, actor, [binding], registry, id);
          if (registry.abilities[binding.id].target && !targeting.targets.length) return;
          const slots = registry.abilities[binding.id].placement
            ? p.board.flatMap((id, slot) => (id === null ? [slot] : []))
            : undefined;
          if (slots && !slots.length) return;
          legal.activations.push({
            cardId: id,
            ability,
            targets: targeting.targets,
            requiresTarget: targeting.required,
            ...(slots ? { slots } : {}),
            ...(registry.abilities[binding.id].activationEnergy
              ? {
                  energyOptions: registry.abilities[binding.id].activationEnergy!(
                    binding.params,
                    registry,
                  ),
                }
              : {}),
          });
        });
      }
    legal.canEnd = !state.freeCast;
  } else if (state.phase === "attack" && state.combat?.stage === "declare") {
    legal.attackers = p.board.filter(
      (id): id is string =>
        !!id && !state.cards[id].exhausted && definition(state, id, registry).type === "creature",
    );
    legal.lanes = Object.fromEntries(
      legal.attackers.map((id) => [id, reachableLanes(state.cards[id].slot)]),
    );
    legal.canEnd = true;
  } else if (state.phase === "end") legal.canEnd = true;
  return legal;
}
export function apply(
  state: GameState,
  envelope: CommandEnvelope,
  registry: Registry,
): { state: GameState; events: GameEvent[]; error?: string } {
  try {
    v.parse(commandSchema, envelope.command);
    requireRule(state.rulesVersion === RULES_VERSION, "Rules version differs from this engine.");
    requireRule(
      state.contentVersion === registry.version,
      "Content version differs from the pinned match.",
    );
    requireRule(
      envelope.expectedRevision === state.revision,
      "Stale command. Refresh the match before acting.",
    );
    requireRule(!state.outcome, "This match has ended.");
    const conceding = envelope.command.type === "concede";
    requireRule(conceding || envelope.actor === decisionPlayer(state), "It is not your decision.");
    requireRule(
      conceding ||
        !state.pending ||
        envelope.command.type === (state.pending.kind === "mulligan" ? "mulligan" : "choose"),
      "Resolve the pending choice first.",
    );
    const next = structuredClone(state),
      tx = new Transaction(next, registry),
      p = next.players[envelope.actor],
      command = envelope.command;
    if (command.type === "concede") {
      requireRule(envelope.actor === "p1" || envelope.actor === "p2", "Only a player can concede.");
      next.responseStep = null;
      next.responseQueue = [];
      next.combat = null;
      tx.finish(
        other(envelope.actor),
        "concede",
        `${p.name} concedes. ${next.players[other(envelope.actor)].name} wins.`,
      );
    } else if (command.type === "mulligan") {
      const choice = next.pending;
      requireRule(
        choice?.kind === "mulligan" && choice.player === envelope.actor,
        "No opening-hand choice is pending.",
      );
      const ids = command.cardIds,
        max = (choice as { max: number }).max;
      requireRule(
        new Set(ids).size === ids.length &&
          ids.length <= max &&
          ids.every((id) => p.hand.includes(id)) &&
          p.deck.length >= ids.length,
        `Replace at most ${max} different cards from your opening hand.`,
      );
      if (ids.length) {
        // Draw the replacements first, then shuffle the returned cards in so none comes straight back.
        const drawn = p.deck.splice(-ids.length).reverse();
        p.hand = p.hand.filter((id) => !ids.includes(id));
        for (const id of ids) {
          next.cards[id].zone = "deck";
          p.deck.push(id);
        }
        p.deck = shuffle(next, p.deck);
        for (const id of drawn) {
          next.cards[id].zone = "hand";
          p.hand.push(id);
          tx.emit("card.drawn", `Drew ${definition(next, id, registry).name}.`, {
            player: envelope.actor,
            cardId: id,
            visibility: envelope.actor,
          });
        }
        tx.emit(
          "mulligan.replaced",
          `${p.name} replaces ${ids.length} opening ${ids.length === 1 ? "card" : "cards"}.`,
          { player: envelope.actor, amount: ids.length },
        );
      } else
        tx.emit("mulligan.kept", `${p.name} keeps their opening hand.`, { player: envelope.actor });
      next.pending =
        envelope.actor === "p1"
          ? {
              id: `mulligan-${next.sequence}`,
              player: "p2",
              kind: "mulligan",
              options: [...next.players.p2.hand],
              max,
            }
          : null;
      if (next.pending)
        tx.emit("mulligan.started", `${next.players.p2.name} may replace up to ${max} cards.`, {
          player: "p2",
        });
    } else if (command.type === "choose") {
      const choice = next.pending;
      requireRule(
        choice && choice.id === command.choiceId && choice.player === envelope.actor,
        "Invalid or expired choice.",
      );
      if (choice!.kind === "draw") {
        requireRule(
          typeof command.option === "string" && choice!.options.includes(command.option),
          "Choose one of the two drawn cards.",
        );
        for (const id of choice!.options as string[]) {
          if (id === command.option) {
            next.cards[id].zone = "hand";
            p.hand.push(id);
          } else if (command.other === "bottom") {
            next.cards[id].zone = "deck";
            p.deck.unshift(id);
            tx.emit("card.bottomed", `${p.name} puts a card under their library.`, {
              player: envelope.actor,
            });
          } else {
            tx.discard(id);
            tx.emit("card.discarded", `${definition(next, id, registry).name} is discarded.`, {
              player: envelope.actor,
              cardId: id,
            });
          }
        }
        next.pending = null;
        next.phase = "play";
        tx.emit("phase.started", "Play phase begins.");
      } else if (choice!.kind === "hand-discard") {
        const id = command.option;
        requireRule(
          typeof id === "string" &&
            (choice!.options as string[]).includes(id) &&
            next.cards[id].zone === "hand",
          "Choose one of the revealed cards.",
        );
        const victim = next.cards[id as string],
          name = definition(next, victim.id, registry).name;
        tx.discard(victim.id);
        next.pending = null;
        tx.emit(
          "card.discarded",
          `${name} is discarded from ${next.players[victim.owner].name}'s hand.`,
          { player: victim.owner, cardId: victim.id },
        );
      } else if (choice!.kind === "damage-target") {
        const target = command.option;
        const foe = other(envelope.actor);
        requireRule(
          typeof target === "string" &&
            (choice!.options as string[]).includes(target) &&
            (target === foe || next.players[foe].board.includes(target)),
          "Choose one of the highlighted targets.",
        );
        next.pending = null;
        tx.dealDamage({
          type: "damage",
          target: target as string,
          amount: choice!.amount,
          source: choice!.source,
        });
      } else if (choice!.kind === "reprise") {
        const id = command.option;
        requireRule(
          typeof id === "string" &&
            (choice!.options as string[]).includes(id) &&
            next.cards[id].zone === "discard",
          "Choose one of the spells.",
        );
        next.pending = null;
        next.freeCast = { player: envelope.actor, cardId: id as string };
      } else if (choice!.kind === "library-pick") {
        const id = command.option;
        requireRule(
          typeof id === "string" &&
            (choice!.options as string[]).includes(id) &&
            next.cards[id].zone === "deck" &&
            p.deck.includes(id),
          "Choose one of the found cards.",
        );
        p.deck.splice(p.deck.indexOf(id as string), 1);
        next.cards[id as string].zone = "hand";
        p.hand.push(id as string);
        next.pending = null;
        tx.emit(
          "card.searched",
          `${p.name} finds ${definition(next, id as string, registry).name} in the library.`,
          { player: envelope.actor, cardId: id as string },
        );
      } else {
        requireRule(
          typeof command.option === "number" &&
            Number.isInteger(command.option) &&
            choice!.options[command.option],
          "Choose a legal response-energy output.",
        );
        addEnergy(p.responseEnergy, (choice!.options as Pool[])[command.option as number]);
        const remaining = (choice as { remaining: DeadSnapshot[] }).remaining;
        next.pending = null;
        tx.responseOutputs(choice!.player, remaining);
      }
    } else if (command.type === "play") {
      const found = legalActions(next, registry).playable.find((a) => a.cardId === command.cardId);
      requireRule(found, "That card cannot be played: check timing, energy and free slots.");
      const card = next.cards[command.cardId],
        def = registry.cards[card.definitionId];
      const mode = def.modal ? found!.modes?.find((m) => m.mode === command.mode) : undefined;
      if (def.modal) requireRule(mode, "Choose one of the spell's modes.");
      else requireRule(command.mode === undefined, "This card has no modes.");
      // From here on a modal spell is judged by the targets and positions of the chosen mode.
      const legal = mode
        ? {
            ...found!,
            targets: mode.targets,
            requiresTarget: mode.requiresTarget,
            slots: mode.slots,
          }
        : found;
      const cast = castBindings(def, command.mode);
      const payload = playPayload(next, card, registry);
      if (legal!.requiresTarget)
        requireRule(
          command.target && legal!.targets.includes(command.target),
          "Select a legal target.",
        );
      else requireRule(!command.target, "This card has no legal target.");
      let slot = command.slot ?? legal!.slots[0];
      if (payload.consume) {
        requireRule(
          command.consume && legal!.consumes.includes(command.consume),
          "Consume requires a friendly creature.",
        );
        const consumedSlot = next.cards[command.consume!].slot!;
        slot = command.slot ?? consumedSlot;
        requireRule(slot === consumedSlot || legal!.slots.includes(slot), "That slot is occupied.");
      } else requireRule(!command.consume, "This card does not have Consume.");
      const placed = def.type === "spell" && cast.some((b) => registry.abilities[b.id].placement);
      if (placed)
        requireRule(
          command.slot !== undefined && legal!.slots.includes(command.slot),
          "Choose a free battlefield position.",
        );
      else if (def.type === "spell")
        requireRule(command.slot === undefined, "This spell does not use a battlefield position.");
      if (def.type !== "spell")
        requireRule(
          Number.isInteger(slot) &&
            slot >= 0 &&
            slot < battlefieldPositions.length &&
            (legal!.slots.includes(slot) ||
              (payload.consume && next.cards[command.consume!].slot === slot)),
          "Choose a free battlefield position.",
        );
      if (legal!.slotTargets && command.target)
        requireRule(
          legal!.slotTargets[slot]?.includes(command.target),
          "That target is out of range from this position.",
        );
      const pool = inResponseStep(next) ? p.responseEnergy : p.energy;
      const payment = command.payment ?? autoPayment(pool, payload.cost!)!;
      requireRule(
        validPayment(pool, payload.cost!, payment, registry.energyTypes),
        "The payment does not satisfy this cost.",
      );
      for (const color of Object.keys(payment))
        if (payment[color]) pool[color] = (pool[color] ?? 0) - payment[color]!;
      next.freeCast = null;
      tx.target = command.target;
      tx.slot = placed ? command.slot : undefined;
      if (payload.consume && payload.returns) {
        // The additional cost: the chosen creature returns to its owner's hand before the card is played.
        tx.queue.push({ order: { type: "return", target: command.consume! } });
        tx.drain();
      } else if (payload.consume) tx.destroy(command.consume!);
      if (def.type !== "spell") {
        tx.deploy(card, envelope.actor, slot);
      } else {
        // A spell cast for free is already in the discard pile and stays there.
        if (card.zone !== "discard") {
          tx.detach(card);
          card.zone = "discard";
          p.discard.push(card.id);
        }
        p.spellsCast = (p.spellsCast ?? 0) + 1;
        const event = tx.emit("spell.cast", `${p.name} casts ${def.name}.`, {
          player: envelope.actor,
          cardId: card.id,
          target: command.target,
        });
        for (const binding of cast)
          registry.abilities[binding.id].cast!(tx.context(card, event), binding.params);
      }
    } else if (command.type === "energy") {
      const legal = legalActions(next, registry).energy.find((a) => a.cardId === command.cardId);
      requireRule(
        legal && Number.isInteger(command.option) && legal.options[command.option],
        "That creature cannot generate that energy now.",
      );
      const card = next.cards[command.cardId];
      const output = tx.before("energy.generate.before", card, {
        output: structuredClone(legal!.options[command.option]),
      }).output!;
      for (const [color, amount] of Object.entries(output))
        requireRule(
          registry.energyTypes.includes(color as EnergyType) &&
            Number.isInteger(amount) &&
            amount >= 0,
          "Invalid energy output modifier.",
        );
      card.exhausted = true;
      addEnergy(p.energy, output);
      tx.emit("creature.exhausted", `${definition(next, card.id, registry).name} exhausts.`, {
        cardId: card.id,
      });
      tx.emit("energy.generated", `${definition(next, card.id, registry).name} generates energy.`, {
        cardId: card.id,
        player: envelope.actor,
      });
    } else if (command.type === "activate") {
      const legal = legalActions(next, registry).activations.find(
        (action) => action.cardId === command.cardId && action.ability === command.ability,
      );
      requireRule(
        legal,
        "That ability cannot be activated now. Use a ready field card during your play phase.",
      );
      if (legal!.requiresTarget)
        requireRule(
          command.target && legal!.targets.includes(command.target),
          "Select a legal target.",
        );
      else requireRule(!command.target, "This ability has no legal target.");
      if (legal!.slots)
        requireRule(
          command.slot !== undefined && legal!.slots.includes(command.slot),
          "Choose a free battlefield position.",
        );
      else
        requireRule(
          command.slot === undefined,
          "This ability does not use a battlefield position.",
        );
      const card = next.cards[command.cardId],
        binding = definition(next, card.id, registry).abilities[command.ability];
      if (registry.abilities[binding.id].exhausts !== false) card.exhausted = true;
      tx.target = command.target;
      tx.slot = command.slot;
      const event = tx.emit(
        "ability.activated",
        `${definition(next, card.id, registry).name} activates ${describeAbility(binding, registry.abilities[binding.id]).name ?? "an ability"}.`,
        { cardId: card.id, player: envelope.actor, target: command.target, abilityId: binding.id },
      );
      registry.abilities[binding.id].activate!(tx.context(card, event), binding.params);
    } else if (command.type === "attack") {
      requireRule(
        next.phase === "attack" && next.combat?.stage === "declare",
        "Declare attackers in the Attack Phase.",
      );
      const eligible = legalActions(next, registry).attackers;
      requireRule(
        new Set(command.attackers).size === command.attackers.length &&
          command.attackers.every((id) => eligible.includes(id)),
        "Choose unique, unexhausted attackers.",
      );
      if (!command.attackers.length) {
        next.phase = "end";
        next.combat = null;
        tx.emit("phase.started", "Attack phase skipped.");
      } else {
        const lanes: Record<string, number> = {},
          targeted = new Set<number>();
        requireRule(
          Object.keys(command.lanes ?? {}).every((id) => command.attackers.includes(id)),
          "A lane was chosen for a card that is not attacking.",
        );
        for (const id of command.attackers) {
          const lane = command.lanes?.[id] ?? next.cards[id].slot!;
          requireRule(
            legalActions(next, registry).lanes[id].includes(lane),
            "Attack your own lane or an adjacent lane.",
          );
          requireRule(!targeted.has(lane), "Only one attacker may target each lane.");
          targeted.add(lane);
          lanes[id] = lane;
        }
        next.combat!.attackers = [...command.attackers].sort(
          (a, b) => next.cards[a].slot! - next.cards[b].slot!,
        );
        next.combat!.lanes = lanes;
        next.combat!.blocks = laneBlocks(next, next.combat!.attackers, lanes, registry);
        next.combat!.stage = "review";
        for (const id of next.combat!.attackers) {
          next.cards[id].exhausted = true;
          tx.emit(
            "creature.attacked",
            `${definition(next, id, registry).name} attacks ${positionName(lanes[id])}.`,
            { cardId: id, player: envelope.actor },
          );
        }
        tx.emit(
          "combat.blocks-set",
          "Defenders in the targeted lanes block automatically. The attacker must review and confirm combat.",
          { player: other(next.active) },
        );
      }
    } else if (command.type === "confirm-combat") {
      requireRule(
        next.phase === "attack" && next.combat?.stage === "review",
        "Confirm combat only after attackers are declared.",
      );
      tx.combat();
    } else if (command.type === "end" && next.responseStep) {
      requireRule(legalActions(next, registry).canEnd, "This window cannot be closed yet.");
      tx.closeWindow();
    } else if (command.type === "end") {
      requireRule(legalActions(next, registry).canEnd, "This phase cannot be ended yet.");
      tx.emit("phase.ended", `${next.phase} phase ends.`);
      tx.drain();
      if (!next.outcome && next.phase === "play") {
        p.energy = {};
        next.phase = "attack";
        next.combat = { stage: "declare", attackers: [], lanes: {}, blocks: [], dead: [] };
        tx.emit("phase.started", "Choose a batch of attackers, or skip combat.");
      } else if (!next.outcome && next.phase === "attack") {
        if (next.combat!.stage === "declare") {
          next.phase = "end";
          next.combat = null;
        } else {
          p.responseEnergy = {};
          next.phase = "end";
          next.combat = null;
          tx.emit("response.closed", "Response energy expires.");
        }
      } else if (!next.outcome && next.phase === "end") {
        tx.emit("turn.ended", `${p.name} ends their turn.`, { player: envelope.actor });
        tx.drain();
        if (!next.outcome) {
          // Damage clears globally; only the ending controller's field cards ready.
          for (const card of Object.values(next.cards))
            if (card.zone === "board") {
              card.damage = 0;
              delete card.attackBonus;
              delete card.defenseBonus;
              if (card.controller === next.active) card.exhausted = false;
            }
          for (const id of ["p1", "p2"] as PlayerId[]) {
            next.players[id].energy = {};
            next.players[id].responseEnergy = {};
            if (next.players[id].spellsCast) next.players[id].spellsCast = 0;
          }
          next.active = other(next.active);
          next.turn++;
          next.phase = "draw";
          tx.emit("turn.started", `${next.players[next.active].name} begins turn ${next.turn}.`, {
            player: next.active,
          });
          tx.drain();
          tx.checkOutcome();
          if (!next.outcome) {
            const drawn = tx.draw(next.active, 2, "choice");
            if (!next.outcome) {
              if (drawn.length === 2)
                next.pending = {
                  id: `choice-${next.sequence}`,
                  player: next.active,
                  kind: "draw",
                  options: drawn,
                };
              else {
                if (drawn[0]) {
                  next.cards[drawn[0]].zone = "hand";
                  next.players[next.active].hand.push(drawn[0]);
                }
                next.phase = "play";
              }
            }
          }
        }
      }
    }
    tx.drain();
    tx.checkOutcome();
    tx.settleDeaths();
    next.revision++;
    assertInvariants(next);
    return { state: next, events: next.events.slice(state.events.length) };
  } catch (error) {
    return {
      state,
      events: [],
      error: error instanceof Error ? error.message : "Invalid command.",
    };
  }
}
export function assertInvariants(state: GameState) {
  const located = new Set<string>();
  for (const id of ["p1", "p2"] as PlayerId[]) {
    const p = state.players[id];
    requireRule(p.board.length === 5, "Board must have exactly five slots.");
    for (const [zone, ids] of [
      ["deck", p.deck],
      ["hand", p.hand],
      ["board", p.board],
      ["discard", p.discard],
    ] as const) {
      for (const cid of ids)
        if (cid) {
          requireRule(!located.has(cid), `Duplicate zone membership: ${cid}`);
          located.add(cid);
          requireRule(state.cards[cid]?.zone === zone, `Incorrect zone: ${cid}`);
          requireRule(
            zone === "board"
              ? state.cards[cid].controller === id && p.board[state.cards[cid].slot!] === cid
              : state.cards[cid].owner === id,
            "Incorrect owner or slot.",
          );
        }
    }
    for (const pool of [p.energy, p.responseEnergy])
      for (const value of Object.values(pool))
        requireRule(Number.isInteger(value) && value >= 0, "Negative or fractional energy.");
  }
  if (state.pending?.kind === "draw")
    for (const id of state.pending.options) {
      requireRule(!located.has(id) && state.cards[id].zone === "choice", "Invalid draw choice.");
      located.add(id);
    }
  if (state.pending?.kind === "library-pick")
    for (const id of state.pending.options)
      requireRule(
        state.players[state.pending.player].deck.includes(id),
        "A search choice offers a card that is not in the library.",
      );
  requireRule(located.size === Object.keys(state.cards).length, "A card is missing from its zone.");
}
export function projectForPlayer(
  state: GameState,
  viewer: PlayerId | null,
  registry: Registry,
): PlayerView {
  const publicIds = (["p1", "p2"] as PlayerId[])
    .flatMap((p) => [...state.players[p].board, ...state.players[p].discard])
    .filter((id): id is string => !!id);
  const hand = viewer ? [...state.players[viewer].hand] : [];
  const pending = state.pending?.player === viewer ? structuredClone(state.pending) : null;
  if (
    pending?.kind === "draw" ||
    pending?.kind === "hand-discard" ||
    pending?.kind === "library-pick"
  )
    publicIds.push(...pending.options);
  const cards = Object.fromEntries(
    [...publicIds, ...hand].map((id) => [id, structuredClone(state.cards[id])]),
  );
  const players = Object.fromEntries(
    (["p1", "p2"] as PlayerId[]).map((id) => {
      const { deck, hand, ...p } = structuredClone(state.players[id]);
      return [id, { ...p, deckCount: deck.length, handCount: hand.length }];
    }),
  ) as PlayerView["players"];
  const legal = legalActions(state, registry);
  return {
    rulesVersion: state.rulesVersion,
    contentVersion: state.contentVersion,
    revision: state.revision,
    turn: state.turn,
    active: state.active,
    phase: state.phase,
    players,
    cards,
    hand,
    pending,
    combat: state.combat ? structuredClone(state.combat) : null,
    outcome: state.outcome,
    outcomeReason: state.outcomeReason,
    responseStep: state.responseStep ?? null,
    freeCast: state.freeCast ?? null,
    events: state.events
      .filter((e) => e.visibility === "public" || e.visibility === viewer)
      .map((e) => structuredClone(e)),
    legal:
      viewer === legal.actor
        ? legal
        : {
            actor: legal.actor,
            playable: [],
            energy: [],
            activations: [],
            attackers: [],
            lanes: {},
            canEnd: false,
          },
  };
}
export const projectForSpectator = (state: GameState, registry: Registry) =>
  projectForPlayer(state, null, registry);
export function replay(
  initial: GameState,
  commands: CommandEnvelope[],
  registry: Registry,
): GameState {
  requireRule(initial.rulesVersion === RULES_VERSION, "Rules version differs from this engine.");
  requireRule(
    initial.contentVersion === registry.version,
    "Content version differs from this registry.",
  );
  return commands.reduce((state, envelope) => {
    const result = apply(state, envelope, registry);
    if (result.error) throw new Error(result.error);
    return result.state;
  }, structuredClone(initial));
}
