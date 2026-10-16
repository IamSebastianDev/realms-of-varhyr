import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compareCards, draftFromFiles, germanIncomplete, glance, matches, noFilters, serialize, setStats, validate, type Stored } from '../apps/studio/src/model';

const root = 'assets/cards';
const folders = readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name);
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));

describe('card studio model', () => {
  it.each(folders)('%s survives a load and save unchanged', folder => {
    const data = read(`${root}/${folder}/data.json`);
    const dePath = `${root}/${folder}/data.de.json`, de = existsSync(dePath) ? read(dePath) : undefined;
    const out = serialize(draftFromFiles(folder, data, de));
    // Key order and empty optional fields vary in hand-written files; the content must not.
    const plain = (card: any) => JSON.parse(JSON.stringify({ ...card, cost: { ...card.cost, factions: Object.keys(card.cost.factions ?? {}).length ? card.cost.factions : undefined }, stats: card.stats && { ...card.stats, energyOutputs: card.stats.energyOutputs?.length ? card.stats.energyOutputs : undefined } }));
    expect(plain(out.data)).toEqual(plain(data));
    if (de) expect(out.de).toEqual(de);
  });

  it('validates every existing card as saveable', () => {
    const ids = new Set(folders);
    for (const folder of folders) {
      const draft = draftFromFiles(folder, read(`${root}/${folder}/data.json`));
      expect(validate(draft, ids, true).errors, folder).toEqual([]);
    }
  });

  const stored: Stored[] = folders.map(folder => ({ folder, data: read(`${root}/${folder}/data.json`) }));

  it('counts a set consistently by type, rarity, faction and cost', () => {
    const stats = setStats(stored, ['crownlands', 'bright-marches']);
    const sum = (record: Record<string, number>) => Object.values(record).reduce((a, b) => a + b, 0);
    expect(stats.total).toBe(stored.length);
    expect(sum(stats.type)).toBe(stored.length);
    expect(sum(stats.rarity)).toBe(stored.length);
    expect(stats.factions.reduce((a, row) => a + row.total, 0)).toBe(stored.length);
    expect(stats.curve.reduce((a, bucket) => a + sum(bucket), 0)).toBe(stored.length);
    expect(stats.missingArt.length).toBe(stored.length); // No art blobs were supplied.
  });

  it('filters by every field and treats neutral as its own faction', () => {
    const spells = stored.filter(card => card.data.type === 'spell');
    expect(stored.filter(card => matches(card, { ...noFilters, type: 'spell' }))).toEqual(spells);
    const neutral = stored.filter(card => matches(card, { ...noFilters, faction: 'neutral' }));
    expect(neutral.every(card => !card.data.factions.some((id: string) => id !== 'neutral'))).toBe(true);
    expect(stored.filter(card => matches(card, { ...noFilters, set: 'no-such-set' }))).toEqual([]);
    expect(matches(stored[0], { ...noFilters, query: stored[0].data.name.slice(0, 3).toUpperCase() })).toBe(true);
  });

  const card = (type: string, rarity: string, cost = 1, faction = 'crownlands'): Stored => ({ folder: 'x', data: { name: 'X', type, rarity, legendary: rarity === 'legendary', factions: [faction], cost: { generic: cost, factions: {} } } });
  it('counts rarity, free creatures and legendary creatures per faction', () => {
    const row = setStats([card('creature', 'common', 0), card('creature', 'rare', 0), card('creature', 'legendary'), card('spell', 'legendary')], ['crownlands']).factions.find(entry => entry.id === 'crownlands')!;
    expect(row.rarity).toEqual({ legendary: 2, rare: 1, common: 1 });
    expect(row.free).toEqual({ legendary: 0, rare: 1, common: 1 });
    expect(row.legendaryCreatures).toBe(1);
  });

  it('splits cards by type and rarity, cost and rarity, and averages the creatures', () => {
    const creature = (rarity: string, cost: number, attack: number, defense: number, output: number): Stored => ({ folder: 'c', data: { name: 'C', type: 'creature', rarity, legendary: false, factions: ['crownlands'], cost: { generic: cost, factions: {} }, stats: { attack, defense, energyOutputs: output ? [{ crownlands: output }, { neutral: 1 }] : [] } } });
    const stats = setStats([creature('common', 1, 2, 2, 1), creature('rare', 3, 4, 0, 0), card('spell', 'rare', 9)], ['crownlands']);
    expect(stats.typeRarity.creature).toEqual({ legendary: 0, rare: 1, common: 1 });
    expect(stats.typeRarity.spell).toEqual({ legendary: 0, rare: 1, common: 0 });
    expect(stats.curveRarity[1].common).toBe(1);
    expect(stats.curveRarity[7].rare).toBe(1); // Cost 9 lands in the 7+ bucket.
    expect(stats.creatures).toEqual({ count: 2, cost: 2, attack: 3, defense: 1, output: 0.5 });
  });

  it('sorts by faction order, then neutral, then hybrids, then cost, then name', () => {
    const order = ['crownlands', 'bright-marches', 'horde'];
    const make = (name: string, factions: string[], cost: number): Stored => ({ folder: name, data: { name, type: 'creature', rarity: 'common', legendary: false, factions, cost: { generic: cost, factions: {} } } });
    const cards = [make('Hybrid', ['horde', 'crownlands'], 0), make('Neutral', [], 0), make('Horde B', ['horde'], 2), make('Horde A', ['horde'], 2), make('Horde cheap', ['horde'], 1), make('Crown', ['crownlands'], 5), make('Marches', ['bright-marches'], 0), make('Hybrid 2', ['bright-marches', 'crownlands'], 0)];
    expect(cards.sort((a, b) => compareCards(a, b, order)).map(card => card.data.name)).toEqual(['Crown', 'Marches', 'Horde cheap', 'Horde A', 'Horde B', 'Neutral', 'Hybrid 2', 'Hybrid']);
  });

  it('summarises cost, Attack/Defense and the best energy output for the list', () => {
    expect(glance({ type: 'creature', cost: { generic: 1, factions: { crownlands: 2 } }, stats: { attack: 3, defense: 0, energyOutputs: [{ crownlands: 1 }, { neutral: 2 }] } })).toBe('Cost 3 · 3/0 · ⚡2');
    expect(glance({ type: 'creature', cost: { generic: 0, factions: {} }, stats: { attack: 1, defense: 1, energyOutputs: [] } })).toBe('Cost 0 · 1/1');
    expect(glance({ type: 'spell', cost: { generic: 2, factions: {} } })).toBe('Cost 2');
  });

  it('counts hybrid cards in their own rows and in each faction\'s hybrid column', () => {
    const order = ['crownlands', 'bright-marches', 'horde'];
    const hybrid = (rarity: string, factions: string[]): Stored => ({ folder: 'h', data: { name: 'H', type: 'creature', rarity, legendary: false, factions, cost: { generic: 1, factions: {} } } });
    const cards = [card('creature', 'common'), hybrid('rare', ['bright-marches', 'crownlands']), hybrid('common', ['crownlands', 'bright-marches']), hybrid('common', ['horde', 'crownlands'])];
    const stats = setStats(cards, order);
    expect(stats.hybrids).toBe(3);
    expect(stats.hybridIn).toEqual({ crownlands: 3, 'bright-marches': 2, horde: 1 });
    // Pairs are ordered like the factions, whichever way the card lists them, and every card lands in exactly one row.
    expect(stats.factions.filter(row => row.members.length > 1).map(row => [row.id, row.total])).toEqual([['crownlands+bright-marches', 2], ['crownlands+horde', 1]]);
    expect(stats.factions.reduce((sum, row) => sum + row.total, 0)).toBe(cards.length);
    expect(stats.factions.find(row => row.id === 'crownlands')!.total).toBe(1);
  });

  it('filters hybrids: any hybrid, an exact pair, or either of their factions', () => {
    const h: Stored = { folder: 'h', data: { name: 'H', factions: ['crownlands', 'bright-marches'] } };
    const mono: Stored = { folder: 'm', data: { name: 'M', factions: ['crownlands'] } };
    expect(matches(h, { ...noFilters, faction: 'hybrid' })).toBe(true);
    expect(matches(mono, { ...noFilters, faction: 'hybrid' })).toBe(false);
    expect(matches(h, { ...noFilters, faction: 'crownlands' })).toBe(true);
    expect(matches(h, { ...noFilters, faction: 'bright-marches+crownlands' })).toBe(true);
    expect(matches(h, { ...noFilters, faction: 'horde+crownlands' })).toBe(false);
    expect(matches(h, { ...noFilters, faction: 'neutral' })).toBe(false);
  });

  it('treats German as incomplete when the name or the lore of a card with lore is missing', () => {
    expect(germanIncomplete({ folder: 'a', data: { name: 'A' } })).toBe(true);
    expect(germanIncomplete({ folder: 'a', data: { name: 'A' }, de: { name: 'A' } })).toBe(false);
    expect(germanIncomplete({ folder: 'a', data: { name: 'A', lore: 'x' }, de: { name: 'A' } })).toBe(true);
    expect(germanIncomplete({ folder: 'a', data: { name: 'A', lore: 'x' }, de: { name: 'A', lore: 'y' } })).toBe(false);
  });
});

import { deckProblems, deckSize, deckStats, generateDeck, poolFor } from '../apps/studio/src/decks';
describe('starter decks', () => {
  const make = (id: string, over: Record<string, any> = {}): Stored => ({ folder: id, data: { id, name: id, type: 'creature', rarity: 'common', factions: ['crownlands'], deckLimitKey: id, cost: { generic: 2 }, stats: { attack: 1, defense: 1 }, ...over } });
  const pool = [
    ...Array.from({ length: 9 }, (_, i) => make(`c${i}`, { cost: { generic: 1 + (i % 5) }, ...(i < 3 ? { stats: { attack: 1, defense: 1, energyOutputs: [{ generic: 1 }] } } : {}) })),
    ...Array.from({ length: 5 }, (_, i) => make(`s${i}`, { type: 'spell', stats: undefined })),
    ...Array.from({ length: 3 }, (_, i) => make(`h${i}`, { type: 'holding', stats: { attack: 0, defense: 3, energyOutputs: [{ generic: 1 }] } })),
    make('boss', { rarity: 'legendary', cost: { generic: 6 } }),
  ];
  it('generates a legal deck deterministically', () => {
    const deck = generateDeck(pool);
    expect(deckSize(deck)).toBe(30);
    expect(deckProblems(deck, pool)).toEqual([]);
    expect(generateDeck(pool)).toEqual(deck);
    expect(deck.boss ?? 0).toBeLessThanOrEqual(1);
    expect(deckStats(deck, pool).producers).toBeGreaterThanOrEqual(8);
  });
  it('reports broken decks and filters the pool', () => {
    expect(deckProblems({ c0: 4, boss: 2, ghost: 1 }, pool).join(' ')).toMatch(/at least 30.*Too many copies of c0.*Too many copies of boss.*Unknown card: ghost/);
    expect(poolFor([make('a'), make('b', { factions: ['horde'] }), make('n', { factions: ['neutral'] }), make('h', { factions: ['crownlands', 'horde'] })], 'crownlands').map(c => c.data.id)).toEqual(['a', 'n']);
  });
});
