import { type DraftPreset } from '../../../../../packages/draft/src';
import { updateCollection } from '../../collectionStore';
import { enterDraft } from '../rewards';

const key = 'varhyr-draft-paid-v1';
const read = (): string[] => { try { const saved = JSON.parse(localStorage.getItem(key) ?? '[]'); return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string').slice(-20) : []; } catch { return []; } };
/**
 * The entry fee for a table, taken once per run: a reload or a second message cannot charge it twice.
 * Guests pay when the host starts the table, not when they sit down, so leaving a lobby costs nothing.
 */
export function payEntryOnce(runId: string, preset: DraftPreset): boolean {
  if (read().includes(runId)) return true;
  try {
    updateCollection(current => enterDraft(current, preset), { requireSave: true });
    try { localStorage.setItem(key, JSON.stringify([...read(), runId])); } catch { /* A broken store cannot charge twice in this session. */ }
    return true;
  } catch { return false; }
}
