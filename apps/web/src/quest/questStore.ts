import { useSyncExternalStore } from 'react';
import { factionInfo, registry } from '../../../../packages/content/src';
import { boosterPacks } from '../../../../packages/content/src/boosters';
import { parseMap, type QuestContent, type QuestMap, type RunState } from '../../../../packages/quest/src';

/** The game's real cards and the three booster alignments, in the shape the quest engine wants. */
export const questContent: QuestContent = {
  cards: registry.cards,
  packs: boosterPacks.map(pack => ({ id: pack.id, name: pack.name, factions: pack.factions })),
  factionNames: Object.fromEntries(Object.entries(factionInfo).map(([id, info]) => [id, info.name])),
};

const runKey = 'varhyr-quest-run-v1', resultKey = 'varhyr-quest-result-v1', paidKey = 'varhyr-quest-paid-v1', returnKey = 'varhyr-quest-return-v1';
const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string | null) => { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* Storage is best-effort; the run stays in memory. */ } };

let current: RunState | null | undefined;
const listeners = new Set<() => void>();
function parseRun(raw: string | null): RunState | null {
  try { const run = JSON.parse(raw ?? 'null'); return run && run.version === 1 && Array.isArray(run.deck) && run.quest ? run as RunState : null; } catch { return null; }
}
const snapshot = () => current === undefined ? (current = parseRun(read(runKey))) : current;
export const readRun = snapshot;
export function saveRun(run: RunState | null) {
  current = run;
  write(runKey, run ? JSON.stringify(run) : null);
  for (const listener of listeners) listener();
}
export function useQuestRun(): RunState | null {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, snapshot, snapshot);
}

/** The match screen reports how a quest fight ended; the quest screen applies it when it next opens. */
export type FightReport = { run: string; node: string; won: boolean; life: number };
export function reportFight(report: FightReport) { write(resultKey, JSON.stringify(report)); }
export function takeFightReport(run: RunState): FightReport | null {
  try {
    const report = JSON.parse(read(resultKey) ?? 'null') as FightReport | null;
    if (!report || report.run !== run.id) return null;
    write(resultKey, null);
    return report;
  } catch { return null; }
}
/** A fight that was started and never reported is a fight the player walked away from. */

export const wantsQuestScreen = () => read(returnKey) === '1';
export const setWantsQuestScreen = (value: boolean) => write(returnKey, value ? '1' : null);

type Paid = { day: string; packs: string[] };
export function paidToday(day: string): string[] {
  try { const paid = JSON.parse(read(paidKey) ?? 'null') as Paid | null; return paid?.day === day && Array.isArray(paid.packs) ? paid.packs : []; } catch { return []; }
}
export const markPaid = (day: string, pack: string) => write(paidKey, JSON.stringify({ day, packs: [...new Set([...paidToday(day), pack])] } satisfies Paid));

export type LoadedMap = QuestMap & { tiles: { size: number; maxZoom: number; width: number; height: number } };
let mapPromise: Promise<LoadedMap | null> | undefined;
/** The node file the studio saved, as published by the build. Null when no map has been made yet. */
export function loadMap(): Promise<LoadedMap | null> {
  return mapPromise ??= fetch('/quest/map.json').then(async response => {
    if (!response.ok) return null;
    const text = await response.text();
    try { const raw = JSON.parse(text); return { ...parseMap(raw), tiles: raw.tiles } as LoadedMap; } catch { return null; }
  }).catch(() => null);
}
