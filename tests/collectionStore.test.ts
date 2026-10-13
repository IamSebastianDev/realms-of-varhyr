import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boosterPacks } from '../packages/content/src/boosters';
import { claimVictory, collectionKey, gainDebugCrowns, buyCollectionBooster } from '../apps/web/src/collection';

let stored: Map<string, string>;
beforeEach(() => {
  vi.resetModules();
  stored = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => { stored.set(key, value); },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('shared collection persistence', () => {
  it('persists the welcome grant once and keeps purchases and wins through a reload', async () => {
    const first = await import('../apps/web/src/collectionStore');
    expect(first.updateCollection(current => current).collection.packs).toEqual({ bounty: 5 });
    expect(first.updateCollection(gainDebugCrowns).collection.crowns).toBe(1000);
    first.updateCollection(current => buyCollectionBooster(current, boosterPacks[1]));
    first.updateCollection(current => claimVictory(current, 'won-once', 'p1', true));
    vi.resetModules();
    const reloaded = await import('../apps/web/src/collectionStore');
    const state = reloaded.updateCollection(current => claimVictory(current, 'won-once', 'p1', true));
    expect(state.saved).toBe(true);
    expect(state.collection).toMatchObject({ crowns: 925, packs: { bounty: 6, foundations: 1 }, rewardedMatches: ['won-once'] });
  });
  it('spends from the latest persisted balance rather than a stale render or another tab', async () => {
    const store = await import('../apps/web/src/collectionStore');
    const initial = store.updateCollection(gainDebugCrowns).collection;
    stored.set(collectionKey, JSON.stringify({ ...initial, crowns: 50 }));
    expect(() => store.updateCollection(current => buyCollectionBooster(current, boosterPacks[0]))).toThrow('100 crowns');
    expect(JSON.parse(stored.get(collectionKey)!).crowns).toBe(50);
    expect(store.updateCollection(gainDebugCrowns).collection.crowns).toBe(1050);
  });
  it('keeps session grants usable when storage is unavailable without repeating initialization', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw new Error('Full'); } });
    const store = await import('../apps/web/src/collectionStore');
    expect(store.updateCollection(gainDebugCrowns)).toMatchObject({ saved: false, collection: { crowns: 1000, packs: { bounty: 5 } } });
    expect(store.updateCollection(gainDebugCrowns)).toMatchObject({ saved: false, collection: { crowns: 2000, packs: { bounty: 5 } } });
    expect(store.updateCollection(current => claimVictory(current, 'once', 'p1', true)).collection.crowns).toBe(2025);
    expect(store.updateCollection(current => claimVictory(current, 'once', 'p1', true)).collection.crowns).toBe(2025);
  });
  it('does not write no-op match results over another tab’s newer reward', async () => {
    const store = await import('../apps/web/src/collectionStore');
    store.updateCollection(current => current);
    const stale = stored.get(collectionKey)!;
    store.updateCollection(current => claimVictory(current, 'winner', 'p1', true));
    const winning = stored.get(collectionKey)!;
    // Model a stale localStorage read in the losing tab while writes share the same backing store.
    const writes = vi.fn((key:string,value:string) => { stored.set(key,value); });
    vi.stubGlobal('localStorage', { getItem: () => stale, setItem: writes });
    store.updateCollection(current => claimVictory(current, 'winner', 'p2', true));
    store.updateCollection(current => claimVictory(current, 'ongoing', null, true));
    expect(writes).not.toHaveBeenCalled();
    expect(stored.get(collectionKey)).toBe(winning);
    expect(JSON.parse(winning)).toMatchObject({crowns:25,packs:{bounty:6},rewardedMatches:['winner']});
  });
});
