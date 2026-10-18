import { useEffect, useSyncExternalStore } from 'react';
import { registry } from '../../../packages/content/src';
import { achievements, claimAchievement, claimDaily, dailyDef, localDay, newGoals, parseGoals, recordBooster, recordDeckSave, recordMatch, rerollDaily, rollDay, type External, type Goals, type MatchResult, type Reward } from './goals';
import { boosterPacks } from '../../../packages/content/src/boosters';
import { packCount, type Collection } from './collection';
import { updateCollection } from './collectionStore';

export const goalsKey = 'varhyr-goals-v1';
let snapshot: Goals | undefined;
const listeners = new Set<() => void>();
function read(): Goals {
  if (snapshot) return snapshot;
  let stored: Goals | null = null;
  try { stored = parseGoals(localStorage.getItem(goalsKey)); } catch { /* Goals still work for this session. */ }
  return snapshot = rollDay(stored ?? newGoals());
}
function change(update: (goals: Goals) => Goals) {
  const current = read(), next = update(current);
  if (next === current) return current;
  snapshot = next;
  try { localStorage.setItem(goalsKey, JSON.stringify(next)); } catch { /* Optional persistence. */ }
  for (const listener of listeners) listener();
  return next;
}
function onStorage(event: StorageEvent) {
  if (event.key !== goalsKey && event.key !== null) return;
  let next: Goals | null = null;
  try { next = parseGoals(event.newValue); } catch { /* Keep what we have. */ }
  if (next) { snapshot = next; for (const listener of listeners) listener(); }
}
function subscribe(listener: () => void) {
  if (!listeners.size) window.addEventListener('storage', onStorage);
  listeners.add(listener);
  return () => { listeners.delete(listener); if (!listeners.size) window.removeEventListener('storage', onStorage); };
}

/** Live goals; a new local day deals fresh dailies even if the page was left open overnight. */
export const currentGoals = (): Goals => read();
/** Debug completion grants the tiers themselves, without fabricating match stats or paying achievement rewards. */
export function completeAllAchievements() {
  change(goals => achievements.every(def => (goals.claimedTiers[def.id] ?? 0) >= def.tiers.length) ? goals : {
    ...goals, claimedTiers: { ...goals.claimedTiers, ...Object.fromEntries(achievements.map(def => [def.id, def.tiers.length])) },
  });
}
export function useGoals(): Goals {
  useEffect(() => {
    const check = () => { change(goals => rollDay(goals, localDay())); settleDailies(); };
    check();
    const timer = window.setInterval(check, 30000);
    window.addEventListener('focus', check);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', check); };
  }, []);
  return useSyncExternalStore(subscribe, read, read);
}

/** Finished dailies pay out on their own: the reward lands the moment the goal completes. */
export function settleDailies() {
  const goals = read();
  goals.daily.forEach((slot, index) => { const def = dailyDef(slot.id); if (def && !slot.claimed && slot.progress >= def.goal) claimDailyGoal(index); });
}
export const trackMatch = (result: MatchResult) => { change(goals => recordMatch(goals, result)); settleDailies(); };
export const trackBooster = (cardIds: string[]) => { change(goals => recordBooster(goals, cardIds.map(id => registry.cards[id]?.rarity ?? 'common'))); settleDailies(); };
export const trackDeckSave = () => { change(goals => recordDeckSave(goals)); settleDailies(); };
export const rerollGoal = (index: number) => { change(goals => rerollDaily(goals, index)); };

export function externalOf(collection: Collection): External {
  const all = Object.keys(registry.cards).length || 1;
  const owned = Object.keys(registry.cards).filter(id => (collection.counts[id] ?? 0) > 0).length;
  return { collectionPercent: Math.floor(owned * 100 / all), boostersOpened: collection.boostersOpened };
}

function pay(reward: Reward, claims: number) {
  updateCollection(collection => {
    const pack = boosterPacks[claims % boosterPacks.length];
    return { ...collection, crowns: collection.crowns + (reward.crowns ?? 0),
      packs: reward.boosters ? { ...collection.packs, [pack.id]: packCount(collection, pack.id) + reward.boosters } : collection.packs };
  });
}
const claimCount = (goals: Goals) => goals.daily.filter(slot => slot.claimed).length + Object.values(goals.claimedTiers).reduce((sum, tier) => sum + tier, 0);
/** Marks the goal claimed first, then pays: a double click cannot pay twice. */
export function claimDailyGoal(index: number) {
  const before = read(), result = claimDaily(before, index);
  if (!result) return;
  change(() => result.goals); pay(result.reward, claimCount(before));
}
export function claimAchievementTier(id: string, collection: Collection) {
  const before = read(), result = claimAchievement(before, id, externalOf(collection));
  if (!result) return;
  change(() => result.goals); pay(result.reward, claimCount(before));
}
