import { deckRules, type CardDefinition, type Registry } from '../../contracts/src';
import { validateDeck } from '../../core/src';
import { energyProductionOptions } from '../../core/src/production';
import { boosterPacks, drawBooster, packCards } from '../../content/src/boosters';
import { makeRng, type Rng } from '../../quest/src/rng';

/**
 * The faction draft. Three drafters (you and two bots) open a pack each, pick one card and pass the rest on.
 * Everything here is pure: a run is plain data, so it can be saved, resumed and replayed from its seed.
 */
export type PayoutTier = { crowns: number; boosters: number };

/** Provisional tuning. Wins out of four, so five tiers. A booster counts as 100 crowns. */
export const draftRules = { drafters: 3, packSize: 6, rounds: 8, entryFee: 1500, matches: 4 } as const;
export const defaultPayout: readonly PayoutTier[] = [
  { crowns: 250, boosters: 1 }, { crowns: 450, boosters: 2 }, { crowns: 600, boosters: 3 }, { crowns: 800, boosters: 5 }, { crowns: 1100, boosters: 8 },
];

/** A named draft: which boosters feed it, what it costs and what it pays. New drafts are new entries, not new code. */
export type DraftPreset = {
  id: string; name: string; blurb: string; color: string;
  /** Booster ids, dealt in turn: the packs of round r are packs[(3r + drafter) % packs.length]. */
  packs: string[];
  entryFee: number; rounds: number; packSize: number; payout: readonly PayoutTier[];
};
export const draftPresets: DraftPreset[] = boosterPacks.map(pack => ({
  id: `draft-${pack.id}`, name: pack.name, blurb: pack.blurb, color: pack.color, packs: [pack.id],
  entryFee: draftRules.entryFee, rounds: draftRules.rounds, packSize: draftRules.packSize, payout: defaultPayout,
}));
export const presetById = (id: string) => draftPresets.find(preset => preset.id === id);

export const costOf = (card: CardDefinition) => card.cost.generic + Object.values(card.cost.factions).reduce((sum, n) => sum + n, 0);
export const isProducer = (card: CardDefinition, registry: Registry) => card.type === 'creature' && energyProductionOptions(card, registry).some(output => Object.values(output).some(n => n > 0));
/** A producer you can play for nothing: what the rules call a producer in a draft. */
export const isFreeProducer = (card: CardDefinition, registry: Registry) => costOf(card) === 0 && isProducer(card, registry);

/** One draft booster: a guaranteed free producer plus five normal cards, in a shuffled order. */
export function makeDraftPack(pool: CardDefinition[], registry: Registry, rng: Rng, size: number = draftRules.packSize): string[] {
  const free = pool.filter(card => isFreeProducer(card, registry));
  if (!free.length) throw new Error('This booster has no producers to guarantee.');
  const normal = Array.from({ length: size - 1 }, () => drawBooster(pool, rng.next)[0]!);
  return rng.shuffle([rng.pick(free).id, ...normal]);
}

export type DraftState = {
  seed: number; preset: string;
  /** Every pack of the draft, round by round: rounds x drafters. Drafter 0 is you. */
  deal: string[][];
  round: number; step: number;
  /** The pack now in front of each drafter. */
  held: string[][];
  picks: string[][];
  done: boolean;
};

export function startDraft(preset: DraftPreset, registry: Registry, seed: number): DraftState {
  const rng = makeRng(seed), all = Object.values(registry.cards);
  const deal: string[][] = [];
  for (let slot = 0; slot < preset.rounds * draftRules.drafters; slot++) {
    const pack = boosterPacks.find(entry => entry.id === preset.packs[slot % preset.packs.length]);
    if (!pack) throw new Error(`Unknown booster in ${preset.id}.`);
    deal.push(makeDraftPack(packCards(all, pack), registry, rng, preset.packSize));
  }
  return { seed, preset: preset.id, deal, round: 0, step: 0, held: deal.slice(0, draftRules.drafters).map(pack => [...pack]), picks: Array.from({ length: draftRules.drafters }, () => []), done: false };
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
  for (const card of cards) for (const faction of card.factions) weight.set(faction, (weight.get(faction) ?? 0) + cardValue(card, registry));
  return [...weight].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, count).map(entry => entry[0]);
}

/** A bot takes the best card for its colours so far, makes sure it gets producers, and does not take a second legendary. */
export function botPick(pack: string[], picks: string[], registry: Registry, rng: Rng): string {
  const owned = picks.map(id => registry.cards[id]!), top = topFactions(owned, registry);
  const free = owned.filter(card => isFreeProducer(card, registry)).length;
  let best = pack[0]!, bestScore = -Infinity;
  for (const id of pack) {
    const card = registry.cards[id]!;
    let score = cardValue(card, registry) + rng.next() * 0.6;
    if (isFreeProducer(card, registry)) score += free < 8 ? 3 : free < 11 ? 1 : -3;
    if (card.factions.length === 0) score += 0.3;
    else if (card.factions.every(faction => top.includes(faction))) score += 1.5;
    else if (card.factions.some(faction => top.includes(faction))) score += 0.5;
    else score -= Math.min(3, picks.length / 6);
    if (card.legendary && owned.some(other => other.deckLimitKey === card.deckLimitKey)) score -= 4;
    if (score > bestScore) { best = id; bestScore = score; }
  }
  return best;
}

/** You take a card from your pack; both bots pick and the packs move on. The last card of a pack is picked like any other. */
export function pickCard(state: DraftState, preset: DraftPreset, registry: Registry, cardId: string): DraftState {
  if (state.done) throw new Error('The draft is over.');
  if (!state.held[0]!.includes(cardId)) throw new Error('That card is not in your pack.');
  const picks = state.picks.map(list => [...list]);
  let held = state.held.map(pack => [...pack]);
  const take = (drafter: number, id: string) => { held[drafter]!.splice(held[drafter]!.indexOf(id), 1); picks[drafter]!.push(id); };
  take(0, cardId);
  for (let drafter = 1; drafter < draftRules.drafters; drafter++) take(drafter, botPick(held[drafter]!, picks[drafter]!, registry, makeRng(`${state.seed}:${state.round}:${state.step}:${drafter}`)));
  let { round, step } = state;
  const pass = () => { held = held.map((_, drafter) => held[(drafter + draftRules.drafters - 1) % draftRules.drafters]!); };
  pass(); step++;
  let done = false;
  if (step >= preset.packSize) {
    round++; step = 0;
    if (round >= preset.rounds) done = true;
    else held = state.deal.slice(round * draftRules.drafters, (round + 1) * draftRules.drafters).map(pack => [...pack]);
  }
  return { ...state, round, step, held, picks, done };
}

/** A bot's 30-card deck from its picks: its two best colours, about nine producers, the best of the rest. Legendaries once. */
export function buildBotDeck(pool: string[], registry: Registry): string[] {
  const cards = pool.map(id => registry.cards[id]!);
  const top = topFactions(cards, registry), fits = (card: CardDefinition) => card.factions.every(faction => top.includes(faction));
  const ranked = pool.map((id, index) => ({ id, index, card: registry.cards[id]! })).sort((a, b) => cardValue(b.card, registry) - cardValue(a.card, registry) || a.index - b.index);
  const deck: string[] = [], used = new Set<number>(), legendaries = new Set<string>();
  const add = (entry: typeof ranked[number]) => {
    if (used.has(entry.index) || deck.length >= deckRules.minimumCards) return;
    if (entry.card.legendary) { if (legendaries.has(entry.card.deckLimitKey)) return; legendaries.add(entry.card.deckLimitKey); }
    used.add(entry.index); deck.push(entry.id);
  };
  for (const entry of ranked) if (fits(entry.card) && isFreeProducer(entry.card, registry) && deck.length < 9) add(entry);
  for (const entry of ranked) if (fits(entry.card) && !isFreeProducer(entry.card, registry)) add(entry);
  for (const entry of ranked) if (fits(entry.card)) add(entry);
  for (const entry of ranked) add(entry);
  return deck;
}

export type DraftResult = 'won' | 'lost' | 'draw';
export type DraftMatch = { /** Which bot: 1 or 2. */ opponent: 1 | 2; seed: number; result: DraftResult | null };
export type DraftStage = 'draft' | 'build' | 'matches' | 'finished';
export type DraftRun = {
  id: string; preset: string; seed: number; startedAt: number; stage: DraftStage;
  draft: DraftState; deck: string[];
  bots: { name: string; deck: string[] }[];
  matches: DraftMatch[];
  /** Ended early: the wins so far are paid and the cards are kept. */
  dropped: boolean;
  fee: number;
};
const botNames = ['Brannoch the Quartermaster', 'Isolde Vane', 'Old Hask', 'Maren of the Reach', 'Tolliver Grey', 'Sister Ysolde', 'Kell Ashmoor', 'The Pale Cartographer'];
/** The two bots' names for a seed, known from the first pick so the table can be shown while drafting. */
export const botNamesFor = (seed: number): [string, string] => { const names = makeRng(`${seed}:bots`).shuffle(botNames); return [names[0]!, names[1]!]; };

export function startRun(preset: DraftPreset, registry: Registry, options: { id: string; seed: number; now: number }): DraftRun {
  return { id: options.id, preset: preset.id, seed: options.seed, startedAt: options.now, stage: 'draft', draft: startDraft(preset, registry, options.seed), deck: [], bots: [], matches: [], dropped: false, fee: preset.entryFee };
}

/** Double round-robin, seen from your seat: each bot twice, alternating. Matches between the bots do not matter. */
function scheduleMatches(seed: number): DraftMatch[] {
  const rng = makeRng(`${seed}:matches`);
  return ([1, 2, 1, 2] as const).map(opponent => ({ opponent, seed: Math.max(1, rng.int(2 ** 32)), result: null }));
}

export function takePick(run: DraftRun, preset: DraftPreset, registry: Registry, cardId: string): DraftRun {
  if (run.stage !== 'draft') throw new Error('The draft is over.');
  const draft = pickCard(run.draft, preset, registry, cardId);
  if (!draft.done) return { ...run, draft };
  const names = botNamesFor(run.seed);
  return { ...run, draft, stage: 'build', bots: [1, 2].map(seat => ({ name: names[seat - 1]!, deck: buildBotDeck(draft.picks[seat]!, registry) })), matches: scheduleMatches(run.seed) };
}

export const poolOf = (run: DraftRun) => run.draft.picks[0]!;
/** Why a deck cannot be played: draft rules, and only cards from your own picks. */
export function deckProblems(deck: string[], pool: string[], registry: Registry): string[] {
  const errors = validateDeck(deck, registry, { draft: true }), have = new Map<string, number>();
  for (const id of pool) have.set(id, (have.get(id) ?? 0) + 1);
  for (const id of deck) have.set(id, (have.get(id) ?? 0) - 1);
  if ([...have.values()].some(left => left < 0)) errors.push('The deck uses cards you did not draft.');
  return errors;
}
export function setDeck(run: DraftRun, deck: string[], registry: Registry): DraftRun {
  if (run.stage !== 'build' && run.stage !== 'matches') throw new Error('Finish the draft first.');
  const errors = deckProblems(deck, poolOf(run), registry);
  if (errors.length) throw new Error(errors.join(' '));
  return { ...run, deck: [...deck], stage: 'matches' };
}

export const nextMatch = (run: DraftRun): number => run.matches.findIndex(match => !match.result);
export const winsOf = (run: DraftRun) => run.matches.filter(match => match.result === 'won').length;
export const playedOf = (run: DraftRun) => run.matches.filter(match => match.result).length;
/** Idempotent: a result that is already recorded is never replaced. */
export function recordResult(run: DraftRun, index: number, result: DraftResult): DraftRun {
  if (!run.matches[index] || run.matches[index]!.result) return run;
  return { ...run, matches: run.matches.map((match, at) => at === index ? { ...match, result } : match) };
}
export const dropRun = (run: DraftRun): DraftRun => run.stage === 'finished' ? run : { ...run, dropped: true };
/** All matches are played, or the run was ended early (even in the middle of the picks): ready to be paid out. */
export const isRunComplete = (run: DraftRun) => !!run.dropped || (run.stage !== 'draft' && run.matches.length > 0 && run.matches.every(match => match.result));
export const payoutFor = (preset: DraftPreset, wins: number): PayoutTier => preset.payout[Math.max(0, Math.min(preset.payout.length - 1, wins))]!;
/** The best payout still within reach: wins so far plus every match left. */
export const bestPossible = (run: DraftRun) => winsOf(run) + run.matches.filter(match => !match.result).length;
/** Saved runs come back from storage as plain data; reject anything that is not shaped like one. */
export function parseRun(value: unknown): DraftRun | null {
  const run = value as DraftRun | null;
  if (!run || typeof run !== 'object' || typeof run.id !== 'string' || typeof run.preset !== 'string' || !run.draft || !Array.isArray(run.draft.picks)
    || !Array.isArray(run.draft.held) || !Array.isArray(run.draft.deal) || !Array.isArray(run.deck) || !Array.isArray(run.matches) || !Array.isArray(run.bots)
    || !['draft', 'build', 'matches', 'finished'].includes(run.stage)) return null;
  return run;
}
