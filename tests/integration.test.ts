import { describe, expect, it } from 'vitest';
import { defaultDeckId, registry, starterDefinitions } from '../packages/content/src';
import { apply, assertInvariants, createMatch, decisionPlayer, projectForPlayer, replay, validateDeck } from '../packages/core/src';
import { botCommand } from '../packages/core/src/bot';
import type { CommandEnvelope, GameState } from '../packages/contracts/src';

// Whole matches on the real card pool. Nothing here names a card, a stat or a rule number, so rebalancing never breaks it.
// What it does catch: any card, ability or deck that leaves the engine stuck, throws, corrupts state or stops replaying.

function playOut(seed: number, decks: [string[], string[]], limit = 1500) {
  const initial = createMatch(registry, decks, seed);
  let state: GameState = initial;
  const log: CommandEnvelope[] = [];
  while (!state.outcome && log.length < limit) {
    const actor = decisionPlayer(state), command = botCommand(state, registry);
    const envelope: CommandEnvelope = { actor, expectedRevision: state.revision, command };
    const result = apply(state, envelope, registry);
    if (result.error) throw new Error(`seed ${seed}, move ${log.length}: ${JSON.stringify(command)} rejected: ${result.error}`);
    assertInvariants(result.state);
    state = result.state; log.push(envelope);
  }
  return { initial, state, log };
}

describe('real card pool', () => {
  it('ships legal starter decks', () => {
    expect(starterDefinitions.length).toBeGreaterThan(0);
    for (const deck of starterDefinitions) expect(validateDeck(deck.cards, registry), deck.id).toEqual([]);
    expect(starterDefinitions.some(deck => deck.id === defaultDeckId)).toBe(true);
  });

  const pairings = starterDefinitions.flatMap((a, i) => starterDefinitions.slice(i).map(b => [a, b] as const));
  it.each(pairings)('plays %# to a finish and replays identically', (a, b) => {
    for (const seed of [1, 2, 3]) {
      const { initial, state, log } = playOut(seed, [a.cards, b.cards]);
      expect(state.outcome, `${a.id} vs ${b.id}, seed ${seed}`).not.toBeNull();
      expect(replay(initial, log, registry)).toEqual(state);
    }
  });

  it('never shows a player anything hidden about the other side', () => {
    const [deck] = starterDefinitions;
    const { initial, log } = playOut(7, [deck.cards, deck.cards]);
    let state = initial;
    for (const envelope of log.slice(0, 120)) {
      state = apply(state, envelope, registry).state;
      for (const seat of ['p1', 'p2'] as const) {
        const other = seat === 'p1' ? 'p2' : 'p1', view = projectForPlayer(state, seat, registry);
        const json = JSON.stringify(view);
        for (const id of [...state.players[other].hand, ...state.players[other].deck]) expect(view.cards[id]?.definitionId ?? null, id).toBeNull();
        expect(json).not.toContain('"rng"');
      }
    }
  });
});
