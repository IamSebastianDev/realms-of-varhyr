import { registry, starterDefinitions } from '../packages/content/src';
import { apply, assertInvariants, createMatch, decisionPlayer, replay, validateDeck } from '../packages/core/src';
import { botCommand } from '../packages/core/src/bot';
import type { CommandEnvelope } from '../packages/contracts/src';

const playable = starterDefinitions.filter(deck => !validateDeck(deck.cards, registry).length);
if (!playable.length) {
  console.log('No complete starter decks yet. Add test content and finish a 30-card starter in packages/content/src/starters.ts.');
  process.exit(0);
}
const seeds = process.argv.slice(2).length ? process.argv.slice(2).map(Number) : [731, 42, 77, 101, 999];
for (const seed of seeds) {
  const initial = createMatch(registry, [playable[0].cards, (playable[1] ?? playable[0]).cards], seed, { mulligan: true });
  const commands: CommandEnvelope[] = [];
  let state = initial;
  for (let move = 0; move < 1600 && !state.outcome; move++) {
    const envelope = { actor: decisionPlayer(state), expectedRevision: state.revision, command: botCommand(state, registry) };
    const result = apply(state, envelope, registry);
    if (result.error) throw new Error(`Seed ${seed}, move ${move}: ${result.error}`);
    state = result.state;
    commands.push(envelope);
    assertInvariants(state);
  }
  if (!state.outcome) throw new Error(`Seed ${seed}: match did not finish.`);
  if (JSON.stringify(replay(initial, commands, registry)) !== JSON.stringify(state)) throw new Error('Replay diverged');
  console.log(JSON.stringify({ seed, moves: commands.length, turn: state.turn, outcome: state.outcome, outcomeReason: state.outcomeReason }));
}
