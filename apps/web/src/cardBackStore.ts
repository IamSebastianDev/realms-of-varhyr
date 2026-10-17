import { useSyncExternalStore } from 'react';
import { defaultCardBack, cardBackById, cardBacks, isBackUnlocked } from './cardBacks';
import { useGoals, currentGoals } from './goalsStore';
import { updateCollection } from './collectionStore';

/** Which store backs are bought. The back a deck uses is saved with the deck itself (CustomDeck.back). */
const key = 'varhyr-card-backs-v1';
type State = { bought: string[] };
let snapshot: State | undefined;
const listeners = new Set<() => void>();
function read(): State {
  if (snapshot) return snapshot;
  try {
    const data = JSON.parse(localStorage.getItem(key) ?? '{}');
    snapshot = { bought: Array.isArray(data?.bought) ? data.bought.filter((id: unknown) => typeof id === 'string') : [] };
  } catch { snapshot = { bought: [] }; }
  return snapshot!;
}
function write(next: State) {
  snapshot = next;
  try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* Optional persistence. */ }
  for (const listener of listeners) listener();
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

/** Spends the crowns first, then records the purchase, so a failed payment never grants the back. */
export function buyCardBack(id: string): boolean {
  const back = cardBackById(id);
  if (back.source !== 'shop' || !back.price || read().bought.includes(id)) return false;
  let paid = false;
  updateCollection(collection => { if (collection.crowns < back.price!) return collection; paid = true; return { ...collection, crowns: collection.crowns - back.price! }; });
  if (paid) write({ ...read(), bought: [...read().bought, id] });
  return paid;
}
export function useBoughtBacks(): readonly string[] { return useSyncExternalStore(subscribe, () => read().bought, () => read().bought); }
/** A deck's back as it should be shown; one that is not available (any more) falls back to the default. */
export function useCardBack(backId: string | undefined): string {
  const goals = useGoals(), state = useSyncExternalStore(subscribe, read, read), back = cardBackById(backId);
  return isBackUnlocked(back, goals, state.bought) ? back.id : defaultCardBack;
}
/** The same choice as useCardBack, for code outside React (an online lobby sends it to the opponent). */
export function resolveCardBack(backId: string | undefined): string {
  const back = cardBackById(backId);
  return isBackUnlocked(back, currentGoals(), read().bought) ? back.id : defaultCardBack;
}
export const allBacks = cardBacks;
