import cards from './matches/mercenaries-turn-9/cards.json';
import { abilities } from '../../packages/extensions/src';
import { compileContent } from '../../packages/content/src/compiler';
/** Recorded games pin their card pool, faction IDs and registered ability list.
 * Newly enabled extensions must not rewrite a historical recording's content hash. */
const abilityIds = ['adjacent-banner','armor','channel-neutral','charge','damage','draw','flank-evasion','guard','heal','invocation','rally','rime','shield-wall','war-banner'];
export const recordedAbilities = Object.fromEntries(abilityIds.map(id => [id, id === 'rally' ? { ...abilities[id], name: 'Rally {amount}' } : abilities[id]]));
export const recordedRegistry = compileContent(cards, recordedAbilities, undefined, ['crownlands']);
