import raw from './cards.json';
import { compileContent } from './compiler';
export { compileContent } from './compiler';
export { starterDecks, starterDefinitions, defaultDeckId } from './starters';
export { factionInfo, factionDefinitions } from './factions';
export { avatarDefinitions, type AvatarDefinition } from './avatars';
export const registry = compileContent(raw);
