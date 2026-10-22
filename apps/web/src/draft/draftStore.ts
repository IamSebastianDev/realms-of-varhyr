import { useSyncExternalStore } from "react";
import {
  draftPresets,
  parseRun,
  recordResult,
  type DraftResult,
  type DraftRun,
} from "@realms/draft";

const runKey = (preset: string) => `varhyr-draft-run-v2:${preset}`,
  activeKey = "varhyr-draft-active-v1",
  returnKey = "varhyr-draft-return-v1",
  factionKey = "varhyr-draft-faction-v1";
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

/** One saved run per named draft. */
const runs = new Map<string, DraftRun | null>();
const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Runs of the first draft (one per alignment booster) are not readable any more: their saves are cleared once. */
(() => {
  try {
    for (const key of Object.keys(localStorage))
      if (key.startsWith("varhyr-draft-run-v1:")) localStorage.removeItem(key);
  } catch {
    /* No storage, nothing to clear. */
  }
})();

export function readDraftRun(preset: string): DraftRun | null {
  if (!runs.has(preset)) {
    let run: DraftRun | null = null;
    try {
      run = parseRun(JSON.parse(read(runKey(preset)) ?? "null"));
    } catch {
      /* A broken save is no run. */
    }
    runs.set(preset, run);
  }
  return runs.get(preset) ?? null;
}
export function saveDraftRun(preset: string, run: DraftRun | null) {
  runs.set(preset, run);
  const saved = write(runKey(preset), run ? JSON.stringify(run) : null);
  notify();
  return saved;
}
export const useDraftRun = (preset: string): DraftRun | null =>
  useSyncExternalStore(
    subscribe,
    () => readDraftRun(preset),
    () => readDraftRun(preset),
  );

/** The faction the next run will start with, chosen in the blade and kept while the overview is open. */
export const draftFaction = () => read(factionKey);
export const setDraftFaction = (faction: string | null) => write(factionKey, faction);
/** The named draft whose overview is open, kept so the page survives a match and a reload. */
export const activeDraft = () => read(activeKey);
export const setActiveDraft = (preset: string | null) => write(activeKey, preset);
/** The match screen sets this so closing a draft match lands back on the draft overview. */
export const wantsDraftScreen = () => read(returnKey) === "1";
export const setWantsDraftScreen = (value: boolean) => write(returnKey, value ? "1" : null);

/** A draft match reports its result straight into the saved run, once; the overview picks it up when it opens. */
export function reportDraftResult(
  preset: string,
  runId: string,
  index: number,
  result: DraftResult,
) {
  const run = readDraftRun(preset);
  if (!run || run.id !== runId) return;
  const next = recordResult(run, index, result);
  if (next !== run) saveDraftRun(preset, next);
}

/** True while any named draft has a run that is not finished, so the start page can say so. */
export const useDraftInProgress = () =>
  useSyncExternalStore(
    subscribe,
    () =>
      draftPresets.some((preset) => {
        const run = readDraftRun(preset.id);
        return !!run && run.stage !== "finished";
      }),
    () => false,
  );

/** The sleeve of a run's deck, kept beside the run (not in it, so a table cannot overwrite it). */
const backKey = (run: string) => `varhyr-draft-back-v1:${run}`;
export const draftBack = (run: string): string | undefined => read(backKey(run)) ?? undefined;
export function setDraftBack(run: string, back: string) {
  write(backKey(run), back);
  notify();
}
export const useDraftBack = (run: string): string | undefined =>
  useSyncExternalStore(
    subscribe,
    () => draftBack(run),
    () => draftBack(run),
  );
