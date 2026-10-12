import raw from './cards.json';
import { compileContent } from './compiler';
export { compileContent } from './compiler';
export { starterDecks, starterDefinitions, defaultDeckId } from './starters';
export { factionInfo, factionDefinitions } from './factions';
export const registry = compileContent(raw);
