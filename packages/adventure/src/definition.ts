/** What an adventure is, as authored. Pure data: the run, the validator and every screen read the same shapes. */

/** Text in the languages the game ships; German falls back to English. */
export type Localized = { en: string; de?: string };
/** A story beat can change the painting while keeping the event's default art as a fallback. */
export type StoryBeat = Localized & { art?: string };

export type NodeType = "event" | "battle" | "elite" | "shop" | "improve" | "final";

export type Condition =
  | { flag: string; not?: boolean }
  | { card: string; not?: boolean }
  | { silver: number };

/** The closed set of things a scene can do. A new adventure needs content, not code, as long as it stays inside this list. */
export type Effect =
  | { type: "silver"; amount: number }
  | { type: "addCard"; card: string }
  /** Record a legendary for the end-of-run collection reward; optionally add it to the run deck. */
  | { type: "recruit"; card: string; addToDeck?: boolean }
  | { type: "removeCard"; card: string }
  | { type: "flag"; flag: string }
  /** Open a pick pack from the faction's pool (or from `cards`). Taking one adds it to the deck. */
  | { type: "offer"; size: number; pick?: number; cards?: string[] }
  /** Fight this enemy next; winning pays the usual battle reward. */
  | { type: "battle"; enemy: string }
  /** A booster for the account, collected once per run under this id. */
  | { type: "booster"; id: string; pack: string; count: number };

export type Choice = {
  id: string;
  label: Localized;
  when?: Condition[];
  effects: Effect[];
  /** Shown after choosing, before the scene closes. */
  result?: Localized;
};

export type EventDef = {
  id: string;
  title?: Localized;
  /** Painting under assets/adventures/<adventure>/art (without extension). */
  art?: string;
  beats: StoryBeat[];
  /** Applied once when the last beat is continued, if the event has no choices. */
  effects?: Effect[];
  choices?: Choice[];
};

export type EnemyDef = {
  id: string;
  name: Localized;
  faction: string;
  deck: Record<string, number>;
  /** Starting life; absent means the standard match life. */
  life?: number;
  intro?: Localized;
  /** Optional painting under this adventure's art/ folder, without extension. */
  art?: string;
};

export type NodeDef = {
  id: string;
  type: NodeType;
  /** Position on the map screen, 0 to 100 of its width and height. */
  x: number;
  y: number;
  /** Where the player may go next. Forward only. */
  next: string[];
  label?: Localized;
  /** Opening scene for an event node; for a battle, a scene shown after the win. */
  event?: string;
  /** A fixed enemy, or a pool to draw one from by the run seed. */
  enemy?: string;
  pool?: string;
};

export type AdventureDef = {
  id: string;
  revision: number;
  faction: string;
  set?: string;
  name: Localized;
  premise: Localized;
  /** Selection artwork, without extension. */
  art?: string;
  /** Flat parchment texture for the route table, without extension. */
  mapArt?: string;
  starterDeck: Record<string, number>;
  start: string;
  nodes: NodeDef[];
  events: EventDef[];
  enemies: EnemyDef[];
  /** Enemy ids a random battle or elite draws from. */
  pools: Record<string, string[]>;
  shop?: { size?: number; prices?: Partial<Record<"common" | "rare" | "legendary", number>> };
};

export const text = (value: Localized | undefined, language: string): string =>
  value ? ((language === "de" ? value.de : undefined) ?? value.en) : "";

export const nodeOf = (def: AdventureDef, id: string): NodeDef | undefined =>
  def.nodes.find((node) => node.id === id);
export const eventOf = (def: AdventureDef, id: string): EventDef | undefined =>
  def.events.find((event) => event.id === id);
export const enemyOf = (def: AdventureDef, id: string): EnemyDef | undefined =>
  def.enemies.find((enemy) => enemy.id === id);
export const expandDeck = (deck: Record<string, number>): string[] =>
  Object.entries(deck).flatMap(([id, count]) => Array<string>(count).fill(id));
