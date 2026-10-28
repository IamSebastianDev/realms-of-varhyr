import { deckRules, type CardDefinition, type Registry } from "@realms/contracts";
import { validateDeck } from "@realms/core";
import { energyProductionOptions } from "@realms/core/production";
import { drawCard } from "@realms/content/boosters";
import { factions as namedFactions } from "@realms/content/factions";
import { neutralId } from "@realms/content/factionDefinition";
import { makeRng, type Rng } from "@realms/quest/rng";

/**
 * The faction draft. Three drafters (you and two bots) open a pack each, pick one card and pass the rest on.
 * It has two halves of four rounds. In the first, everybody drafts boosters of one faction; then every drafter chooses a faction
 * at the same time, the choices are revealed together, and each drafter opens four boosters of their own choice.
 * Everything here is pure: a run is plain data, so it can be saved, resumed and replayed from its seed.
 */
export type PayoutTier = { crowns: number; boosters: number };

/** Provisional tuning. Wins out of four, so five tiers. A booster counts as 100 crowns. */
export const draftRules = {
  drafters: 3,
  packSize: 6,
  rounds: 8,
  /** Rounds in each half of the draft. */ phaseRounds: 4,
  entryFee: 1500,
  matches: 4,
  /** A faction can be drafted once it has this many cards of its own and a free producer for its boosters to guarantee. */ minimumRoster: 12,
} as const;
export const defaultPayout: readonly PayoutTier[] = [
  { crowns: 250, boosters: 1 },
  { crowns: 450, boosters: 2 },
  { crowns: 600, boosters: 3 },
  { crowns: 800, boosters: 5 },
  { crowns: 1100, boosters: 8 },
];

/** A named draft: what it costs and what it pays. Which cards it deals comes from the factions the drafters choose. */
export type DraftPreset = {
  id: string;
  name: string;
  blurb: string;
  entryFee: number;
  rounds: number;
  packSize: number;
  payout: readonly PayoutTier[];
};
export const draftPresets: DraftPreset[] = [
  {
    id: "faction-draft",
    name: "Faction Draft",
    blurb: "Draft a faction, then choose a second one.",
    entryFee: draftRules.entryFee,
    rounds: draftRules.rounds,
    packSize: draftRules.packSize,
    payout: defaultPayout,
  },
];
export const presetById = (id: string) => draftPresets.find((preset) => preset.id === id);

export const costOf = (card: CardDefinition) =>
  card.cost.generic + Object.values(card.cost.factions).reduce((sum, n) => sum + n, 0);
export const isProducer = (card: CardDefinition, registry: Registry) =>
  card.type !== "spell" &&
  energyProductionOptions(card, registry).some((output) =>
    Object.values(output).some((n) => n > 0),
  );
/** A producer you can play for nothing: what the rules call a producer in a draft. */
export const isFreeProducer = (card: CardDefinition, registry: Registry) =>
  costOf(card) === 0 && isProducer(card, registry);

export const isNeutralCard = (card: CardDefinition) =>
  card.factions.length === 0 || card.factions.every((faction) => faction === neutralId);
/** What a booster of a faction can contain: its own cards, every hybrid that includes it, and neutrals. */
export const factionPool = (cards: CardDefinition[], faction: string) =>
  cards.filter((card) => card.factions.includes(faction) || isNeutralCard(card));
/** The guaranteed card of a booster: a free producer of the faction itself. Never a hybrid, a neutral or a legendary. */
export const guaranteedProducers = (cards: CardDefinition[], faction: string, registry: Registry) =>
  cards.filter(
    (card) =>
      card.factions.length === 1 &&
      card.factions[0] === faction &&
      !card.legendary &&
      isFreeProducer(card, registry),
  );
/** Factions that have the cards and the producers to fill boosters of their own. */
export const draftableFactions = (registry: Registry): string[] => {
  const all = Object.values(registry.cards);
  return namedFactions.filter(
    (faction) =>
      all.filter((card) => card.factions.length === 1 && card.factions[0] === faction).length >=
        draftRules.minimumRoster && guaranteedProducers(all, faction, registry).length > 0,
  );
};
/** The hybrids that join two factions: the cards a drafter takes at the risk of never using them. */
export const isHybrid = (card: CardDefinition) =>
  card.factions.filter((faction) => faction !== neutralId).length > 1;

/** One draft booster of a faction: a guaranteed free producer of that faction plus five normal cards, in a shuffled order. */
export function makeDraftPack(
  registry: Registry,
  faction: string,
  rng: Rng,
  size: number = draftRules.packSize,
): string[] {
  const all = Object.values(registry.cards),
    pool = factionPool(all, faction),
    free = guaranteedProducers(all, faction, registry);
  if (!free.length) throw new Error(`The ${faction} boosters have no producer to guarantee.`);
  const normal = Array.from({ length: size - 1 }, () => drawCard(pool, rng.next));
  return rng.shuffle([rng.pick(free).id, ...normal]);
}

export type DraftState = {
  seed: number;
  preset: string;
  /** The faction of everybody's first four boosters. */
  pod: string;
  /** What each drafter chose for the second half. Null until all of them have chosen; then the choices are public. */
  factions: (string | null)[];
  /** Between the halves: the drafters are choosing their faction and no pack is in play. */
  awaiting: boolean;
  /** Every pack of the draft, round by round: rounds x drafters. Drafter 0 is you. */
  deal: string[][];
  round: number;
  step: number;
  /** The pack now in front of each drafter. */
  held: string[][];
  picks: string[][];
  done: boolean;
};

/** The boosters of rounds `from` up to `to`, one for each drafter, of the faction that drafter brings. */
function dealRounds(
  registry: Registry,
  seed: number,
  factions: string[],
  from: number,
  to: number,
): string[][] {
  const deal: string[][] = [];
  for (let round = from; round < to; round++)
    for (let drafter = 0; drafter < draftRules.drafters; drafter++)
      deal.push(
        makeDraftPack(registry, factions[drafter]!, makeRng(`${seed}:deal:${round}:${drafter}`)),
      );
  return deal;
}

export function startDraft(
  preset: DraftPreset,
  registry: Registry,
  seed: number,
  pod: string,
): DraftState {
  if (!draftableFactions(registry).includes(pod))
    throw new Error("That faction cannot be drafted yet.");
  const deal = dealRounds(registry, seed, [pod, pod, pod], 0, draftRules.phaseRounds);
  return {
    seed,
    preset: preset.id,
    pod,
    factions: [null, null, null],
    awaiting: false,
    deal,
    round: 0,
    step: 0,
    held: deal.slice(0, draftRules.drafters).map((pack) => [...pack]),
    picks: Array.from({ length: draftRules.drafters }, () => []),
    done: false,
  };
}

const rarityValue = { common: 1, rare: 3, legendary: 5 } as const;
/** How good a card is on its own, before the drafter's colours and needs are considered. */
export function cardValue(card: CardDefinition, registry: Registry): number {
  if (isFreeProducer(card, registry)) return 0.5;
  const power = card.stats ? (card.stats.attack + card.stats.defense) / (costOf(card) + 2) : 1.2;
  return rarityValue[card.rarity] + power + (isProducer(card, registry) ? 0.5 : 0);
}
function topFactions(cards: CardDefinition[], registry: Registry, count = 2): string[] {
  const weight = new Map<string, number>();
  for (const card of cards)
    for (const faction of card.factions)
      weight.set(faction, (weight.get(faction) ?? 0) + cardValue(card, registry));
  return [...weight]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, count)
    .map((entry) => entry[0]);
}

/**
 * The faction a bot brings to the second half: the partner of the hybrids it holds, else a second faction (the first one again is
 * a little less likely). It looks only at its own picks, so nobody can react to what the others chose.
 */
export function botFaction(picks: string[], pod: string, registry: Registry, rng: Rng): string {
  const owned = picks.map((id) => registry.cards[id]!),
    candidates = draftableFactions(registry);
  let best = pod,
    bestScore = -Infinity;
  for (const faction of candidates) {
    const hybrids = owned
      .filter((card) => isHybrid(card) && card.factions.includes(faction))
      .reduce((sum, card) => sum + cardValue(card, registry), 0);
    const score = hybrids + (faction === pod ? -0.5 : 1) + rng.next() * 1.5;
    if (score > bestScore) {
      best = faction;
      bestScore = score;
    }
  }
  return best;
}

/** A bot takes the best card for its colours so far, makes sure it gets producers, and does not take a second legendary. */
export function botPick(pack: string[], picks: string[], registry: Registry, rng: Rng): string {
  const owned = picks.map((id) => registry.cards[id]!),
    top = topFactions(owned, registry);
  const free = owned.filter((card) => isFreeProducer(card, registry)).length;
  let best = pack[0]!,
    bestScore = -Infinity;
  for (const id of pack) {
    const card = registry.cards[id]!;
    let score = cardValue(card, registry) + rng.next() * 0.6;
    if (isFreeProducer(card, registry)) score += free < 8 ? 3 : free < 11 ? 1 : -3;
    if (card.factions.length === 0) score += 0.3;
    else if (card.factions.every((faction) => top.includes(faction))) score += 1.5;
    else if (card.factions.some((faction) => top.includes(faction))) score += 0.5;
    else score -= Math.min(3, picks.length / 6);
    if (card.legendary && owned.some((other) => other.deckLimitKey === card.deckLimitKey))
      score -= 4;
    if (score > bestScore) {
      best = id;
      bestScore = score;
    }
  }
  return best;
}

/**
 * One step of the draft for the whole table. `choices` holds a card for each human seat and null for a seat a bot plays.
 * Everyone picks from the pack in front of them, then the packs move on.
 */
export function pickRound(
  state: DraftState,
  preset: DraftPreset,
  registry: Registry,
  choices: (string | null)[],
): DraftState {
  if (state.done) throw new Error("The draft is over.");
  if (state.awaiting) throw new Error("Choose your faction first.");
  const picks = state.picks.map((list) => [...list]);
  let held = state.held.map((pack) => [...pack]);
  const take = (drafter: number, id: string) => {
    held[drafter]!.splice(held[drafter]!.indexOf(id), 1);
    picks[drafter]!.push(id);
  };
  for (let drafter = 0; drafter < draftRules.drafters; drafter++) {
    const choice = choices[drafter] ?? null;
    if (choice !== null && !held[drafter]!.includes(choice))
      throw new Error("That card is not in your pack.");
    take(
      drafter,
      choice ??
        botPick(
          held[drafter]!,
          picks[drafter]!,
          registry,
          makeRng(`${state.seed}:${state.round}:${state.step}:${drafter}`),
        ),
    );
  }
  let { round, step } = state;
  const pass = () => {
    held = held.map(
      (_, drafter) => held[(drafter + draftRules.drafters - 1) % draftRules.drafters]!,
    );
  };
  pass();
  step++;
  let done = false,
    awaiting = false;
  if (step >= preset.packSize) {
    round++;
    step = 0;
    if (round >= preset.rounds) done = true;
    else if (
      round === draftRules.phaseRounds &&
      state.factions.some((faction) => faction === null)
    ) {
      awaiting = true;
      held = [[], [], []];
    } else
      held = state.deal
        .slice(round * draftRules.drafters, (round + 1) * draftRules.drafters)
        .map((pack) => [...pack]);
  }
  return { ...state, round, step, held, picks, done, awaiting };
}

/**
 * Between the halves every drafter chooses a faction. `choices` holds a faction for each person and null for a seat a bot plays;
 * the choices are revealed together, and the boosters of the second half are dealt from them.
 */
export function chooseFactions(
  state: DraftState,
  registry: Registry,
  choices: (string | null)[],
): DraftState {
  if (!state.awaiting) throw new Error("Nobody is choosing a faction now.");
  const allowed = draftableFactions(registry);
  const factions = state.picks.map((picks, drafter) => {
    const choice = choices[drafter] ?? null;
    if (choice === null)
      return botFaction(picks, state.pod, registry, makeRng(`${state.seed}:faction:${drafter}`));
    if (!allowed.includes(choice)) throw new Error("That faction cannot be drafted yet.");
    return choice;
  });
  const deal = [
    ...state.deal,
    ...dealRounds(registry, state.seed, factions, draftRules.phaseRounds, draftRules.rounds),
  ];
  return {
    ...state,
    factions,
    awaiting: false,
    deal,
    held: deal
      .slice(state.round * draftRules.drafters, (state.round + 1) * draftRules.drafters)
      .map((pack) => [...pack]),
  };
}

/** You take a card from your pack; both bots pick and the packs move on. The last card of a pack is picked like any other. */
export function pickCard(
  state: DraftState,
  preset: DraftPreset,
  registry: Registry,
  cardId: string,
): DraftState {
  if (state.awaiting) throw new Error("Choose your faction first.");
  if (!state.done && !state.held[0]!.includes(cardId))
    throw new Error("That card is not in your pack.");
  return pickRound(state, preset, registry, [cardId, null, null]);
}

/** A bot's 30-card deck from its picks: its two best colours, about nine producers, the best of the rest. Legendaries once. */
export function buildBotDeck(pool: string[], registry: Registry): string[] {
  const cards = pool.map((id) => registry.cards[id]!);
  const top = topFactions(cards, registry),
    fits = (card: CardDefinition) => card.factions.every((faction) => top.includes(faction));
  const ranked = pool
    .map((id, index) => ({ id, index, card: registry.cards[id]! }))
    .sort((a, b) => cardValue(b.card, registry) - cardValue(a.card, registry) || a.index - b.index);
  const deck: string[] = [],
    used = new Set<number>(),
    legendaries = new Set<string>();
  const add = (entry: (typeof ranked)[number]) => {
    if (used.has(entry.index) || deck.length >= deckRules.minimumCards) return;
    if (entry.card.legendary) {
      if (legendaries.has(entry.card.deckLimitKey)) return;
      legendaries.add(entry.card.deckLimitKey);
    }
    used.add(entry.index);
    deck.push(entry.id);
  };
  for (const entry of ranked)
    if (fits(entry.card) && isFreeProducer(entry.card, registry) && deck.length < 9) add(entry);
  for (const entry of ranked)
    if (fits(entry.card) && !isFreeProducer(entry.card, registry)) add(entry);
  for (const entry of ranked) if (fits(entry.card)) add(entry);
  for (const entry of ranked) add(entry);
  return deck;
}

export type DraftResult = "won" | "lost" | "draw";
export type DraftMatch = {
  /** Which other drafter, counted from your seat: 1 is the one you pass to, 2 the one you receive from. */
  opponent: 1 | 2;
  seed: number;
  result: DraftResult | null;
  /** At a table with other people: the match's place in the table's schedule, whether the opponent is a person, and whether you are the first seat. */
  table?: { index: number; human: boolean; first: boolean };
};
export type DraftStage = "draft" | "build" | "matches" | "finished";
export type DraftRun = {
  id: string;
  preset: string;
  seed: number;
  startedAt: number;
  stage: DraftStage;
  draft: DraftState;
  deck: string[];
  bots: { name: string; deck: string[] }[];
  matches: DraftMatch[];
  /** Ended early: the wins so far are paid and the cards are kept. */
  dropped: boolean;
  fee: number;
  /** A draft at a table with other people: the room, your seat there and the names around you (you first). */
  table?: {
    code: string;
    seat: number;
    names: [string, string, string];
    humans: [boolean, boolean, boolean];
    host: boolean;
  };
};
const botNames = [
  "Brannoch the Quartermaster",
  "Isolde Vane",
  "Old Hask",
  "Maren of the Reach",
  "Tolliver Grey",
  "Sister Ysolde",
  "Kell Ashmoor",
  "The Pale Cartographer",
];
/** The two bots' names for a seed, known from the first pick so the table can be shown while drafting. */
export const botNamesFor = (seed: number): [string, string] => {
  const names = makeRng(`${seed}:bots`).shuffle(botNames);
  return [names[0]!, names[1]!];
};

export function startRun(
  preset: DraftPreset,
  registry: Registry,
  options: { id: string; seed: number; now: number; faction: string },
): DraftRun {
  return {
    id: options.id,
    preset: preset.id,
    seed: options.seed,
    startedAt: options.now,
    stage: "draft",
    draft: startDraft(preset, registry, options.seed, options.faction),
    deck: [],
    bots: [],
    matches: [],
    dropped: false,
    fee: preset.entryFee,
  };
}

/** Your faction for the second half. The bots choose theirs from their own picks, so nobody reacts to anybody. */
export function chooseFaction(run: DraftRun, registry: Registry, faction: string): DraftRun {
  if (run.stage !== "draft" || !run.draft.awaiting)
    throw new Error("Nobody is choosing a faction now.");
  return { ...run, draft: chooseFactions(run.draft, registry, [faction, null, null]) };
}
/** The factions a run is drafted from: the shared one, then the one you chose once the choices are in. */
export const factionsOf = (draft: DraftState): string[] => [
  ...new Set([draft.pod, ...(draft.factions[0] ? [draft.factions[0]] : [])]),
];

/** Double round-robin, seen from your seat: each bot twice, alternating. Matches between the bots do not matter. */
function scheduleMatches(seed: number): DraftMatch[] {
  const rng = makeRng(`${seed}:matches`);
  return ([1, 2, 1, 2] as const).map((opponent) => ({
    opponent,
    seed: Math.max(1, rng.int(2 ** 32)),
    result: null,
  }));
}

export function takePick(
  run: DraftRun,
  preset: DraftPreset,
  registry: Registry,
  cardId: string,
): DraftRun {
  if (run.stage !== "draft") throw new Error("The draft is over.");
  const draft = pickCard(run.draft, preset, registry, cardId);
  if (!draft.done) return { ...run, draft };
  const names = botNamesFor(run.seed);
  return {
    ...run,
    draft,
    stage: "build",
    bots: [1, 2].map((seat) => ({
      name: names[seat - 1]!,
      deck: buildBotDeck(draft.picks[seat]!, registry),
    })),
    matches: scheduleMatches(run.seed),
  };
}

export const poolOf = (run: DraftRun) => run.draft.picks[0]!;
/** Why a deck cannot be played: draft rules, and only cards from your own picks. */
export function deckProblems(deck: string[], pool: string[], registry: Registry): string[] {
  const errors = validateDeck(deck, registry, { draft: true }),
    have = new Map<string, number>();
  for (const id of pool) have.set(id, (have.get(id) ?? 0) + 1);
  for (const id of deck) have.set(id, (have.get(id) ?? 0) - 1);
  if ([...have.values()].some((left) => left < 0))
    errors.push("The deck uses cards you did not draft.");
  return errors;
}
export function setDeck(run: DraftRun, deck: string[], registry: Registry): DraftRun {
  if (run.stage !== "build" && run.stage !== "matches") throw new Error("Finish the draft first.");
  const errors = deckProblems(deck, poolOf(run), registry);
  if (errors.length) throw new Error(errors.join(" "));
  return { ...run, deck: [...deck], stage: "matches" };
}

export const nextMatch = (run: DraftRun): number => run.matches.findIndex((match) => !match.result);
export const winsOf = (run: DraftRun) =>
  run.matches.filter((match) => match.result === "won").length;
export const playedOf = (run: DraftRun) => run.matches.filter((match) => match.result).length;
/** Idempotent: a result that is already recorded is never replaced. */
export function recordResult(run: DraftRun, index: number, result: DraftResult): DraftRun {
  if (!run.matches[index] || run.matches[index]!.result) return run;
  return {
    ...run,
    matches: run.matches.map((match, at) => (at === index ? { ...match, result } : match)),
  };
}
export const dropRun = (run: DraftRun): DraftRun =>
  run.stage === "finished" ? run : { ...run, dropped: true };
/** All matches are played, or the run was dropped: ready to be paid out. */
export const isRunComplete = (run: DraftRun) =>
  run.stage !== "draft" &&
  (run.dropped || (run.matches.length > 0 && run.matches.every((match) => match.result)));
export const payoutFor = (preset: DraftPreset, wins: number): PayoutTier =>
  preset.payout[Math.max(0, Math.min(preset.payout.length - 1, wins))]!;
/** The best payout still within reach: wins so far plus every match left. */
export const bestPossible = (run: DraftRun) =>
  winsOf(run) + run.matches.filter((match) => !match.result).length;
/** Saved runs come back from storage as plain data; reject anything that is not shaped like one. */
export function parseRun(value: unknown): DraftRun | null {
  const run = value as DraftRun | null;
  if (
    !run ||
    typeof run !== "object" ||
    typeof run.id !== "string" ||
    typeof run.preset !== "string" ||
    !run.draft ||
    !Array.isArray(run.draft.picks) ||
    !Array.isArray(run.draft.held) ||
    !Array.isArray(run.draft.deal) ||
    typeof run.draft.pod !== "string" ||
    !Array.isArray(run.draft.factions) ||
    typeof run.draft.awaiting !== "boolean" ||
    !Array.isArray(run.deck) ||
    !Array.isArray(run.matches) ||
    !Array.isArray(run.bots) ||
    !["draft", "build", "matches", "finished"].includes(run.stage)
  )
    return null;
  return run;
}
