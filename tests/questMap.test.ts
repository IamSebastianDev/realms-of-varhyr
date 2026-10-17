import { describe, expect, it } from 'vitest';
import { emptyMap, parseMap, serializeMap, territory, validateMap, type MapNode, type QuestMap } from '../packages/quest/src';

const node = (id: string, x: number, y: number, affiliation: string, extra: Partial<MapNode> = {}): MapNode => ({ id, x, y, kind: 'transient', affiliation, ...extra });
const mapOf = (...nodes: MapNode[]): QuestMap => ({ ...emptyMap('map.jpg', 1.5), nodes });

describe('quest map', () => {
  it('draws a border between two factions halfway between their nodes, and nowhere else', () => {
    const { borders, cells } = territory(mapOf(node('a', 0.4, 0.4, 'crownlands'), node('b', 0.5, 0.4, 'black-host')), 0.1);
    expect(cells).toHaveLength(2);
    expect(borders.length).toBeGreaterThan(0);
    for (const border of borders) { expect(border.a[0]).toBeCloseTo(0.45, 4); expect(border.b[0]).toBeCloseTo(0.45, 4); expect(border.between).toEqual(['crownlands', 'black-host']); }
    // The same faction on both sides, neutral land, or nodes too far apart all give no line.
    expect(territory(mapOf(node('a', 0.4, 0.4, 'crownlands'), node('b', 0.5, 0.4, 'crownlands')), 0.1).borders).toHaveLength(0);
    expect(territory(mapOf(node('a', 0.4, 0.4, 'crownlands'), node('b', 0.5, 0.4, 'neutral')), 0.1).borders).toHaveLength(0);
    expect(territory(mapOf(node('a', 0.1, 0.4, 'crownlands'), node('b', 0.8, 0.4, 'black-host')), 0.1).borders).toHaveLength(0);
  });

  it('lets a far-reaching node push the border into its neighbour', () => {
    const at = (site: 'capital' | 'waymark') => territory(mapOf(node('a', 0.4, 0.4, 'crownlands', { kind: 'permanent', site }), node('b', 0.5, 0.4, 'black-host', { kind: 'permanent', site: 'waymark' })), 0.07).borders[0]?.a[0];
    expect(at('waymark')).toBeCloseTo(0.45, 3);
    expect(at('capital')).toBeGreaterThan(0.46);
  });

  it('keeps a border inside the reach of its nodes', () => {
    const { borders } = territory(mapOf(node('a', 0.4, 0.4, 'crownlands'), node('b', 0.5, 0.4, 'black-host')), 0.06);
    for (const { a, b } of borders) for (const point of [a, b]) expect(Math.hypot(point[0] - 0.4, (point[1] - 0.4) / 1.5)).toBeLessThanOrEqual(0.06 * 1.02);
  });

  it('saves and reloads a map unchanged, and repairs a hand-edited file', () => {
    const original = mapOf(node('n1', 0.123456789, 0.5, 'crownlands', { kind: 'permanent', site: 'capital', name: 'Morning Vale', start: true }), node('n2', 0.6, 0.2, 'neutral'));
    const text = serializeMap(original);
    expect(parseMap(text)).toEqual({ ...original, nodes: [{ ...original.nodes[0], x: 0.12346 }, original.nodes[1]] });
    expect(serializeMap(parseMap(text))).toBe(text);
    const repaired = parseMap({ version: 1, image: 'x.jpg', aspect: 1.4, nodes: [
      { id: 'n1', x: 2, y: -1, kind: 'transient', affiliation: 'horde', start: true, target: true },
      { id: 'n1', x: 0.5, y: 0.5, kind: 'permanent', site: 'nonsense' }] });
    expect(repaired.nodes[0]).toEqual({ id: 'n1', x: 1, y: 0, kind: 'transient', affiliation: 'horde' });
    expect(repaired.nodes[1].id).not.toBe('n1');
    expect(repaired.nodes[1].site).toBe('landmark');
  });

  it('reports what is missing for the game to work', () => {
    const factions = ['crownlands', 'black-host'];
    const bare = validateMap(mapOf(node('a', 0.4, 0.4, 'crownlands'), node('b', 0.4, 0.4, 'elves')), factions);
    expect(bare.errors.join(' ')).toMatch(/unknown faction/);
    expect(bare.errors.join(' ')).toMatch(/on top of each other/);
    const ready = validateMap(mapOf(
      node('a', 0.2, 0.2, 'crownlands', { kind: 'permanent', site: 'capital', start: true, target: true }),
      node('b', 0.8, 0.5, 'black-host', { kind: 'permanent', site: 'capital', start: true }),
      node('c', 0.5, 0.6, 'neutral', { kind: 'permanent', site: 'waymark', start: true })), factions);
    expect(ready).toEqual({ errors: [], warnings: [] });
  });
});
