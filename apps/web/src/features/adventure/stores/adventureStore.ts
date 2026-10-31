import { useSyncExternalStore } from "react";
import { registry } from "@realms/content";
import raw from "@realms/content/adventures.json";
import {
  loadRun,
  type AdventureContent,
  type AdventureDef,
  type RunState,
} from "@realms/adventure";

/** The published adventures (assets/adventures, validated at import) and the game's cards. */
export const adventures = raw as unknown as AdventureDef[];
export const adventureContent: AdventureContent = { cards: registry.cards };
export const adventureOf = (id: string): AdventureDef | undefined =>
  adventures.find((adventure) => adventure.id === id);

const runKey = "varhyr-adventure-run-v1",
  resultKey = "varhyr-adventure-result-v1",
  returnKey = "varhyr-adventure-return-v1";
const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    return true;
  } catch {
    return false; /* The run stays in memory. */
  }
};

let current: RunState | null | undefined;
const listeners = new Set<() => void>();
function parseRun(text: string | null): RunState | null {
  try {
    return loadRun(JSON.parse(text ?? "null"));
  } catch {
    return null;
  }
}
const snapshot = () => (current === undefined ? (current = parseRun(read(runKey))) : current);
export const readRun = snapshot;
export function saveRun(run: RunState | null) {
  current = run;
  const saved = write(runKey, run ? JSON.stringify(run) : null);
  for (const listener of listeners) listener();
  return saved;
}
export function useAdventureRun(): RunState | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    snapshot,
    snapshot,
  );
}
/** A saved run can only continue on the adventure revision it began on. */
export const runIsCurrent = (run: RunState): boolean => {
  const def = adventureOf(run.adventure);
  return !!def && def.revision === run.revision;
};

/** The match screen reports how an adventure fight ended; the adventure screen applies it when it next opens. */
export type FightReport = { run: string; node: string; won: boolean; finishedAt?: number };
export function reportFight(report: FightReport) {
  write(resultKey, JSON.stringify({ ...report, finishedAt: report.finishedAt ?? Date.now() }));
}
export function readFightReport(run: RunState): FightReport | null {
  try {
    const report = JSON.parse(read(resultKey) ?? "null") as FightReport | null;
    if (!report || report.run !== run.id || report.node !== run.fight?.node) return null;
    return report;
  } catch {
    return null;
  }
}
export function clearFightReport(report: FightReport) {
  try {
    const stored = JSON.parse(read(resultKey) ?? "null");
    if (stored?.run === report.run && stored?.node === report.node) write(resultKey, null);
  } catch {
    /* Nothing to acknowledge. */
  }
}

export const wantsAdventureScreen = () => read(returnKey) === "1";
export const setWantsAdventureScreen = (value: boolean) => write(returnKey, value ? "1" : null);
