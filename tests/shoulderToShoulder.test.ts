import { describe, expect, it } from 'vitest';
import { effectiveStats } from '../packages/core/src';
import { registry } from '../packages/content/src';
import type { CardInstance } from '../packages/contracts/src';

const ids = Object.keys(registry.cards);
const axeman = 'marcher-axeman';
const filler = (type: 'creature' | 'bulwark') => ids.find(id => registry.cards[id].type === type && id !== axeman && (type === 'bulwark' ? registry.cards[id].abilities.every(a => a.id === 'armor' || a.id === 'rally') : !registry.cards[id].abilities.length))!;
function board(slots: (string | null)[]) {
  const cards: Record<string, CardInstance> = {};
  const row = slots.map((definitionId, slot) => {
    if (!definitionId) return null;
    const id = `c${slot}`;
    cards[id] = { id, definitionId, owner: 'p1', controller: 'p1', zone: 'board', slot, exhausted: false, damage: 0 };
    return id;
  });
  const empty = { board: [null, null, null, null, null] } as never;
  return { cards, players: { p1: { board: row }, p2: empty } } as never;
}
const attackAt = (slots: (string | null)[], slot: number) => effectiveStats(board(slots), `c${slot}`, registry).attack;

describe('Shoulder to Shoulder', () => {
  const printed = registry.cards[axeman].stats!.attack;
  it('is on the Marcher Axeman', () => expect(registry.cards[axeman].abilities.map(a => a.id)).toContain('shoulder-to-shoulder'));
  it('gives +1 Attack with a creature and a bulwark beside it', () => {
    expect(attackAt([null, filler('creature'), axeman, filler('bulwark'), null], 2)).toBe(printed + 1);
  });
  it('needs both sides and ignores empty slots, flanks and the enemy row', () => {
    expect(attackAt([null, filler('creature'), axeman, null, null], 2)).toBe(printed);
    expect(attackAt([null, null, axeman, filler('creature'), null], 2)).toBe(printed);
    expect(attackAt([axeman, filler('creature'), null, null, null], 0)).toBe(printed);
    expect(attackAt([null, null, null, filler('creature'), axeman], 4)).toBe(printed);
  });
});
