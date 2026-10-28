/**
 * The match ledger: one small record per finished match you played, kept on this device.
 * It holds only what your seat was allowed to see, the same in every mode. The opponent's deck is never looked up:
 * their archetype is inferred from the cards they played.
 */
export const LEDGER_KIND = "varhyr-match-history";
export const LEDGER_VERSION = 1;
/** Oldest matches fall off first. A record is a few hundred bytes, so this stays far below the browser's storage limit. */
export const MAX_MATCHES = 2000;
const MAX_FILE_MATCHES = 10000;

export type MatchMode = "practice" | "hotseat" | "online" | "quest" | "draft";
export type Outcome = "won" | "lost" | "draw";
/** The opponent as far as their played cards show: the factions they lean on, strongest first. Empty means nothing was seen. */
export type Opponent = { factions: string[] };
export type MatchRecord = {
  id: string;
  /** ISO time the match finished. */
  at: string;
  deckId: string;
  deckName: string;
  /** Fingerprint of the exact card list played, see `deckVersion`. */
  version: string;
  opponent: Opponent;
  mode: MatchMode;
  /** Whether your seat took the first turn. */
  first: boolean;
  result: Outcome;
  /** Your own turns. */
  turns: number;
  /** Your life when the match ended. */
  life: number;
};
export type DeckVersion = { cards: string[]; deckId: string; at: string };
export type Ledger = {
  version: typeof LEDGER_VERSION;
  /** Every card list that was played, by fingerprint. Stored once, not per match. */
  versions: Record<string, DeckVersion>;
  /** Oldest first. */
  matches: MatchRecord[];
};
export const emptyLedger = (): Ledger => ({ version: LEDGER_VERSION, versions: {}, matches: [] });

/** The same cards in any order are the same version; changing one card makes a new one. */
export function deckVersion(cards: readonly string[]): string {
  const text = [...cards].sort().join("|");
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

const outcomes: Outcome[] = ["won", "lost", "draw"];
const modes: MatchMode[] = ["practice", "hotseat", "online", "quest", "draft"];
const text = (value: unknown, max = 80): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max;
const count = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= -1000 && value <= 100000;
const isRecord = (value: unknown): value is MatchRecord => {
  if (!value || typeof value !== "object") return false;
  const r = value as Partial<MatchRecord>;
  const o = r.opponent as Partial<Opponent> | undefined;
  return (
    text(r.id, 120) &&
    text(r.at, 40) &&
    !Number.isNaN(Date.parse(r.at as string)) &&
    text(r.deckId, 120) &&
    typeof r.deckName === "string" &&
    r.deckName.length <= 80 &&
    text(r.version, 16) &&
    !!o &&
    Array.isArray(o.factions) &&
    o.factions.length <= 12 &&
    o.factions.every((f) => text(f, 40)) &&
    modes.includes(r.mode as MatchMode) &&
    typeof r.first === "boolean" &&
    outcomes.includes(r.result as Outcome) &&
    count(r.turns) &&
    count(r.life)
  );
};
const isVersion = (value: unknown): value is DeckVersion => {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<DeckVersion>;
  return (
    Array.isArray(v.cards) &&
    v.cards.length <= 200 &&
    v.cards.every((id) => text(id, 120)) &&
    text(v.deckId, 120) &&
    text(v.at, 40)
  );
};

/** Keeps only the versions that a match still points at, so a trimmed ledger does not carry dead lists. */
function prune(ledger: Ledger): Ledger {
  const used = new Set(ledger.matches.map((m) => m.version));
  return {
    ...ledger,
    versions: Object.fromEntries(Object.entries(ledger.versions).filter(([key]) => used.has(key))),
  };
}

/** Adds a finished match. A match already in the ledger (same id) is not counted twice. */
export function addMatch(ledger: Ledger, record: MatchRecord, cards: readonly string[]): Ledger {
  if (ledger.matches.some((m) => m.id === record.id)) return ledger;
  const next: Ledger = {
    ...ledger,
    versions: ledger.versions[record.version]
      ? ledger.versions
      : {
          ...ledger.versions,
          [record.version]: { cards: [...cards].sort(), deckId: record.deckId, at: record.at },
        },
    matches: [...ledger.matches, record],
  };
  return next.matches.length > MAX_MATCHES
    ? prune({ ...next, matches: next.matches.slice(-MAX_MATCHES) })
    : next;
}

/** Combines two ledgers (an import into what is already here). Matches with the same id are kept once. */
export function mergeLedgers(base: Ledger, incoming: Ledger): Ledger {
  const known = new Set(base.matches.map((m) => m.id));
  const added = incoming.matches.filter((m) => !known.has(m.id));
  if (!added.length) return base;
  const matches = [...base.matches, ...added].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const merged: Ledger = {
    version: LEDGER_VERSION,
    versions: { ...incoming.versions, ...base.versions },
    matches,
  };
  return prune(
    matches.length > MAX_MATCHES ? { ...merged, matches: matches.slice(-MAX_MATCHES) } : merged,
  );
}

/** Reads a ledger from storage or an uploaded file. Anything malformed is dropped rather than trusted. */
export function parseLedger(textValue: string | null): Ledger | null {
  if (!textValue) return null;
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(textValue);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || data.version !== LEDGER_VERSION) return null;
  if (!Array.isArray(data.matches) || data.matches.length > MAX_FILE_MATCHES) return null;
  const versions: Record<string, DeckVersion> = {};
  if (data.versions && typeof data.versions === "object")
    for (const [key, value] of Object.entries(data.versions))
      if (text(key, 16) && isVersion(value)) versions[key] = value;
  const matches = (data.matches as unknown[])
    .filter(isRecord)
    // A record whose deck list is unknown can still be counted; it just has no version to compare.
    .map((m) => ({ ...m }));
  const seen = new Set<string>();
  const unique = matches.filter((m) => !seen.has(m.id) && !!seen.add(m.id));
  return prune({ version: LEDGER_VERSION, versions, matches: unique.slice(-MAX_MATCHES) });
}

export type HistoryFile = Ledger & { kind: typeof LEDGER_KIND; exportedAt: string };
export const exportLedger = (ledger: Ledger, now = new Date()): HistoryFile => ({
  kind: LEDGER_KIND,
  exportedAt: now.toISOString(),
  ...ledger,
});
/** An uploaded history file: must say what it is, then goes through the same checks as stored data. */
export function parseHistoryFile(fileText: string): Ledger {
  let data: Partial<HistoryFile> | null = null;
  try {
    data = JSON.parse(fileText);
  } catch {
    /* handled below */
  }
  if (!data || data.kind !== LEDGER_KIND) throw new Error("This file is not a match history.");
  const ledger = parseLedger(fileText);
  if (!ledger) throw new Error("This match history could not be read.");
  return ledger;
}

export type Tally = { won: number; lost: number; draw: number; games: number };
const emptyTally = (): Tally => ({ won: 0, lost: 0, draw: 0, games: 0 });
const tally = (into: Tally, result: Outcome) => {
  into.games++;
  into[result]++;
};
export const winRate = (t: Tally) => (t.games ? t.won / t.games : 0);
/** 95% range for a win rate (Wilson). A handful of games says very little; the range shows how little. */
export function winRange(t: Tally): [number, number] {
  if (!t.games) return [0, 1];
  const z = 1.96,
    n = t.games,
    p = t.won / n,
    d = 1 + (z * z) / n,
    centre = (p + (z * z) / (2 * n)) / d,
    half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

export type CardChange = { id: string; count: number };
export type CardDiff = { added: CardChange[]; removed: CardChange[] };
const counts = (cards: readonly string[]) => {
  const map = new Map<string, number>();
  for (const id of cards) map.set(id, (map.get(id) ?? 0) + 1);
  return map;
};
/** What changed between two card lists, as whole copies. */
export function diffCards(from: readonly string[], to: readonly string[]): CardDiff {
  const a = counts(from),
    b = counts(to),
    added: CardChange[] = [],
    removed: CardChange[] = [];
  for (const id of new Set([...a.keys(), ...b.keys()])) {
    const delta = (b.get(id) ?? 0) - (a.get(id) ?? 0);
    if (delta > 0) added.push({ id, count: delta });
    else if (delta < 0) removed.push({ id, count: -delta });
  }
  const byId = (x: CardChange, y: CardChange) => x.id.localeCompare(y.id);
  return { added: added.sort(byId), removed: removed.sort(byId) };
}

export type VersionSummary = {
  version: string;
  /** Unknown when the history was imported without this version's list. */
  cards: string[] | null;
  firstAt: string;
  lastAt: string;
  tally: Tally;
  /** Against the version played before this one; none for the first. */
  diff: CardDiff | null;
};
export type OpponentSummary = {
  /** The faction mix, e.g. "black-host+horde"; "unknown" when no card of theirs was seen. */
  key: string;
  factions: string[];
  tally: Tally;
};
export type DeckSummary = {
  overall: Tally;
  onThePlay: Tally;
  onTheDraw: Tally;
  /** Most played first. */
  opponents: OpponentSummary[];
  /** Oldest first, so the last entry is the list in use now. */
  versions: VersionSummary[];
  /** Newest first. */
  recent: Outcome[];
  averageTurns: number;
};
const opponentKey = (o: Opponent) =>
  o.factions.length ? [...o.factions].sort().join("+") : "unknown";

/** Everything the deck overview shows for one deck. Matches of another deck id are not looked at. */
export function summarize(ledger: Ledger, deckId: string): DeckSummary {
  const mine = ledger.matches.filter((m) => m.deckId === deckId);
  const overall = emptyTally(),
    onThePlay = emptyTally(),
    onTheDraw = emptyTally(),
    opponents = new Map<string, OpponentSummary>(),
    versions = new Map<string, VersionSummary>();
  let turns = 0;
  for (const m of mine) {
    tally(overall, m.result);
    tally(m.first ? onThePlay : onTheDraw, m.result);
    turns += m.turns;
    const key = opponentKey(m.opponent);
    const entry = opponents.get(key) ?? { key, factions: m.opponent.factions, tally: emptyTally() };
    tally(entry.tally, m.result);
    opponents.set(key, entry);
    const v = versions.get(m.version) ?? {
      version: m.version,
      cards: ledger.versions[m.version]?.cards ?? null,
      firstAt: m.at,
      lastAt: m.at,
      tally: emptyTally(),
      diff: null,
    };
    tally(v.tally, m.result);
    if (m.at < v.firstAt) v.firstAt = m.at;
    if (m.at > v.lastAt) v.lastAt = m.at;
    versions.set(m.version, v);
  }
  const ordered = [...versions.values()].sort(
    (a, b) => Date.parse(a.firstAt) - Date.parse(b.firstAt),
  );
  ordered.forEach((v, i) => {
    const before = ordered[i - 1];
    if (before?.cards && v.cards) v.diff = diffCards(before.cards, v.cards);
  });
  return {
    overall,
    onThePlay,
    onTheDraw,
    opponents: [...opponents.values()].sort(
      (a, b) => b.tally.games - a.tally.games || a.key.localeCompare(b.key),
    ),
    versions: ordered,
    recent: mine
      .slice(-10)
      .reverse()
      .map((m) => m.result),
    averageTurns: mine.length ? turns / mine.length : 0,
  };
}
