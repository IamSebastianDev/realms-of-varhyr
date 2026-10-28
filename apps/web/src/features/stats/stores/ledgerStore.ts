import { useSyncExternalStore } from "react";
import {
  addMatch,
  emptyLedger,
  mergeLedgers,
  parseLedger,
  type Ledger,
  type MatchRecord,
} from "../lib/ledger";

export const ledgerKey = "varhyr-ledger-v1";
let snapshot: Ledger | undefined;
const listeners = new Set<() => void>();
function read(): Ledger {
  if (snapshot) return snapshot;
  let stored: Ledger | null = null;
  try {
    stored = parseLedger(localStorage.getItem(ledgerKey));
  } catch {
    /* The ledger still works for this session. */
  }
  return (snapshot = stored ?? emptyLedger());
}
function change(update: (ledger: Ledger) => Ledger) {
  const current = read(),
    next = update(current);
  if (next === current) return;
  snapshot = next;
  try {
    localStorage.setItem(ledgerKey, JSON.stringify(next));
  } catch {
    /* Optional persistence. */
  }
  for (const listener of listeners) listener();
}
function onStorage(event: StorageEvent) {
  if (event.key !== ledgerKey && event.key !== null) return;
  let next: Ledger | null = null;
  try {
    next = parseLedger(event.newValue);
  } catch {
    /* Keep what we have. */
  }
  if (next) {
    snapshot = next;
    for (const listener of listeners) listener();
  }
}
function subscribe(listener: () => void) {
  if (!listeners.size) window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener("storage", onStorage);
  };
}

export const useLedger = (): Ledger => useSyncExternalStore(subscribe, read, read);
export const recordFinishedMatch = (record: MatchRecord, cards: readonly string[]) =>
  change((ledger) => addMatch(ledger, record, cards));
/** Adds the matches of an exported history; returns how many were new. */
export function importLedger(incoming: Ledger): number {
  const before = read().matches.length;
  change((ledger) => mergeLedgers(ledger, incoming));
  return Math.max(0, read().matches.length - before);
}
export const clearLedger = () => change(() => emptyLedger());
