import type { Registry } from '../../../../packages/contracts/src';
import { payoutFor, poolOf, winsOf, type DraftPreset, type DraftRun } from '../../../../packages/draft/src';
import { grantCopies, type Collection } from '../collection';

/** The entry fee leaves the wallet when the run starts. It throws, and changes nothing, if the crowns are not there. */
export function enterDraft(collection: Collection, preset: DraftPreset): Collection {
  if (collection.crowns < preset.entryFee) throw new Error(`Entering costs ${preset.entryFee} crowns.`);
  return { ...collection, crowns: collection.crowns - preset.entryFee };
}

export type DraftCardReward = { id: string; copies: number; kept: number; isNew: boolean; dusted: number };
export type DraftSettlement = {
  wins: number; played: number; dropped: boolean;
  /** The tier's crowns, before any dust from duplicates. */
  crowns: number; boosters: { pack: string; count: number }[];
  cards: DraftCardReward[]; dusted: number;
};
export const draftReceiptKey = (run: DraftRun) => run.id;

/**
 * Pays a finished or dropped run once: the payout tier, then every drafted card as one big booster. Copies over the ownership
 * limit are dusted into crowns by the usual rule. The receipt is written in the same collection write, so a reload cannot pay twice.
 */
export function settleDraft(collection: Collection, run: DraftRun, preset: DraftPreset, content: Registry): { collection: Collection; settlement: DraftSettlement } | null {
  if (collection.draftPayouts?.[draftReceiptKey(run)]) return null;
  const wins = winsOf(run), tier = payoutFor(preset, wins);
  const next: Collection = { ...collection, counts: { ...collection.counts }, packs: { ...collection.packs }, draftPayouts: { ...collection.draftPayouts, [draftReceiptKey(run)]: true } };
  const byCard = new Map<string, DraftCardReward>();
  let dusted = 0;
  for (const id of poolOf(run)) {
    const grant = grantCopies(next, id, 1, content);
    const entry = byCard.get(id) ?? { id, copies: 0, kept: 0, isNew: false, dusted: 0 };
    entry.copies++; entry.isNew ||= grant.isNew; entry.dusted += grant.crowns; if (!grant.crowns) entry.kept++;
    dusted += grant.crowns; byCard.set(id, entry);
  }
  const boosters = new Map<string, number>();
  for (let index = 0; index < tier.boosters; index++) { const pack = preset.packs[index % preset.packs.length]!; boosters.set(pack, (boosters.get(pack) ?? 0) + 1); }
  for (const [pack, count] of boosters) next.packs[pack] = (next.packs[pack] ?? 0) + count;
  next.crowns += tier.crowns;
  return { collection: next, settlement: { wins, played: run.matches.filter(match => match.result).length, dropped: run.dropped, crowns: tier.crowns, boosters: [...boosters].map(([pack, count]) => ({ pack, count })), cards: [...byCard.values()], dusted } };
}
