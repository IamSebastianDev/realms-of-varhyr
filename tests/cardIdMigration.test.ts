import { describe, expect, it } from 'vitest';
import { defaultDeckId, registry, starterDefinitions } from '../packages/content/src';
import { parseCollection } from '../apps/web/src/collection';
import { parseDeck } from '../apps/web/src/decks';

const starter = starterDefinitions.find(deck => deck.id === defaultDeckId)!;

describe('card ID migrations', () => {
  it('keeps a Crown Bastion collection copy as Crown Bulwark', () => {
    const legacy = JSON.stringify({
      version: 1,
      counts: { 'crown-bastion': 2 },
      packs: { bounty: 1 },
      crowns: 0,
      boostersOpened: 0,
      rewardedMatches: [],
    });
    const collection = parseCollection(legacy, registry)!;
    expect(collection.counts['crown-bulwark']).toBe(2);
    expect(collection.counts['crown-bastion']).toBeUndefined();
  });

  it('keeps legacy card IDs in custom decks playable', () => {
    const cards = starter.cards.map(id => id === 'crown-bulwark' ? 'crown-bastion' : id);
    const deck = parseDeck({ id: 'custom-legacy-bulwark', name: 'Legacy Crown', cards }, false, registry);
    expect(deck?.cards).toContain('crown-bulwark');
    expect(deck?.cards).not.toContain('crown-bastion');
  });
});
