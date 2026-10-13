import cards from './matches/mercenaries-turn-9/cards.json';
import { abilities } from '../../packages/extensions/src';
import * as v from 'valibot';
import { defineAbility } from '../../packages/extensions/src/definition';
import { compileContent } from '../../packages/content/src/compiler';
/** Recorded games pin their card pool, faction IDs and registered ability list.
 * Newly enabled extensions must not rewrite a historical recording's content hash. */
const abilityIds = ['adjacent-banner','armor','channel-neutral','charge','damage','draw','flank-evasion','guard','heal','invocation','rally','rime','shield-wall','war-banner'];
/** The original neutral-only ability, kept as it was when the match was recorded. Live content now uses `channel`. */
const legacyChannelNeutral = defineAbility('channel-neutral', v.object({ amount: v.pipe(v.number(), v.integer(), v.minValue(1)) }), {
  name: 'Channel {amount} Neutral',
  description: 'Gain {amount} neutral energy in your current casting-phase pool. It can pay generic costs, but not faction-specific costs, and expires with that pool.',
  translations: { de: { name: 'Kanalisieren: {amount} Neutral', description: 'Erhalte {amount} neutrale Energie im Energievorrat deiner aktuellen Zauberphase. Sie bezahlt allgemeine Kosten, aber keine Fraktionskosten, und verfällt mit diesem Vorrat.' } },
  cast: (ctx, p) => ctx.issue({ type: 'gain-energy', player: ctx.source.controller, output: { neutral: p.amount as number }, source: ctx.source.id }),
});
const pinned: typeof abilities = { ...abilities, 'channel-neutral': legacyChannelNeutral };
export const recordedAbilities = Object.fromEntries(abilityIds.map(id => [id, id === 'rally' ? { ...pinned[id], name: 'Rally {amount}' } : pinned[id]]));
export const recordedRegistry = compileContent(cards, recordedAbilities, undefined, ['crownlands']);
