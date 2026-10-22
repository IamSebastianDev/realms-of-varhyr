import type { Registry } from "@realms/contracts";
import { makeRng } from "@realms/quest/rng";
import {
  botFaction,
  botPick,
  buildBotDeck,
  chooseFactions,
  deckProblems,
  draftRules,
  draftableFactions,
  pickRound,
  startDraft,
  type DraftMatch,
  type DraftPreset,
  type DraftResult,
  type DraftRun,
  type DraftStage,
  type DraftState,
} from "./index";

/**
 * A draft table: three seats, each a person or a bot. The host of the room owns the table and is the only one who changes it.
 * Everything here is pure data in, data out, so a table can be tested without a network and resumed from its parts.
 */
export type TableSeat = {
  name: string;
  human: boolean;
  /** Proves a returning person owns the seat. Never leaves the host. */
  token: string;
  avatar?: string;
  cardBack?: string;
  /** A person who left: a bot plays the seat's picks and deck from then on, and its open matches are lost. */
  left?: boolean;
};
/** `a` is the first seat of the match (player one). The result is seen from `a`. */
export type TableMatch = {
  a: number;
  b: number;
  seed: number;
  result: "a" | "b" | "draw" | null;
  forfeit?: boolean;
};
export type DraftTable = {
  id: string;
  preset: string;
  seed: number;
  startedAt: number;
  seats: TableSeat[];
  draft: DraftState;
  /** What each person has chosen from the pack in front of them, until the whole table has chosen. */
  pending: (string | null)[];
  decks: (string[] | null)[];
  stage: DraftStage;
  matches: TableMatch[];
};

/** Double round-robin, one match per round, each pair twice with the first seat swapped. */
export const tableSchedule: readonly [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 0],
  [1, 0],
  [2, 1],
  [0, 2],
];

/** A seat a bot plays: it was never a person, or the person has left. */
export const botSeat = (table: DraftTable, seat: number) =>
  !table.seats[seat]!.human || !!table.seats[seat]!.left;
/** Matches that can change somebody's payout: a person who is still at the table plays in them. Bot against bot is never played. */
export const countsFor = (table: DraftTable, match: TableMatch) =>
  !botSeat(table, match.a) || !botSeat(table, match.b);

export function createTable(
  preset: DraftPreset,
  registry: Registry,
  options: {
    id: string;
    seed: number;
    now: number;
    seats: TableSeat[];
    /** The faction the whole table drafts first. */ faction: string;
  },
): DraftTable {
  if (options.seats.length !== draftRules.drafters)
    throw new Error("A draft table has three seats.");
  const rng = makeRng(`${options.seed}:table`);
  return {
    id: options.id,
    preset: preset.id,
    seed: options.seed,
    startedAt: options.now,
    seats: options.seats.map((seat) => ({ ...seat })),
    draft: startDraft(preset, registry, options.seed, options.faction),
    pending: [null, null, null],
    decks: [null, null, null],
    stage: "draft",
    matches: tableSchedule.map(([a, b]) => ({
      a,
      b,
      seed: Math.max(1, rng.int(2 ** 32)),
      result: null,
    })),
  };
}

/** People who still have to choose a card from this pack. */
export const waitingOn = (table: DraftTable): number[] =>
  table.stage !== "draft"
    ? []
    : table.seats.flatMap((_, seat) =>
        !botSeat(table, seat) && table.pending[seat] === null ? [seat] : [],
      );
/** People who still have to hand in a deck. */
export const deckWaitingOn = (table: DraftTable): number[] =>
  table.stage !== "build"
    ? []
    : table.seats.flatMap((_, seat) => (!botSeat(table, seat) && !table.decks[seat] ? [seat] : []));

/** When nobody is left to choose, the step is played and the table moves on; at the end of the draft the bots build their decks. */
function settle(table: DraftTable, preset: DraftPreset, registry: Registry): DraftTable {
  if (table.stage !== "draft" || waitingOn(table).length) return table;
  const choices = table.seats.map((_, seat) =>
    botSeat(table, seat) ? null : table.pending[seat]!,
  );
  // Between the halves the pending choices are factions, revealed together once the last person has chosen.
  if (table.draft.awaiting)
    return {
      ...table,
      draft: chooseFactions(table.draft, registry, choices),
      pending: [null, null, null],
    };
  const draft = pickRound(table.draft, preset, registry, choices);
  const next: DraftTable = { ...table, draft, pending: [null, null, null] };
  if (!draft.done) return next;
  const decks = table.decks.map((deck, seat) =>
    botSeat(table, seat) ? buildBotDeck(draft.picks[seat]!, registry) : deck,
  );
  return startMatches({ ...next, stage: "build", decks });
}
/** Once every person has a deck the matches begin. */
function startMatches(table: DraftTable): DraftTable {
  return table.stage === "build" && !deckWaitingOn(table).length
    ? { ...table, stage: "matches" }
    : table;
}

export function submitPick(
  table: DraftTable,
  preset: DraftPreset,
  registry: Registry,
  seat: number,
  cardId: string,
): DraftTable {
  if (table.stage !== "draft") throw new Error("The draft is over.");
  if (botSeat(table, seat)) throw new Error("This seat is played by a bot.");
  if (table.draft.awaiting) throw new Error("Choose your faction first.");
  if (table.pending[seat] !== null) throw new Error("You already chose a card from this pack.");
  if (!table.draft.held[seat]!.includes(cardId)) throw new Error("That card is not in your pack.");
  const pending = [...table.pending];
  pending[seat] = cardId;
  return settle({ ...table, pending }, preset, registry);
}
/** A person's faction for the second half. It stays hidden from the others until everybody has chosen. */
export function submitFaction(
  table: DraftTable,
  preset: DraftPreset,
  registry: Registry,
  seat: number,
  faction: string,
): DraftTable {
  if (table.stage !== "draft" || !table.draft.awaiting)
    throw new Error("Nobody is choosing a faction now.");
  if (botSeat(table, seat)) throw new Error("This seat is played by a bot.");
  if (table.pending[seat] !== null) throw new Error("You already chose a faction.");
  if (!draftableFactions(registry).includes(faction))
    throw new Error("That faction cannot be drafted yet.");
  const pending = [...table.pending];
  pending[seat] = faction;
  return settle({ ...table, pending }, preset, registry);
}
/** What a bot would take from this seat's pack: used when a person runs out of time. */
export const autoChoice = (table: DraftTable, registry: Registry, seat: number) =>
  botPick(
    table.draft.held[seat]!,
    table.draft.picks[seat]!,
    registry,
    makeRng(`${table.seed}:auto:${table.draft.round}:${table.draft.step}:${seat}`),
  );
export function autoPick(
  table: DraftTable,
  preset: DraftPreset,
  registry: Registry,
  seat: number,
): DraftTable {
  if (table.draft.awaiting)
    return submitFaction(
      table,
      preset,
      registry,
      seat,
      botFaction(
        table.draft.picks[seat]!,
        table.draft.pod,
        registry,
        makeRng(`${table.seed}:autofaction:${seat}`),
      ),
    );
  return submitPick(table, preset, registry, seat, autoChoice(table, registry, seat));
}
/** The time is up: everyone who has not chosen gets a bot's pick. */
export function autoPickAll(
  table: DraftTable,
  preset: DraftPreset,
  registry: Registry,
): DraftTable {
  let next = table;
  for (const seat of waitingOn(table)) next = autoPick(next, preset, registry, seat);
  return next;
}

export function submitDeck(
  table: DraftTable,
  registry: Registry,
  seat: number,
  deck: string[],
): DraftTable {
  if (table.stage !== "build" && table.stage !== "matches")
    throw new Error("Finish the draft first.");
  if (botSeat(table, seat)) throw new Error("This seat is played by a bot.");
  const errors = deckProblems(deck, table.draft.picks[seat]!, registry);
  if (errors.length) throw new Error(errors.join(" "));
  const decks = [...table.decks];
  decks[seat] = [...deck];
  return startMatches({ ...table, decks });
}
/** The time is up: everyone without a deck gets the suggested one. */
export function autoDeckAll(table: DraftTable, registry: Registry): DraftTable {
  let next = table;
  for (const seat of deckWaitingOn(table))
    next = submitDeck(next, registry, seat, buildBotDeck(table.draft.picks[seat]!, registry));
  return next;
}

/** Idempotent: a result that is already in is never replaced. `result` is seen from the first seat of the match. */
export function recordTableResult(
  table: DraftTable,
  index: number,
  result: "a" | "b" | "draw",
  forfeit = false,
): DraftTable {
  const match = table.matches[index];
  if (!match || match.result) return table;
  return {
    ...table,
    matches: table.matches.map((entry, at) =>
      at === index ? { ...entry, result, ...(forfeit ? { forfeit: true } : {}) } : entry,
    ),
  };
}
/** A seat that would be the bot's anyway has no one to report for it. */
export const matchIsLive = (table: DraftTable, match: TableMatch) =>
  !botSeat(table, match.a) && !botSeat(table, match.b);

/**
 * A person leaves for good. A bot takes over their picks and their deck, and every match of theirs that is still open is lost to the
 * other seat. What they won so far is theirs, and the cards they drafted go home with them.
 */
export function leaveSeat(
  table: DraftTable,
  preset: DraftPreset,
  registry: Registry,
  seat: number,
): DraftTable {
  if (botSeat(table, seat)) return table;
  const seats = table.seats.map((entry, at) => (at === seat ? { ...entry, left: true } : entry));
  let next: DraftTable = {
    ...table,
    seats,
    pending: table.pending.map((card, at) => (at === seat ? null : card)),
  };
  if (next.stage === "draft") return settle(next, preset, registry);
  if (!next.decks[seat])
    next = {
      ...next,
      decks: next.decks.map((deck, at) =>
        at === seat ? buildBotDeck(next.draft.picks[seat]!, registry) : deck,
      ),
    };
  next = startMatches(next);
  // Forfeit only the matches the seat can still lose: against another person, or against a bot that plays on.
  next = {
    ...next,
    matches: next.matches.map((match) => {
      if (match.result || (match.a !== seat && match.b !== seat)) return match;
      const other = match.a === seat ? match.b : match.a;
      return table.seats[other]!.human && !table.seats[other]!.left
        ? { ...match, result: other === match.a ? "a" : "b", forfeit: true }
        : match;
    }),
  };
  return next;
}

/** Everything the table has settled: every match that counts has a result. */
export const tableComplete = (table: DraftTable) =>
  table.stage !== "draft" &&
  table.matches.filter((match) => countsFor(table, match)).every((match) => match.result);

const rotate = <T>(items: readonly T[], seat: number) =>
  items.map((_, at) => items[(at + seat) % items.length]!);
const resultFor = (match: TableMatch, seat: number): DraftResult | null =>
  match.result === null
    ? null
    : match.result === "draw"
      ? "draw"
      : (match.result === "a") === (match.a === seat)
        ? "won"
        : "lost";

/**
 * The table as one person sees it, in the shape of a run against bots: you are seat 0, the drafter you pass to is 1 and the
 * one you receive from is 2. Other drafters' packs and picks, and every deal still to come, stay with the host.
 */
export function viewFor(
  table: DraftTable,
  seat: number,
  options: { code: string; host: boolean; fee: number },
): DraftRun {
  const at = (other: number) => (other - seat + 3) % 3;
  const names = rotate(
    table.seats.map((entry) => entry.name),
    seat,
  ) as [string, string, string];
  const humans = rotate(
    table.seats.map((_, index) => !botSeat(table, index)),
    seat,
  ) as [boolean, boolean, boolean];
  const draft: DraftState = {
    seed: table.seed,
    preset: table.preset,
    pod: table.draft.pod,
    factions: rotate(table.draft.factions, seat),
    awaiting: table.draft.awaiting,
    deal: [],
    round: table.draft.round,
    step: table.draft.step,
    done: table.draft.done,
    held: [table.draft.held[seat]!, [], []],
    picks: [table.draft.picks[seat]!, [], []],
  };
  const mine = table.matches.flatMap((match, index) =>
    match.a === seat || match.b === seat ? [{ match, index }] : [],
  );
  const matches: DraftMatch[] = mine.map(({ match, index }) => {
    const other = match.a === seat ? match.b : match.a;
    return {
      opponent: at(other) as 1 | 2,
      seed: match.seed,
      result: resultFor(match, seat),
      table: { index, human: !botSeat(table, other), first: match.a === seat },
    };
  });
  const bots = [1, 2].map((rotated) => {
    const index = (seat + rotated) % 3;
    return {
      name: table.seats[index]!.name,
      deck: botSeat(table, index) && table.stage !== "draft" ? (table.decks[index] ?? []) : [],
    };
  });
  return {
    id: table.id,
    preset: table.preset,
    seed: table.seed,
    startedAt: table.startedAt,
    stage: table.stage,
    draft,
    deck: table.decks[seat] ?? [],
    bots,
    matches: table.stage === "draft" ? [] : matches,
    dropped: !!table.seats[seat]!.left,
    fee: options.fee,
    table: { code: options.code, seat, names, humans, host: options.host },
  };
}
