import { describe, expect, it } from 'vitest';
import { registry as live } from '../packages/content/src';
import type { Registry } from '../packages/contracts/src';
import { builderCards, cardCost, exportDeck, importDeck, initialBuilderFilters, summarizeDeck } from '../apps/web/src/deckTools';
import { addDeckCard, deckCardAvailability, removeDeckCard } from '../apps/web/src/decks';

// Stable card mechanics for builder tests; authored content can change independently.
const base = Object.values(live.cards).find(card => card.type === 'creature')!;
const free = { ...base, id: 'free', deckLimitKey: 'free', name: 'Free Recruit', factions: ['crownlands'], subtypes: ['soldier'], abilities: [], cost: { generic: 0, factions: {} }, legendary: false, rarity: 'common' as const, stats: { attack: 1, defense: 3, energyOutputs: [{ crownlands: 1 }] } };
const champion = { ...free, id: 'champion', deckLimitKey: 'champion', name: 'Champion', legendary: true, rarity: 'legendary' as const, cost: { generic: 3, factions: { crownlands: 4 } }, stats: { attack: 6, defense: 6, energyOutputs: [{ crownlands: 2 }] } };
const bastion = { ...free, id: 'bastion', deckLimitKey: 'bastion', name: 'Neutral Bastion', type: 'bastion' as const, factions: [], cost: { generic: 2, factions: {} }, stats: { attack: 0, defense: 5, energyOutputs: [] } };
const spell = { ...free, id: 'spell', deckLimitKey: 'spell', name: 'Crown Spell', type: 'spell' as const, stats: undefined, cost: { generic: 1, factions: { crownlands: 1 } }, cast: [{ id: 'damage', params: { amount: 2 } }] };
const content: Registry = { ...live, cards: { free, champion, bastion, spell } };

describe('deck builder tools', () => {
  it('respects owned copies, re-enables removed copies, and treats missing ownership as zero', () => {
    const owned = { free: 2 };
    const one = addDeckCard([], 'free', content, owned);
    const two = addDeckCard(one, 'free', content, owned);
    expect(two).toEqual(['free', 'free']);
    expect(one).toEqual(['free']);
    expect(addDeckCard(two, 'free', content, owned)).toBe(two);
    expect(addDeckCard(two, 'spell', content, owned)).toBe(two);
    expect(deckCardAvailability(two, 'free', content, owned)).toMatchObject({ owned: 2, inDeck: 2, limit: 3, limitReached: false, remaining: 0 });
    const removed = removeDeckCard(two, 'free');
    expect(addDeckCard(removed, 'free', content, owned)).toEqual(two);
    expect(builderCards(content, removed, { ...initialBuilderFilters, addable: true }, owned).map(card => card.id)).toEqual(['free']);
    expect(builderCards(content, two, { ...initialBuilderFilters, addable: true }, owned)).toEqual([]);
  });
  it('keeps legal limits independent of ownership and shares them across variants', () => {
    const r = { ...content, cards: { ...content.cards, variant: { ...free, id: 'variant' } } };
    const owned = { free: 5, variant: 1, champion: 5 };
    expect(deckCardAvailability(['free', 'free', 'variant'], 'free', r, owned)).toMatchObject({ owned: 5, inDeck: 2, limitReached: true, remaining: 0 });
    expect(addDeckCard(['free', 'free', 'variant'], 'free', r, owned)).toEqual(['free', 'free', 'variant']);
    // Owning another artwork does not grant a copy of this artwork.
    expect(addDeckCard(['variant'], 'variant', r, owned)).toEqual(['variant']);
    expect(deckCardAvailability(['champion'], 'champion', r, owned)).toMatchObject({ owned: 5, limit: 1, remaining: 0 });
    expect(addDeckCard(['champion'], 'champion', r, owned)).toEqual(['champion']);
  });
  it('treats invalid ownership counts as unavailable', () => {
    for (const count of [0, -1, 1.5, NaN, Infinity]) {
      expect(addDeckCard([], 'free', content, { free: count })).toEqual([]);
    }
  });
  it('counts all cost requirements and every copy in the curve and producer overview', () => {
    expect(cardCost(champion)).toBe(7);
    expect(summarizeDeck(['free', 'free', 'spell', 'bastion', 'champion'], content)).toEqual({ total: 5, unique: 4, curve: [2, 0, 2, 0, 0, 0, 1], types: { creature: 3, spell: 1, bastion: 1 }, producers: 3, freeProducers: 2, averageCost: 2.2 });
  });
  it('combines search, faction, role and cost filters without hiding neutral cards or spell effects', () => {
    expect(builderCards(content, [], { ...initialBuilderFilters, query: 'soldier recruit', role: 'free-producers', faction: 'crownlands', cost: 0 }).map(card => card.id)).toEqual(['free']);
    expect(builderCards(content, [], { ...initialBuilderFilters, query: 'damage 2', kind: 'spell' }).map(card => card.id)).toEqual(['spell']);
    expect(builderCards(content, [], { ...initialBuilderFilters, faction: 'neutral' }).map(card => card.id)).toEqual(['bastion']);
    expect(builderCards(content, [], { ...initialBuilderFilters, cost: 6 }).map(card => card.id)).toEqual(['champion']);
  });
  it('sorts numerically and hides exhausted copy limits across variants', () => {
    const variant = { ...free, id: 'variant', name: 'Recruit variant' };
    const r = { ...content, cards: { ...content.cards, variant } };
    expect(builderCards(r, ['free', 'free', 'variant', 'champion'], { ...initialBuilderFilters, addable: true }).map(card => card.id)).toEqual(['spell', 'bastion']);
    expect(builderCards(content, [], { ...initialBuilderFilters, sort: 'defense' }).map(card => card.id)).toEqual(['champion', 'bastion', 'free', 'spell']);
  });
  it('exports and imports a portable composition, including incomplete decks, without local IDs', () => {
    const draft = { id: 'custom-private', name: 'My deck', cards: ['free', 'spell', 'free'] };
    const raw = exportDeck(draft);
    expect(raw).not.toContain(draft.id);
    expect(importDeck(raw, content)).toEqual({ name: 'My deck', cards: ['free', 'free', 'spell'] });
    expect(draft.cards).toEqual(['free', 'spell', 'free']);
  });
  it('rejects malformed imports, unknown cards, and limits hidden in duplicate entries or variants', () => {
    const raw = (cards: unknown) => JSON.stringify({ format: 'varhyr-deck', version: 1, name: 'Deck', cards });
    expect(() => importDeck('{', content)).toThrow('valid JSON');
    expect(() => importDeck('{}', content)).toThrow('deck export');
    expect(() => importDeck(raw([{ id: 'gone', count: 1 }]), content)).toThrow('Unknown card');
    for (const count of [0, -1, 1.5, 4]) expect(() => importDeck(raw([{ id: 'free', count }]), content)).toThrow('copies');
    expect(() => importDeck(raw([{ id: 'champion', count: 2 }]), content)).toThrow('copies');
    expect(() => importDeck(raw([{ id: 'free', count: 2 }, { id: 'free', count: 2 }]), content)).toThrow('copies');
    const r = { ...content, cards: { ...content.cards, variant: { ...free, id: 'variant' } } };
    expect(() => importDeck(raw([{ id: 'free', count: 3 }, { id: 'variant', count: 1 }]), r)).toThrow('copies');
  });
});
