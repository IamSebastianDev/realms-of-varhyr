import raw from './cards.json';
import { compileContent } from './compiler';
export { compileContent } from './compiler';
export { starterDecks, starterDefinitions, defaultDeckId } from './starters';
export { factionInfo, factionDefinitions } from './factions';
export { setDefinitions, setInfo, type SetDefinition } from './sets';
export { avatarDefinitions, defaultAvatarId, type AvatarDefinition } from './avatars';
export const registry = compileContent(raw);
