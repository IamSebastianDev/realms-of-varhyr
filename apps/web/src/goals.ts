import type { CommandEnvelope, GameState, PlayerId, Registry } from '../../../packages/contracts/src';

/** Daily goals and achievements. Pure rules: storage, rewards and screens live elsewhere. Dailies reset at local midnight. */

export type Reward = { crowns?: number; boosters?: number };
export type Counters = {
  matches: number; wins: number; streak: number; bestStreak: number; spells: number; holdings: number;
  flawlessWins: number; onlineWins: number; rarePulls: number; legendaryPulls: number;
  factionWins: Record<string, number>; decksWon: string[]; deckLastPlayed: Record<string, string>;
};
/** What one finished match tells us, from the owner's seat. */
export type MatchResult = {
  id: string; day: string; won: boolean; online: boolean; deckId: string; factions: string[];
  spells: number; holdings: number; creaturesLost: number; damageTaken: number; ownTurns: number;
};
export type DailyKind = 'matches' | 'wins' | 'spells' | 'holdings' | 'monoWins' | 'freshDeckWins' | 'noLossWins' | 'fastWins' | 'boosters' | 'deckSaves';
type DailyDef = { id: string; group: 'easy' | 'medium' | 'other'; kind: DailyKind; goal: number; reward: Reward; title: string };
export type DailySlot = { id: string; progress: number; claimed: boolean };
export type Goals = {
  version: 1; day: string; daily: DailySlot[]; rerolled: boolean; salt: number;
  totals: Counters; claimedTiers: Record<string, number>; counted: string[];
};

export const dailyPool: DailyDef[] = [
  { id: 'win1', group: 'easy', kind: 'wins', goal: 1, reward: { crowns: 25 }, title: 'Win a match' },
  { id: 'mono', group: 'easy', kind: 'monoWins', goal: 1, reward: { crowns: 25 }, title: 'Win with a one-faction deck' },
  { id: 'spells5', group: 'easy', kind: 'spells', goal: 5, reward: { crowns: 15 }, title: 'Cast 5 spells' },
  { id: 'holdings3', group: 'easy', kind: 'holdings', goal: 3, reward: { crowns: 15 }, title: 'Play 3 holdings' },
  { id: 'play1', group: 'easy', kind: 'matches', goal: 1, reward: { crowns: 10 }, title: 'Play a match' },
  { id: 'play3', group: 'medium', kind: 'matches', goal: 3, reward: { boosters: 1 }, title: 'Play 3 matches' },
  { id: 'win2', group: 'medium', kind: 'wins', goal: 2, reward: { crowns: 40 }, title: 'Win 2 matches' },
  { id: 'fresh', group: 'medium', kind: 'freshDeckWins', goal: 1, reward: { crowns: 30 }, title: 'Win with a deck you haven’t played in 3 days' },
  { id: 'noloss', group: 'medium', kind: 'noLossWins', goal: 1, reward: { crowns: 40 }, title: 'Win without losing a creature' },
  { id: 'fast', group: 'medium', kind: 'fastWins', goal: 1, reward: { crowns: 40 }, title: 'Win in 8 of your own turns or fewer' },
  { id: 'open', group: 'other', kind: 'boosters', goal: 1, reward: { crowns: 10 }, title: 'Open a booster' },
  { id: 'save', group: 'other', kind: 'deckSaves', goal: 1, reward: { crowns: 10 }, title: 'Save a deck' },
];
const dailyById = new Map(dailyPool.map(def => [def.id, def]));
export const dailyDef = (id: string) => dailyById.get(id);

/** Achievements climb through tiers; progress is one counter, each tier is a threshold. */
export type AchievementMetric = keyof Pick<Counters, 'wins' | 'bestStreak' | 'spells' | 'holdings' | 'flawlessWins' | 'onlineWins' | 'rarePulls' | 'legendaryPulls'>
  | 'factionWins' | 'decksWon' | 'collectionPercent' | 'boostersOpened';
export type AchievementDef = { id: string; metric: AchievementMetric; tiers: [number, number, number]; title: string; detail: string; /** Wording when the amount is exactly one. */ one?: string };
/** The sentence for one tier, as a translation key plus its parameters. */
export const achievementText = (def: AchievementDef, amount: number): [string, { n: number }] => [amount === 1 && def.one ? def.one : def.detail, { n: amount }];
export const tierRewards: Reward[] = [{ crowns: 50 }, { crowns: 150 }, { crowns: 100, boosters: 1 }];
export const tierNames = ['Bronze', 'Silver', 'Gold'] as const;
export const achievements: AchievementDef[] = [
  { id: 'victories', metric: 'wins', tiers: [10, 50, 250], title: 'Veteran of the Marches', detail: 'Win {n} matches', one: 'Win a match' },
  { id: 'streak', metric: 'bestStreak', tiers: [3, 5, 10], title: 'Unbroken', detail: 'Win {n} matches in a row' },
  { id: 'banner', metric: 'factionWins', tiers: [10, 25, 50], title: 'Sworn Banner', detail: 'Win {n} matches with one faction' },
  { id: 'spells', metric: 'spells', tiers: [50, 250, 1000], title: 'Spellweaver', detail: 'Cast {n} spells' },
  { id: 'holdings', metric: 'holdings', tiers: [25, 100, 400], title: 'Master Builder', detail: 'Play {n} holdings' },
  { id: 'flawless', metric: 'flawlessWins', tiers: [1, 5, 20], title: 'Untouched', detail: 'Win {n} matches without losing any life', one: 'Win a match without losing any life' },
  { id: 'decks', metric: 'decksWon', tiers: [1, 3, 10], title: 'Deckwright', detail: 'Win with {n} different decks', one: 'Win with a deck' },
  { id: 'online', metric: 'onlineWins', tiers: [1, 10, 50], title: 'Across the Table', detail: 'Win {n} online matches', one: 'Win an online match' },
  { id: 'collector', metric: 'collectionPercent', tiers: [25, 50, 100], title: 'Collector', detail: 'Own {n}% of all cards' },
  { id: 'packs', metric: 'boostersOpened', tiers: [10, 50, 200], title: 'Pack Opener', detail: 'Open {n} boosters' },
  { id: 'rare', metric: 'rarePulls', tiers: [1, 10, 50], title: 'Rarity Hunter', detail: 'Pull {n} rare cards from boosters', one: 'Pull a rare card from a booster' },
  { id: 'legend', metric: 'legendaryPulls', tiers: [1, 3, 10], title: 'Legend Found', detail: 'Pull {n} legendary cards from boosters', one: 'Pull a legendary card from a booster' },
];

export const emptyCounters = (): Counters => ({ matches: 0, wins: 0, streak: 0, bestStreak: 0, spells: 0, holdings: 0, flawlessWins: 0, onlineWins: 0,
  rarePulls: 0, legendaryPulls: 0, factionWins: {}, decksWon: [], deckLastPlayed: {} });

export function localDay(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
const dayNumber = (day: string) => Math.floor(Date.parse(`${day}T00:00:00Z`) / 86400000);
function hash(text: string) { let h = 2166136261; for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619); return h >>> 0; }

/** One easy, one medium and one off-the-table goal, the same for the whole day; `salt` is what a reroll changes. */
export function drawDailies(day: string, salt = 0, keep: DailySlot[] = []): DailySlot[] {
  return (['easy', 'medium', 'other'] as const).map((group, index) => {
    if (keep[index]) return keep[index];
    const pool = dailyPool.filter(def => def.group === group);
    return { id: pool[hash(`${day}:${group}:${salt}`) % pool.length].id, progress: 0, claimed: false };
  });
}
export const newGoals = (day = localDay()): Goals => ({ version: 1, day, daily: drawDailies(day), rerolled: false, salt: 0, totals: emptyCounters(), claimedTiers: {}, counted: [] });

/** A new day deals new dailies; everything that is not daily carries over. */
export function rollDay(goals: Goals, day = localDay()): Goals {
  return goals.day === day ? goals : { ...goals, day, daily: drawDailies(day), rerolled: false, salt: 0 };
}

/** Swaps one unfinished daily for another, once per day. */
export function rerollDaily(goals: Goals, index: number): Goals {
  const slot = goals.daily[index], def = slot && dailyDef(slot.id);
  if (!slot || !def || goals.rerolled || slot.claimed || slot.progress >= def.goal) return goals;
  const salt = goals.salt + 1;
  const pool = dailyPool.filter(candidate => candidate.group === def.group && candidate.id !== def.id);
  const next = pool[hash(`${goals.day}:${def.group}:${salt}`) % pool.length];
  return { ...goals, salt, rerolled: true, daily: goals.daily.map((entry, i) => i === index ? { id: next.id, progress: 0, claimed: false } : entry) };
}

function bumpDailies(goals: Goals, amounts: Partial<Record<DailyKind, number>>): Goals {
  return { ...goals, daily: goals.daily.map(slot => {
    const def = dailyDef(slot.id), amount = def && amounts[def.kind];
    return def && amount ? { ...slot, progress: Math.min(def.goal, slot.progress + amount) } : slot;
  }) };
}

const daysBetween = (from: string, to: string) => dayNumber(to) - dayNumber(from);

/** Counts a finished match once. Replaying a result, or finishing in two tabs, never counts twice. */
export function recordMatch(goals: Goals, result: MatchResult): Goals {
  if (goals.counted.includes(result.id)) return goals;
  const base = rollDay(goals, result.day);
  const totals: Counters = { ...base.totals, factionWins: { ...base.totals.factionWins }, deckLastPlayed: { ...base.totals.deckLastPlayed } };
  const last = totals.deckLastPlayed[result.deckId];
  const fresh = !!last && daysBetween(last, result.day) >= 3;
  totals.matches++; totals.spells += result.spells; totals.holdings += result.holdings;
  totals.deckLastPlayed[result.deckId] = result.day;
  if (result.won) {
    totals.wins++; totals.streak++; totals.bestStreak = Math.max(totals.bestStreak, totals.streak);
    if (!result.damageTaken) totals.flawlessWins++;
    if (result.online) totals.onlineWins++;
    for (const faction of result.factions) totals.factionWins[faction] = (totals.factionWins[faction] ?? 0) + 1;
    if (!totals.decksWon.includes(result.deckId)) totals.decksWon = [...totals.decksWon, result.deckId];
  } else totals.streak = 0;
  const mono = result.factions.length <= 1;
  return bumpDailies({ ...base, totals, counted: [...base.counted, result.id].slice(-40) }, {
    matches: 1, wins: result.won ? 1 : 0, spells: result.spells, holdings: result.holdings,
    monoWins: result.won && mono ? 1 : 0, freshDeckWins: result.won && fresh ? 1 : 0,
    noLossWins: result.won && !result.creaturesLost ? 1 : 0, fastWins: result.won && result.ownTurns <= 8 ? 1 : 0,
  });
}

export function recordBooster(goals: Goals, rarities: string[], day = localDay()): Goals {
  const base = rollDay(goals, day);
  const totals = { ...base.totals, rarePulls: base.totals.rarePulls + rarities.filter(r => r === 'rare').length, legendaryPulls: base.totals.legendaryPulls + rarities.filter(r => r === 'legendary').length };
  return bumpDailies({ ...base, totals }, { boosters: 1 });
}
export const recordDeckSave = (goals: Goals, day = localDay()): Goals => bumpDailies(rollDay(goals, day), { deckSaves: 1 });

/** Numbers that live in the collection rather than in the goals' own counters. */
export type External = { collectionPercent: number; boostersOpened: number };
export function metricValue(goals: Goals, metric: AchievementMetric, external: External): number {
  switch (metric) {
    case 'factionWins': return Math.max(0, ...Object.values(goals.totals.factionWins));
    case 'decksWon': return goals.totals.decksWon.length;
    case 'collectionPercent': return external.collectionPercent;
    case 'boostersOpened': return external.boostersOpened;
    default: return goals.totals[metric];
  }
}
export type AchievementStatus = { def: AchievementDef; tier: number; threshold: number | null; value: number; fraction: number; claimable: boolean; done: boolean };
export function achievementStatus(goals: Goals, def: AchievementDef, external: External): AchievementStatus {
  const tier = goals.claimedTiers[def.id] ?? 0, value = metricValue(goals, def.metric, external);
  const threshold = def.tiers[tier] ?? null;
  return { def, tier, threshold, value, fraction: threshold ? Math.min(1, value / threshold) : 1, claimable: threshold !== null && value >= threshold, done: threshold === null };
}
/** Something to collect first, otherwise the one that is furthest along. */
export function closestAchievement(goals: Goals, external: External): AchievementStatus | null {
  const open = achievements.map(def => achievementStatus(goals, def, external)).filter(status => !status.done);
  return open.sort((a, b) => Number(b.claimable) - Number(a.claimable) || b.fraction - a.fraction)[0] ?? null;
}
export function claimAchievement(goals: Goals, id: string, external: External): { goals: Goals; reward: Reward } | null {
  const def = achievements.find(entry => entry.id === id);
  if (!def) return null;
  const status = achievementStatus(goals, def, external);
  if (!status.claimable) return null;
  return { goals: { ...goals, claimedTiers: { ...goals.claimedTiers, [id]: status.tier + 1 } }, reward: tierRewards[status.tier] };
}
export function claimDaily(goals: Goals, index: number): { goals: Goals; reward: Reward } | null {
  const slot = goals.daily[index], def = slot && dailyDef(slot.id);
  if (!slot || !def || slot.claimed || slot.progress < def.goal) return null;
  return { goals: { ...goals, daily: goals.daily.map((entry, i) => i === index ? { ...entry, claimed: true } : entry) }, reward: def.reward };
}

export function parseGoals(raw: string | null): Goals | null {
  try {
    const data = JSON.parse(raw ?? 'null');
    if (!data || data.version !== 1 || typeof data.day !== 'string' || !Array.isArray(data.daily) || data.daily.length !== 3 || !data.totals) return null;
    if (!data.daily.every((slot: DailySlot) => dailyDef(slot?.id) && Number.isFinite(slot.progress))) return null;
    return { ...newGoals(data.day), ...data, totals: { ...emptyCounters(), ...data.totals }, claimedTiers: data.claimedTiers ?? {}, counted: Array.isArray(data.counted) ? data.counted : [] };
  } catch { return null; }
}

/** Reads a finished match from the owner's seat. Tutorials, replays and spectated matches are filtered out by the caller. */
export function matchResult(initial: GameState, state: GameState, commands: readonly CommandEnvelope[], seat: PlayerId, ctx: { id: string; online: boolean; deckId: string; registry: Registry; day?: string }): MatchResult {
  const { registry } = ctx;
  const own = Object.values(initial.cards).filter(card => card.owner === seat);
  const factions = [...new Set(own.flatMap(card => registry.cards[card.definitionId]?.factions ?? []).filter(f => f !== 'neutral'))];
  let spells = 0, holdings = 0;
  for (const { actor, command } of commands) {
    if (actor !== seat || command.type !== 'play') continue;
    const type = registry.cards[state.cards[command.cardId]?.definitionId ?? '']?.type;
    if (type === 'spell') spells++; else if (type === 'holding') holdings++;
  }
  const creaturesLost = Object.values(state.cards).filter(card => card.owner === seat && card.zone === 'discard' && registry.cards[card.definitionId]?.type === 'creature').length;
  return { id: ctx.id, day: ctx.day ?? localDay(), won: state.outcome === seat, online: ctx.online, deckId: ctx.deckId, factions, spells, holdings, creaturesLost,
    damageTaken: Math.max(0, initial.players[seat].life - state.players[seat].life), ownTurns: Math.ceil(state.turn / 2) };
}
