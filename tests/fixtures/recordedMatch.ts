import cards from './matches/mercenaries-turn-9/cards.json';
import { abilities } from '../../packages/extensions/src';
import * as v from 'valibot';
import { defineAbility } from '../../packages/extensions/src/definition';
import { legacyAbilities } from './legacyAbilities';
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
const pinned: typeof abilities = { ...abilities, ...Object.fromEntries(legacyAbilities.map(a => [a.id, a])), 'channel-neutral': legacyChannelNeutral };
/** Rule texts as they were when the match was recorded (the live texts have since been shortened). */
const recordedText: Record<string, { en: string; de: string }> = {
  'shield-wall': { en: 'Adjacent friendly creatures and holdings get +{amount} Defense while this card is on the battlefield. Empty slots do not close the gap.', de: 'Benachbarte eigene Kreaturen und Besitzungen erhalten +{amount} Verteidigung, solange diese Karte auf dem Schlachtfeld liegt. Leere Plätze schließen die Lücke nicht.' },
  guard: { en: "Attacks aimed at a lane next to this card are blocked by this card instead, even if that lane is empty. Stops one attacker per combat; the lane's own Guard blocks first.", de: 'Diese Karte blockt Angriffe auf eine benachbarte Bahn, selbst wenn die Bahn leer ist. Stoppt einen Angreifer pro Kampf; die Wache in der Zielbahn blockt zuerst.' },
};
const frozen = (id: string) => {
  const t = recordedText[id], a = pinned[id];
  return t ? { ...a, description: t.en, translations: { ...a.translations, de: { name: a.translations?.de?.name ?? a.name, description: t.de } } } : a;
};
export const recordedAbilities = Object.fromEntries(abilityIds.map(id => [id, id === 'rally' ? { ...frozen(id), name: 'Rally {amount}' } : frozen(id)]));
export const recordedRegistry = compileContent(cards, recordedAbilities, undefined, ['crownlands']);
