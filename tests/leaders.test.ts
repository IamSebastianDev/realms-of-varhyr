import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { registry, starterDefinitions, factionDefinitions } from '../packages/content/src';
import { apply, assertInvariants, createMatch, effectiveStats, validateDeck } from '../packages/core/src';
import type { Command, GameState, PlayerId } from '../packages/contracts/src';

const leaders = Object.values(registry.cards).filter(card => card.subtypes.includes('leader'));
const crown = starterDefinitions.find(deck => deck.id === 'crown')!.cards;
function setup() { return createMatch(registry, [crown, crown], 731); }
function place(state: GameState, definitionId: string, player: PlayerId = 'p1', slot?: number) {
  const p = state.players[player], id = p.deck.pop()!;
  Object.assign(state.cards[id], { definitionId, zone: slot === undefined ? 'hand' : 'board', slot: slot ?? null, exhausted: false });
  if (slot === undefined) p.hand.push(id); else p.board[slot] = id;
  return id;
}
function step(state: GameState, command: Command) {
  const result = apply(state, { actor: state.active, expectedRevision: state.revision, command }, registry);
  expect(result.error).toBeUndefined(); assertInvariants(result.state); return result.state;
}

describe('Foundations faction leaders', () => {
  it('has one legendary leader for every faction and Neutral, with portrait-format card illustrations and its faction signature', () => {
    expect(leaders).toHaveLength(9);
    expect(factionDefinitions).toHaveLength(9);
    for (const faction of factionDefinitions) {
      const matches = leaders.filter(card => faction.id === 'neutral' ? !card.factions.length : card.factions.includes(faction.id));
      expect(matches, faction.id).toHaveLength(1);
      const leader = matches[0];
      expect(leader.legendary).toBe(true); expect(leader.rarity).toBe('legendary');
      expect(leader.set).toBe('foundations'); expect(leader.type).toBe('creature');
      expect(leader.translations?.de?.lore).toBeTruthy();
      expect(validateDeck([...crown.filter(id => id !== leader.id), leader.id, leader.id], registry)).toContain(`Too many copies of ${leader.name}.`);
      const art = `public${leader.art.split('?')[0]}`;
      expect(existsSync(art)).toBe(true);
      const png = readFileSync(art);
      expect(png.readUInt32BE(20) / png.readUInt32BE(16)).toBeCloseTo(1.5, 1);
      expect(leader.abilities.some(binding => binding.id === faction.signatureAbility)).toBe(true);
    }
  });
  it('retires the Winter POC cards and starter while retaining the Crown starter and neutral support', () => {
    expect(Object.values(registry.cards).filter(card => card.factions.includes('winter-league')).map(card => card.id)).toEqual(['morie-grandmistress']);
    expect(starterDefinitions.map(deck => deck.id)).toEqual(['hearth-and-stone','crown']);
    expect(validateDeck(crown, registry)).toEqual([]);
    expect(registry.cards['white-hall-apprentice']).toBeUndefined();
    expect(registry.cards['crowns-winter-envoy']).toBeUndefined();
    for (const id of ['borrowed-wisdom', 'snowroad-broker', 'itinerant-notary']) expect(registry.cards[id].factions).toEqual([]);
  });
  it.each(leaders)('$name pays its printed cost, enters exhausted and produces its faction energy', leader => {
    const state = setup(), id = place(state, leader.id);
    state.players.p1.energy = { neutral: leader.cost.generic, ...leader.cost.factions };
    const played = step(state, { type: 'play', cardId: id, slot: 2 });
    expect(played.cards[id].exhausted).toBe(true); expect(played.cards[id].slot).toBe(2);
    expect(Object.values(played.players.p1.energy).every(amount => amount === 0)).toBe(true);
    played.cards[id].exhausted = false;
    const channeled = step(played, { type: 'energy', cardId: id, option: 0 });
    expect(channeled.cards[id].exhausted).toBe(true);
    const expected = { ...leader.stats!.energyOutputs[0] };
    const trade = leader.abilities.find(binding => binding.id === 'trade');
    if (trade) expected.neutral = (expected.neutral ?? 0) + 1;
    expect(Object.fromEntries(Object.entries(channeled.players.p1.energy).filter(([, n]) => n))).toEqual(expected);
  });
  it('Alderic strengthens all friendly creatures, including himself', () => {
    const state = setup(), leader = place(state, 'aldric-runewarden', 'p1', 2);
    state.cards[leader].exhausted = true;
    const neighbor = place(state, 'crown-recruit', 'p1', 1), distant = place(state, 'crown-recruit', 'p1', 4), enemy = place(state, 'crown-recruit', 'p2', 1);
    expect(effectiveStats(state, neighbor, registry).attack).toBe(2);
    expect(effectiveStats(state, neighbor, registry).defense).toBe(3);
    expect(effectiveStats(state, distant, registry).attack).toBe(2);
    expect(effectiveStats(state, leader, registry)).toEqual({attack:4,defense:6});
    expect(effectiveStats(state, enemy, registry).attack).toBe(1);
  });
});

describe('Black Host Soul Harvest', () => {
  it.each(['ally', 'enemy', 'bulwark', 'self'] as const)('draws only for another friendly creature, when %s is destroyed', kind => {
    const state = setup(); state.active = 'p2';
    const priest = place(state, 'dark-priest-of-run', 'p1', 2);
    const side = kind === 'enemy' ? 'p2' : 'p1';
    const victim = kind === 'self' ? priest : place(state, kind === 'bulwark' ? 'crown-bulwark' : 'crown-recruit', side, 0);
    state.cards[victim].damage = registry.cards[state.cards[victim].definitionId].stats!.defense - 1;
    const spell = place(state, 'cleansing-light', side === 'p1' ? 'p2' : 'p1');
    state.active = side === 'p1' ? 'p2' : 'p1';
    state.players[state.active].energy = { crownlands: 1, neutral: 1 };
    const beforeHand = state.players.p1.hand.length, beforeLibrary = state.players.p1.deck.length;
    const next = step(state, { type: 'play', cardId: spell, target: victim });
    expect(next.cards[victim].zone).toBe('discard');
    expect(next.players.p1.deck).toHaveLength(beforeLibrary - (kind === 'ally' ? 1 : 0));
    expect(next.players.p1.hand).toHaveLength(beforeHand + (kind === 'ally' ? 1 : 0) - (state.active === 'p1' ? 1 : 0));
  });
});
