import { useSyncExternalStore } from "react";
import { defaultDeckId, registry, starterDefinitions } from "@realms/content";
import { parseRewards, rewardsKey } from "./boosterRewards";
import { collectionKey, createCollection, parseCollection, type Collection } from "./collection";

type Snapshot = { collection: Collection; saved: boolean };
let snapshot: Snapshot | undefined;
const listeners = new Set<() => void>();
function starterCards() {
  return starterDefinitions.find((deck) => deck.id === defaultDeckId)?.cards ?? [];
}
function persist(collection: Collection): Snapshot {
  let saved = true;
  try {
    localStorage.setItem(collectionKey, JSON.stringify(collection));
  } catch {
    saved = false;
  }
  return { collection, saved };
}
function readSnapshot(): Snapshot {
  if (snapshot) return snapshot;
  try {
    const stored = parseCollection(localStorage.getItem(collectionKey), registry);
    const collection =
      stored ??
      createCollection(registry, starterCards(), parseRewards(localStorage.getItem(rewardsKey)));
    snapshot = persist(collection);
  } catch {
    snapshot = { collection: createCollection(registry, starterCards()), saved: false };
  }
  return snapshot;
}
function refresh(event: StorageEvent) {
  if (event.key !== collectionKey && event.key !== null) return;
  const next = parseCollection(event.key === null ? null : event.newValue, registry);
  snapshot = next ? { collection: next, saved: true } : undefined;
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
  if (!listeners.size) window.addEventListener("storage", refresh);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener("storage", refresh);
  };
}

/** Shared by lobby and match: always mutate the latest state, never a captured render's wallet. */
export function updateCollection(
  update: (current: Collection) => Collection,
  options?: { requireSave: boolean },
): Snapshot {
  const current = readSnapshot();
  // Pull changes from another tab before spending or claiming; local POC storage is the authority.
  let latest = current.collection;
  if (current.saved)
    try {
      latest = parseCollection(localStorage.getItem(collectionKey), registry) ?? latest;
    } catch {
      /* Session state remains usable. */
    }
  const next = update(latest);
  // A losing/ongoing match is a no-op. Never rewrite its possibly stale tab cache over another tab's reward.
  const candidate =
    next === latest
      ? options?.requireSave && !current.saved
        ? persist(next)
        : latest === current.collection
          ? current
          : { collection: latest, saved: current.saved }
      : persist(next);
  if (options?.requireSave && !candidate.saved)
    throw new Error("Could not save. This browser’s storage is full or unavailable.");
  snapshot = candidate;
  for (const listener of listeners) listener();
  return snapshot;
}
export function useCollection() {
  return useSyncExternalStore(subscribe, readSnapshot, readSnapshot);
}
