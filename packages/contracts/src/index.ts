export { deckRules } from "./deckRules";
export { areAdjacent, battlefieldPositions, positionName, positionSlot } from "./positions";
export type { BattlefieldPosition } from "./positions";

// Content validates these IDs against its faction configuration. The engine
// treats them as names so adding a faction never requires changing engine code.
/** The closed vocabulary of spell subtypes; a spell carries at most one. German labels live in the shared dictionary. */
export const spellSubtypes = [
  "strike",
  "barrage",
  "tactic",
  "rite",
  "curse",
  "divination",
] as const;
export type Faction = string;
/** 'neutral' is the stable data ID for generic energy; it cannot pay faction-specific costs. */
export type EnergyType = Faction | "neutral";
export type Pool = Record<EnergyType, number>;
export type Cost = { generic: number; factions: Record<Faction, number> };
export type PlayerId = "p1" | "p2";
export type AbilityBinding = { id: string; params: Record<string, unknown> };
export type ContentLanguage = "en" | "de";
export type CardTranslation = { name?: string; lore?: string };
export type AbilityTranslation = { name?: string; description: string; fieldDescription?: string };
export type CardDefinition = {
  id: string;
  revision: number;
  name: string;
  deckLimitKey: string;
  type: "creature" | "spell" | "holding";
  /** Logical release membership; independent of artwork. Optional only for legacy engine fixtures. */
  set?: string;
  factions: Faction[];
  subtypes: string[];
  legendary: boolean;
  rarity: "common" | "rare" | "legendary";
  cost: Cost;
  lore?: string;
  translations?: Partial<Record<ContentLanguage, CardTranslation>>;
  art: string;
  animation?: string;
  abilities: AbilityBinding[];
  stats?: { attack: number; defense: number; energyOutputs: Pool[] };
  timing?: ("play" | "response")[];
  /** The spell's effects. Resolved in list order, or, when `modal`, only the one the caster chooses. */
  cast?: AbilityBinding[];
  /** Choose one: the caster picks a single entry of `cast` when playing the spell. */
  modal?: boolean;
};
export type CardInstance = {
  id: string;
  definitionId: string;
  owner: PlayerId;
  controller: PlayerId;
  zone: "deck" | "hand" | "board" | "discard" | "choice";
  slot: number | null;
  exhausted: boolean;
  damage: number;
  /** Until-end-of-turn bonuses from spells such as Rage and Steadfast. */ attackBonus?: number;
  defenseBonus?: number;
};
export type Player = {
  id: PlayerId;
  name: string;
  /** Portrait id; optional presentation only. */ avatar?: string;
  /** Card back id; optional presentation only. */ cardBack?: string;
  life: number;
  deck: string[];
  hand: string[];
  board: (string | null)[];
  discard: string[];
  energy: Pool;
  responseEnergy: Pool;
  /** Spells this player has cast during the current turn. Absent means none. */
  spellsCast?: number;
};
export type Phase = "draw" | "play" | "attack" | "end";
export type DeadSnapshot = { card: CardInstance; outputs: Pool[] };
export type PendingChoice =
  | { id: string; player: PlayerId; kind: "draw"; options: string[] }
  /** Opening hand: the player may return up to `max` cards and draw the same number of new ones. */
  | { id: string; player: PlayerId; kind: "mulligan"; options: string[]; max: number }
  | {
      id: string;
      player: PlayerId;
      kind: "response-energy";
      options: Pool[];
      sourceName: string;
      remaining: DeadSnapshot[];
    }
  /** The player sees the opponent's hand (`options` are those card IDs) and picks one; the opponent discards it. */
  | { id: string; player: PlayerId; kind: "hand-discard"; options: string[]; sourceName: string }
  /** The player picks one of their own library cards (`options`, one per distinct card, cheapest first) to put into their hand. */
  | { id: string; player: PlayerId; kind: "library-pick"; options: string[]; sourceName: string }
  /** The player picks what a triggered ability damages: `options` are the enemy cards on the field and the enemy player's id. */
  | {
      id: string;
      player: PlayerId;
      kind: "damage-target";
      options: string[];
      amount: number;
      /** The card whose ability deals the damage. */
      source: string;
      sourceName: string;
    }
  /** The player picks a spell in their discard pile to cast for free: the options are card IDs, one per distinct spell that can be cast now. The chosen spell then becomes `freeCast`. */
  | { id: string; player: PlayerId; kind: "reprise"; options: string[]; sourceName: string };
/** `lanes` maps each declared attacker to the enemy position it attacks; `blocks` is derived from it automatically. */
export type Combat = {
  stage: "declare" | "review" | "response";
  attackers: string[];
  lanes: Record<string, number>;
  blocks: { attacker: string; blocker: string }[];
  dead: DeadSnapshot[];
};
export type GameEvent = {
  seq: number;
  type: string;
  message: string;
  abilityId?: string;
  effects?: { abilityId: string; cardId: string; target?: string }[];
  player?: PlayerId;
  cardId?: string;
  target?: string;
  amount?: number;
  visibility: "public" | PlayerId;
  snapshot?: CardInstance;
};
export type GameState = {
  rulesVersion: string;
  contentVersion: string;
  seed: number;
  rng: number;
  revision: number;
  sequence: number;
  turn: number;
  active: PlayerId;
  phase: Phase;
  players: Record<PlayerId, Player>;
  cards: Record<string, CardInstance>;
  combat: Combat | null;
  pending: PendingChoice | null;
  outcome: PlayerId | "draw" | null;
  outcomeReason: "life" | "empty-library" | "concede" | null;
  events: GameEvent[];
  /** Set while a player may answer fresh deaths with response spells outside combat: the player whose creature died. */
  responseStep?: PlayerId | null;
  /** A spell the player must now cast from their discard pile without paying its cost. It is the only thing they can do until it is cast. */
  freeCast?: { player: PlayerId; cardId: string } | null;
  /** Players still waiting for their response step, in turn order, with the creatures that died for them. */
  responseQueue?: { player: PlayerId; dead: DeadSnapshot[] }[];
};
export type Command =
  | {
      type: "play";
      cardId: string;
      slot?: number;
      target?: string;
      consume?: string;
      payment?: Pool;
      /** Index into the spell's `cast` list. Required for a modal spell, not allowed otherwise. */
      mode?: number;
    }
  | { type: "energy"; cardId: string; option: number }
  | { type: "activate"; cardId: string; ability: number; target?: string; slot?: number }
  /** `lanes` defaults each attacker to its own position. One attacker per target lane. */
  | { type: "attack"; attackers: string[]; lanes?: Record<string, number> }
  | { type: "confirm-combat" }
  /** Answers a pending opening-hand choice; an empty list keeps the hand. */
  | { type: "mulligan"; cardIds: string[] }
  /** `other` says where the unchosen drawn card goes: the discard pile (default) or under the library. */
  | { type: "choose"; choiceId: string; option: string | number; other?: "discard" | "bottom" }
  | { type: "end" }
  /** Gives the match to the opponent. Allowed at any time, also when it is not your decision. */
  | { type: "concede" };
export type CommandEnvelope = {
  actor: PlayerId;
  expectedRevision: number;
  command: Command;
  clientActionId?: string;
};
export type InternalOrder =
  | { type: "damage"; target: string; amount: number; source?: string }
  | { type: "heal"; target: PlayerId; amount: number }
  /** `player` chooses one enemy creature, holding or the enemy player and `source` deals `amount` damage to it. A choice already pending sends the damage to the enemy player. */
  | { type: "damage-pick"; player: PlayerId; amount: number; source: string }
  /** Temporary stat bonus on a field creature; cleared when the turn ends. */
  | { type: "boost"; target: string; attack?: number; defense?: number; source?: string }
  | { type: "draw"; player: PlayerId; amount: number }
  /** Moves every copy of a card definition from the player's library to their hand. Finding nothing is allowed. */
  | { type: "search"; player: PlayerId; card: string; source?: string }
  /** Lets the player pick a creature with the subtype from the library for the hand; `first` takes the topmost one instead. Finding nothing is allowed. */
  | { type: "search-subtype"; player: PlayerId; subtype: string; first?: boolean; source?: string }
  /** Lets the player pick a creature or holding with a total energy cost of `maxCost` or less from the library for the hand; `first` takes the topmost one instead. Finding nothing is allowed. */
  | { type: "search-cost"; player: PlayerId; maxCost: number; first?: boolean; source?: string }
  /** Reveals the opponent's hand to `player`, who then chooses one card for the opponent to discard. */
  | { type: "ransack"; player: PlayerId; source?: string }
  /** Puts cards from the top of a library into its owner's discard pile. Never empties the library on its own. */
  | { type: "mill"; player: PlayerId; amount: number }
  | { type: "gain-energy"; player: PlayerId; output: Pool; source?: string }
  | { type: "return"; target: string }
  /** Readies an exhausted creature on the board. */
  | { type: "ready"; target: string }
  /** Lets `player` choose a spell in their discard pile and cast it without paying its cost. */
  | { type: "reprise"; player: PlayerId; source?: string }
  | {
      type: "deploy";
      target: string;
      player: PlayerId;
      slot: number;
      /** Enters ready instead of exhausted (still subject to entry hooks). */ ready?: boolean;
    }
  | { type: "destroy"; target: string; combat?: boolean };
/** `consume`: the card needs a friendly creature sacrificed to play it; `consumeMin`: that creature's total cost must be at least this. */
export type BeforePayload = {
  exhausted?: boolean;
  consume?: boolean;
  consumeMin?: number;
  /** With `consume`: the chosen friendly creature returns to its owner's hand instead of being sacrificed. */
  returns?: boolean;
  amount?: number;
  cost?: Cost;
  output?: Pool;
};
export type HookContext = {
  state: Readonly<GameState>;
  registry: Registry;
  source: CardInstance;
  event: GameEvent;
  target?: string;
  slot?: number;
  issue: (order: InternalOrder) => void;
};
/** Public battlefield information available to continuous abilities in both engine states and player views. */
export type BattlefieldState = Readonly<{
  cards: Readonly<Record<string, CardInstance>>;
  players: Readonly<
    Record<
      PlayerId,
      { board: readonly (string | null)[]; discard?: readonly string[]; spellsCast?: number }
    >
  >;
}>;
export type AbilityExtension = {
  id: string;
  version: number;
  validate: (params: unknown) => void;
  /** Record this ability's resolved effects on the triggering event, so players can see what happened. */
  announce?: boolean;
  /** Player-facing templates; {param} placeholders come from the card binding. A one-off ability has no name and shows only its description. */
  name?: string;
  description: string;
  /** Wording on a creature or holding's own ability line, for abilities that read differently there than as a spell effect. Falls back to `description`. */
  fieldDescription?: string;
  translations?: Partial<Record<ContentLanguage, AbilityTranslation>>;
  hooks?: Record<string, (ctx: HookContext, params: Record<string, unknown>) => void>;
  before?: Record<
    string,
    (ctx: HookContext, params: Record<string, unknown>, payload: BeforePayload) => BeforePayload
  >;
  static?: (
    source: CardInstance,
    target: CardInstance,
    params: Record<string, unknown>,
    registry: Registry,
    state?: BattlefieldState,
  ) => { attack?: number; defense?: number };
  /** Pure restriction on an attacker/blocker pair; returning false forbids it.
   * Evaluated on abilities of both participants, with their owning card as source. */
  canBlock?: (
    source: CardInstance,
    attacker: CardInstance,
    blocker: CardInstance,
    params: Record<string, unknown>,
    registry: Registry,
  ) => boolean;
  /** Pure redirect: true if `source` (on its own controller's side) steps in to block `attacker` aimed at `lane`.
   * Blocking restrictions from canBlock still apply. */
  intercepts?: (
    source: CardInstance,
    attacker: CardInstance,
    lane: number,
    params: Record<string, unknown>,
    registry: Registry,
  ) => boolean;
  /** Activated during the controller's play phase by exhausting the source. */
  /** Optional public eligibility restriction, checked by both legal actions and command validation. */
  canActivate?: (
    source: CardInstance,
    state: Readonly<GameState>,
    params: Record<string, unknown>,
    registry: Registry,
  ) => boolean;
  activate?: (ctx: HookContext, params: Record<string, unknown>) => void;
  /** Activating exhausts the card by default. Set false for an ability the card may use while exhausted, and repeatedly. */
  exhausts?: boolean;
  /** The ability's target can never be the card using it. */
  targetOthers?: boolean;
  /** For `any-creature` targets: whose creatures may be chosen, from the binding's params with `defaults` applied. */
  targetSides?: (params: Record<string, unknown>) => ("friendly" | "enemy")[];
  cast?: (ctx: HookContext, params: Record<string, unknown>) => void;
  /** Parameter values assumed when a binding leaves them out, so cards authored before a parameter existed keep working and keep their text. */
  defaults?: Record<string, unknown>;
  /** Narrows which board cards a board-targeting ability may choose, e.g. by card type. Receives the binding's params with `defaults` applied. */
  targetFilter?: (card: CardDefinition, params: Record<string, unknown>) => boolean;
  /** Optional declared energy choices for an activated producer. One faction per pool; the chosen faction is the target. */
  activationEnergy?: (params: Record<string, unknown>, registry: Registry) => Pool[];
  /** Target a field card (in hand, or in your discard pile) and choose a free friendly position before activating or casting. */
  placement?: boolean;
  target?:
    | "energy-type"
    | "friendly-hand-field"
    | "friendly-discard-creature"
    | "enemy-any"
    | "enemy-reach"
    | "friendly-creature"
    | "enemy-creature"
    | "any-creature"
    | "friendly-field"
    | "enemy-field";
};
/** The cast bindings that resolve when the spell is played: all of them, or for a modal spell only the chosen mode. */
export function castBindings(def: CardDefinition, mode?: number): AbilityBinding[] {
  const cast = def.cast ?? [];
  return def.modal ? (mode !== undefined && cast[mode] ? [cast[mode]] : []) : cast;
}
export type Registry = {
  version: string;
  energyTypes: EnergyType[];
  cards: Record<string, CardDefinition>;
  abilities: Record<string, AbilityExtension>;
};
export type LegalActions = {
  actor: PlayerId;
  playable: {
    cardId: string;
    slots: number[];
    targets: string[];
    consumes: string[];
    /** The creature in `consumes` that the player picks goes back to the hand instead of being sacrificed. */
    returns?: boolean;
    requiresTarget: boolean;
    /** Legal targets by deployment position, when they depend on it (ranged deployment effects). */ slotTargets?: Record<
      string,
      string[]
    >;
    /** A modal spell: the modes (indexes into `cast`) that can be chosen now, each with its own targets and positions. `targets`, `requiresTarget` and `slots` of the entry itself stay empty until a mode is picked. */
    modes?: { mode: number; targets: string[]; requiresTarget: boolean; slots: number[] }[];
  }[];
  energy: { cardId: string; options: Pool[] }[];
  activations: {
    cardId: string;
    ability: number;
    targets: string[];
    requiresTarget: boolean;
    slots?: number[];
    energyOptions?: Pool[];
  }[];
  attackers: string[];
  /** Positions each legal attacker may target: its own lane and adjacent lanes. */ lanes: Record<
    string,
    number[]
  >;
  canEnd: boolean;
};
export type PlayerView = {
  rulesVersion: string;
  contentVersion: string;
  revision: number;
  turn: number;
  active: PlayerId;
  phase: Phase;
  players: Record<
    PlayerId,
    Omit<Player, "deck" | "hand"> & { deckCount: number; handCount: number }
  >;
  cards: Record<string, CardInstance>;
  hand: string[];
  pending: PendingChoice | null;
  combat: Combat | null;
  outcome: GameState["outcome"];
  outcomeReason: GameState["outcomeReason"];
  responseStep?: PlayerId | null;
  /** A spell the player must now cast from their discard pile without paying its cost. It is the only thing they can do until it is cast. */
  freeCast?: { player: PlayerId; cardId: string } | null;
  events: GameEvent[];
  legal: LegalActions;
};
