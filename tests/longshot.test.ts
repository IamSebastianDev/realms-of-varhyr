import { describe, expect, it } from 'vitest';
import { compileContent, registry, starterDefinitions } from '../packages/content/src';
import { apply, createMatch, effectiveStats, legalActions } from '../packages/core/src';
import type { Command, GameState, PlayerId } from '../packages/contracts/src';

const deck = starterDefinitions[0].cards;
function place(state: GameState, definitionId: string, side: PlayerId, slot: number) {
  const player = state.players[side], id = player.deck.pop()!;
  Object.assign(state.cards[id], { definitionId, zone: 'board', slot, exhausted: false, damage: 0 });
  player.board[slot] = id;
  return id;
}
const run = (state: GameState, command: Command) => apply(state, { actor: 'p1', expectedRevision: state.revision, command }, registry);

describe('Oakholme Bowmen', () => {
  const card = registry.cards['oakholme-bowmen'];
  it('is a 3/2 Bright Marches creature that costs 1 + 1 and makes 2 energy', () => {
    expect(card.stats).toMatchObject({ attack: 3, defense: 2, energyOutputs: [{ 'bright-marches': 2 }] });
    expect(card.cost).toEqual({ generic: 1, factions: { 'bright-marches': 1 } });
  });
  it('exhausts to hit any enemy creature, not bulwarks or players', () => {
    const state = createMatch(registry, [deck, deck], 731);
    state.active = 'p1'; state.phase = 'play';
    const bowmen = place(state, 'oakholme-bowmen', 'p1', 0);
    const far = place(state, 'crown-recruit', 'p2', 4), bulwark = place(state, 'crown-bulwark', 'p2', 2);
    const action = legalActions(state, registry).activations.find(a => a.cardId === bowmen)!;
    expect(action.targets).toEqual([far]);
    const hit = run(state, { type: 'activate', cardId: bowmen, ability: action.ability, target: far });
    expect(hit.error).toBeUndefined();
    expect(hit.state.cards[bowmen].exhausted).toBe(true);
    expect(hit.state.cards[far].damage + (hit.state.cards[far].zone === 'board' ? 0 : 1)).toBeGreaterThanOrEqual(1);
    expect(run(state, { type: 'activate', cardId: bowmen, ability: action.ability, target: bulwark }).error).toBeTruthy();
  });
});

describe('Odric the Berserker', () => {
  const card = registry.cards['odric-the-berserker'];
  it('is a legendary 5/3 Bright Marches creature with Armor 1 and Charge 2 into the center', () => {
    expect(card).toMatchObject({ legendary: true, rarity: 'legendary', cost: { generic: 2, factions: { 'bright-marches': 1 } } });
    expect(card.stats).toMatchObject({ attack: 5, defense: 3, energyOutputs: [{ 'bright-marches': 2 }] });
    expect(card.abilities).toEqual([{ id: 'armor', params: { amount: 1 } }, { id: 'charge', params: { amount: 2, position: 'Center' } }]);
  });
});

describe('Revenge', () => {
  const card = registry.cards['revenge'];
  it('is a Bright Marches spell that deals 3 damage and can only be cast in the death window', () => {
    expect(card).toMatchObject({ type: 'spell', timing: ['death'], cast: [{ id: 'damage', params: { amount: 3 } }] });
    expect(card.factions).toEqual(['bright-marches']);
  });
});

describe('Channel and Gift of the March', () => {
  it('Gift of the March channels Bright Marches energy', () => {
    expect(registry.cards['gift-of-the-march'].cast).toEqual([{ id: 'channel', params: { amount: 2, energy: 'bright-marches' } }]);
    expect(registry.abilities['channel-neutral']).toBeUndefined();
  });
  it('rejects an unknown energy type', () => {
    expect(() => registry.abilities.channel.validate({ amount: 1 })).toThrow();
    const bad = { ...registry.cards['gift-of-the-march'], cast: [{ id: 'channel', params: { amount: 1, energy: 'nonsense' } }] };
    expect(() => compileContent([bad])).toThrow(/Unknown energy type/);
  });
});

describe('Wooden Fort', () => {
  const card = registry.cards['wooden-fort'];
  it('is a rare 2/5 Bright Marches bulwark costing 1 + 2 that shields its neighbors', () => {
    expect(card).toMatchObject({ type: 'bulwark', rarity: 'rare', factions: ['bright-marches'], cost: { generic: 1, factions: { 'bright-marches': 2 } } });
    expect(card.stats).toMatchObject({ attack: 2, defense: 5 });
    expect(card.abilities).toEqual([{ id: 'shield-wall', params: { amount: 1 } }]);
  });
});

describe('Volley and Strike the Hammer', () => {
  it('Volley costs 2 Marches and Strike the Hammer deals 5 damage with the shared Damage ability', () => {
    expect(registry.cards['volley']).toMatchObject({ type: 'spell', timing: ['play'], cost: { generic: 0, factions: { 'bright-marches': 2 } }, cast: [{ id: 'barrage', params: { amount: 1 } }] });
    expect(registry.cards['strike-the-hammer']).toMatchObject({ type: 'spell', timing: ['play'], cost: { generic: 2, factions: { 'bright-marches': 2 } }, cast: [{ id: 'damage', params: { amount: 5 } }] });
  });
  it('Volley hits every enemy creature for 1 and leaves bulwarks, players and its own side alone', () => {
    const state = createMatch(registry, [deck, deck], 731);
    state.active = 'p1'; state.phase = 'play';
    const spell = state.players.p1.deck.pop()!;
    Object.assign(state.cards[spell], { definitionId: 'volley', zone: 'hand', slot: null });
    state.players.p1.hand.push(spell);
    state.players.p1.energy = { 'bright-marches': 2 };
    const a = place(state, 'crown-recruit', 'p2', 0), b = place(state, 'crown-recruit', 'p2', 3), fort = place(state, 'crown-bulwark', 'p2', 2), mine = place(state, 'crown-recruit', 'p1', 1);
    const life = state.players.p2.life;
    const result = run(state, { type: 'play', cardId: spell, payment: { 'bright-marches': 2 } });
    expect(result.error).toBeUndefined();
    const after = result.state;
    expect([after.cards[a].damage, after.cards[b].damage, after.cards[fort].damage, after.cards[mine].damage]).toEqual([1, 1, 0, 0]);
    expect(after.players.p2.life).toBe(life);
  });
});

describe('Oakholme Archery Captain', () => {
  const card = registry.cards['oakholme-archery-captain'];
  it('is a rare 2/3 archer that produces 2, with Longshot 1 and Drillmaster 1', () => {
    expect(card).toMatchObject({ rarity: 'rare', cost: { generic: 2, factions: { 'bright-marches': 1 } } });
    expect(card.stats).toMatchObject({ attack: 2, defense: 3, energyOutputs: [{ 'bright-marches': 2 }] });
    expect(card.abilities.map(a => a.id)).toEqual(['longshot', 'drillmaster']);
    expect(registry.cards['oakholme-bowmen'].subtypes).toContain('archer');
  });
  it('gives adjacent archers +1 Attack, but not other creatures, distant archers or enemies', () => {
    const state = createMatch(registry, [deck, deck], 731);
    const captain = place(state, 'oakholme-archery-captain', 'p1', 2);
    const bowmen = place(state, 'oakholme-bowmen', 'p1', 1), farBowmen = place(state, 'oakholme-bowmen', 'p1', 4);
    const recruit = place(state, 'crown-recruit', 'p1', 3), enemyBowmen = place(state, 'oakholme-bowmen', 'p2', 1);
    const attack = (id: string) => effectiveStats(state, id, registry).attack;
    expect([attack(bowmen), attack(farBowmen), attack(recruit), attack(enemyBowmen)]).toEqual([4, 3, 1, 3]);
    expect(attack(captain)).toBe(2);
  });
});

describe('Marches legendary energy output', () => {
  it('scales with cost: Bosci produces 3 and Odric produces 2', () => {
    expect(registry.cards['bosci-lord-of-seacliffe'].stats!.energyOutputs).toEqual([{ 'bright-marches': 3 }]);
    expect(registry.cards['odric-the-berserker'].stats!.energyOutputs).toEqual([{ 'bright-marches': 2 }]);
  });
});

describe('Puncture', () => {
  it('is a Bright Marches spell costing 1 Marches energy that deals 2 damage with the Damage ability', () => {
    expect(registry.cards['puncture']).toMatchObject({ type: 'spell', timing: ['play'], factions: ['bright-marches'], cost: { generic: 0, factions: { 'bright-marches': 1 } }, cast: [{ id: 'damage', params: { amount: 2 } }] });
  });
});

describe('Hearth Guard', () => {
  const card = registry.cards['hearth-guard'];
  it('is a rare 4/2 human that costs 3, produces 2 and carries War Banner 2', () => {
    expect(card).toMatchObject({ type: 'creature', rarity: 'rare', factions: ['bright-marches'], subtypes: ['human'], cost: { generic: 2, factions: { 'bright-marches': 1 } } });
    expect(card.stats).toMatchObject({ attack: 4, defense: 2, energyOutputs: [{ 'bright-marches': 2 }] });
    expect(card.abilities).toEqual([{ id: 'war-banner', params: { amount: 2 } }]);
  });
});

describe('Bright Marches starter deck', () => {
  it('is Hearth and Stone: a legal 30-card deck that is not the default', async () => {
    const { starterDefinitions, defaultDeckId } = await import('../packages/content/src');
    const starter = starterDefinitions.find(deck => deck.id === 'hearth-and-stone')!;
    expect(starter.name).toBe('Hearth and Stone');
    expect(starter.cards).toHaveLength(30);
    expect(defaultDeckId).toBe('crown');
  });
});

describe('Seacliffe Castle', () => {
  it('is a legendary Bright Marches bulwark with guard, shield wall and longshot', () => {
    const c = registry.cards['seacliffe-castle'];
    expect(c.type).toBe('bulwark');
    expect(c.legendary).toBe(true);
    expect(c.abilities.map(a => a.id)).toEqual(['guard', 'shield-wall', 'longshot']);
  });
});
