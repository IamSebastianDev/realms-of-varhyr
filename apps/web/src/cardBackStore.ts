import { useSyncExternalStore } from "react";
import { defaultCardBack, cardBackById, cardBacks, isBackUnlocked } from "./cardBacks";
import { useGoals, currentGoals } from "./goalsStore";
import { updateCollection } from "./collectionStore";
import type { Goals } from "./goals";

/** Owned backs, including debug grants. The back a deck uses is saved with the deck itself (CustomDeck.back). */
const key = "varhyr-card-backs-v1";
type State = { bought: string[]; favorite?: string };
let snapshot: State | undefined;
const listeners = new Set<() => void>();
function read(): State {
  if (snapshot) return snapshot;
  try {
    const data = JSON.parse(localStorage.getItem(key) ?? "{}");
    snapshot = {
      bought: Array.isArray(data?.bought)
        ? data.bought.filter((id: unknown) => typeof id === "string")
        : [],
      ...(typeof data?.favorite === "string" ? { favorite: data.favorite } : {}),
    };
  } catch {
    snapshot = { bought: [] };
  }
  return snapshot!;
}
function write(next: State) {
  snapshot = next;
  try {
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    /* Optional persistence. */
  }
  for (const listener of listeners) listener();
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Spends the crowns first, then records the purchase, so a failed payment never grants the back. */
export function buyCardBack(id: string): boolean {
  const back = cardBackById(id);
  if (back.source !== "shop" || !back.price || read().bought.includes(id)) return false;
  let paid = false;
  updateCollection((collection) => {
    if (collection.crowns < back.price!) return collection;
    paid = true;
    return { ...collection, crowns: collection.crowns - back.price! };
  });
  if (paid) write({ ...read(), bought: [...read().bought, id] });
  return paid;
}
export function useBoughtBacks(): readonly string[] {
  return useSyncExternalStore(
    subscribe,
    () => read().bought,
    () => read().bought,
  );
}
/** Grant sleeves independently of achievement progress. */
export function unlockAllSleeves() {
  const state = read();
  const bought = [...new Set([...state.bought, ...cardBacks.map((back) => back.id)])];
  if (bought.length !== state.bought.length) write({ ...state, bought });
}
/** The standard sleeve: the favourite if it is still available, else the default. Decks without a sleeve of their own use it. */
function standardOf(state: State, goals: Goals): string {
  const back = state.favorite ? cardBackById(state.favorite) : undefined;
  return back && isBackUnlocked(back, goals, state.bought) ? back.id : defaultCardBack;
}
export function setFavoriteBack(id: string) {
  const back = cardBackById(id);
  if (!isBackUnlocked(back, currentGoals(), read().bought)) return;
  write({ ...read(), favorite: back.id });
}
export function useStandardBack(): string {
  const goals = useGoals(),
    state = useSyncExternalStore(subscribe, read, read);
  return standardOf(state, goals);
}
/** A deck's back as it should be shown; one that is not available (any more) falls back to the standard sleeve. */
export function useCardBack(backId: string | undefined): string {
  const goals = useGoals(),
    state = useSyncExternalStore(subscribe, read, read),
    back = backId ? cardBackById(backId) : undefined;
  return back && isBackUnlocked(back, goals, state.bought) ? back.id : standardOf(state, goals);
}
/** The same choice as useCardBack, for code outside React (an online lobby sends it to the opponent). */
export function resolveCardBack(backId: string | undefined): string {
  const back = backId ? cardBackById(backId) : undefined,
    goals = currentGoals();
  return back && isBackUnlocked(back, goals, read().bought) ? back.id : standardOf(read(), goals);
}
export const allBacks = cardBacks;
