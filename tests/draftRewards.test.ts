import { describe, expect, it } from 'vitest';
import { registry } from '../packages/content/src';
import { buildBotDeck, draftPresets, recordResult, setDeck, startRun, takePick, type DraftRun } from '../packages/draft/src';
import { collectionRules, emptyCollection, ownedCopyCount, parseCollection } from '../apps/web/src/collection';
import { enterDraft, settleDraft } from '../apps/web/src/draft/rewards';

const preset = draftPresets[0]!;
function played(wins: number): DraftRun {
  let run = startRun(preset, registry, { id: 'run-a', seed: 12, now: 0 });
  while (run.stage === 'draft') run = takePick(run, preset, registry, run.draft.held[0]![0]!);
  run = setDeck(run, buildBotDeck(run.draft.picks[0]!, registry), registry);
  run.matches.forEach((_, index) => { run = recordResult(run, index, index < wins ? 'won' : 'lost'); });
  return run;
}

describe('draft entry and payout', () => {
  it('charges the entry fee, and refuses without the crowns', () => {
    expect(() => enterDraft({ ...emptyCollection(), crowns: 1499 }, preset)).toThrow();
    expect(enterDraft({ ...emptyCollection(), crowns: 1600 }, preset).crowns).toBe(100);
  });
  it('pays the tier for the wins, keeps the cards and dusts what is over the limit', () => {
    const run = played(3), start = { ...emptyCollection(), crowns: 10 };
    const result = settleDraft(start, run, preset, registry)!;
    const { collection, settlement } = result;
    expect(settlement.wins).toBe(3);
    expect(settlement.boosters).toEqual([{ pack: preset.packs[0], count: 5 }]);
    expect(collection.packs[preset.packs[0]!]).toBe(5);
    const picks = run.draft.picks[0]!;
    let expectedDust = 0;
    for (const id of new Set(picks)) {
      const copies = picks.filter(pick => pick === id).length, card = registry.cards[id]!, limit = card.legendary ? 1 : 3;
      expect(ownedCopyCount(collection.counts, id)).toBe(Math.min(copies, limit));
      expectedDust += Math.max(0, copies - limit) * collectionRules.duplicateCrowns[card.rarity];
    }
    expect(settlement.dusted).toBe(expectedDust);
    expect(collection.crowns).toBe(10 + 800 + expectedDust);
    expect(settlement.cards.reduce((sum, card) => sum + card.copies, 0)).toBe(48);
    expect(start.crowns).toBe(10);
  });
  it('pays a run once', () => {
    const run = played(2), first = settleDraft(emptyCollection(), run, preset, registry)!;
    expect(settleDraft(first.collection, run, preset, registry)).toBeNull();
    const reloaded = parseCollection(JSON.stringify(first.collection), registry)!;
    expect(settleDraft(reloaded, run, preset, registry)).toBeNull();
    expect(reloaded.crowns).toBe(first.collection.crowns);
  });
  it('pays the zero-win tier when nothing was won, and a dropped run for its wins so far', () => {
    expect(settleDraft(emptyCollection(), played(0), preset, registry)!.settlement.crowns).toBe(250);
    let run = played(0); run = { ...run, dropped: true };
    expect(settleDraft(emptyCollection(), run, preset, registry)!.settlement).toMatchObject({ dropped: true, wins: 0 });
  });
});
