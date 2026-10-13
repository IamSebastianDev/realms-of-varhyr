// Retired Winter POC cards: test-only regression content, never imported by the game.
import cards from './winter-cards.json';
import starters from './winter-starters.json';
import { compileContent as compile } from '../../packages/content/src/compiler';
import { abilities } from '../../packages/extensions/src';
export const starterDefinitions = starters;
export function compileContent(input: unknown[]) { return compile(input, abilities, 'winter-regression', ['crownlands', 'winter-league']); }
export const registry = compileContent(cards);
