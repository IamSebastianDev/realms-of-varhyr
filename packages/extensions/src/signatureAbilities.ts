import * as v from 'valibot';
import { defineAbility } from './definition';
import { areAdjacent, type AbilityExtension, type CardInstance, type BattlefieldState } from '../../contracts/src';

const emptyParams = v.strictObject({});
const enemy = (source: CardInstance) => source.controller === 'p1' ? 'p2' : 'p1';
const opposite = (source: CardInstance, state: BattlefieldState) => source.slot === null ? undefined : state.players[enemy(source)].board[source.slot];
function factionAbility(id: string, faction: string, impl: Omit<AbilityExtension, 'id' | 'version' | 'validate'>, version = 2): AbilityExtension {
  return defineAbility(id,emptyParams,{...impl,faction},version);
}

/** Faction-exclusive mechanics, reusable on leaders and other cards of the same affiliation.
 * Each keyword is a fixed rule with empty params; its strength is part of the rule.
 * Ordinary abilities such as Formation, Rime and Armor remain shared, scalable vocabulary. */
export const signatureAbilities: AbilityExtension[] = [
  factionAbility('fealty', 'crownlands', {
    name: 'Fealty',
    description: 'All friendly creatures have +1 Attack and +1 Defense while this card is on the battlefield, including this creature itself.',
    translations: { de: { name: 'Lehnstreue', description: 'Solange diese Karte auf dem Schlachtfeld liegt, erhalten alle eigenen Kreaturen +1 Angriff und +1 Verteidigung, einschließlich dieser Kreatur selbst.' } },
    static: (source, target, _params, registry) => source.controller === target.controller && target.zone === 'board' && registry.cards[target.definitionId].type === 'creature' ? { attack: 1, defense: 1 } : {},
  }, 3),
  factionAbility('accord', 'winter-league', {
    name: 'Accord',
    description: 'After the first spell you cast during your play phase each turn, gain 1 Winter energy. Active even while exhausted.',
    translations: { de: { name: 'Übereinkunft', description: 'Nach dem ersten Zauber, den du während deiner Spielphase in einem Zug wirkst, erhältst du 1 Winterenergie. Auch im erschöpften Zustand aktiv.' } },
    hooks: { 'spell.cast': ctx => {
      if (ctx.state.phase !== 'play' || ctx.state.active !== ctx.source.controller || ctx.event.player !== ctx.source.controller) return;
      let start = ctx.state.events.length - 1;
      while (start >= 0 && ctx.state.events[start].type !== 'turn.started') start--;
      const casts = ctx.state.events.slice(start + 1).filter(event => event.type === 'spell.cast' && event.player === ctx.source.controller);
      if (casts.length === 1) ctx.issue({ type: 'gain-energy', player: ctx.source.controller, output: { 'winter-league': 1 }, source: ctx.source.id });
    } },
  }),
  factionAbility('marches-rally', 'bright-marches', {
    name: 'Rally',
    description: 'Exhaust during your play phase to deploy a creature or holding from your hand into a free position without paying its energy cost. It enters exhausted and its entry abilities trigger normally.',
    translations: { de: { name: 'Aufgebot', description: 'Erschöpfe diese Karte während deiner Spielphase, um eine Kreatur oder eine Besitzung aus deiner Hand auf einem freien Platz einzusetzen, ohne ihre Energiekosten zu bezahlen. Sie kommt erschöpft ins Spiel und ihre Eintrittsfähigkeiten werden normal ausgelöst.' } },
    target: 'friendly-hand-field',
    placement: true,
    activate: ctx => { if (ctx.target && ctx.slot !== undefined) ctx.issue({ type: 'deploy', target: ctx.target, player: ctx.source.controller, slot: ctx.slot }); },
  }),
  factionAbility('trade', 'mountain-clans', {
    name: 'Trade',
    description: 'When this creature channels during your play phase, it also produces 1 neutral energy. This bonus does not apply to response energy.',
    translations: { de: { name: 'Handel', description: 'Wenn diese Kreatur während deiner Spielphase Energie kanalisiert, erzeugt sie zusätzlich 1 neutrale Energie. Dieser Bonus gilt nicht für Todesenergie.' } },
    before: { 'energy.generate.before': (_ctx, _params, payload) => ({ ...payload, output: { ...payload.output, neutral: (payload.output?.neutral ?? 0) + 1 } }) },
  }),
  factionAbility('sanctuary', 'conclave', {
    name: 'Sanctuary',
    description: 'Adjacent friendly creatures have +1 Defense while this card is on the battlefield. Elves receive an additional +1 Defense.',
    translations: { de: { name: 'Zuflucht', description: 'Solange diese Karte auf dem Schlachtfeld liegt, erhalten benachbarte eigene Kreaturen +1 Verteidigung. Elfen erhalten zusätzlich +1 Verteidigung.' } },
    static: (source, target, _params, registry) => {
      const card = registry.cards[target.definitionId];
      return areAdjacent(source, target) && card.type === 'creature' ? { defense: card.subtypes.includes('elf') ? 2 : 1 } : {};
    },
  }, 3),
  factionAbility('scorch', 'ember-fields', {
    name: 'Scorch',
    description: 'When played, deal 3 damage to the opposing creature or holding directly opposite this card’s deployed position. An empty position takes no damage; players are not targets.',
    translations: { de: { name: 'Versengen', description: 'Beim Ausspielen: Füge der direkt gegenüberliegenden gegnerischen Kreatur oder der Besitzung 3 Schaden zu. Ein leerer Platz erleidet keinen Schaden; Spieler sind keine Ziele.' } },
    hooks: { 'card.played': ctx => {
      if (ctx.event.cardId !== ctx.source.id) return;
      const id = opposite(ctx.source, ctx.state);
      if (id) ctx.issue({ type: 'damage', target: id, amount: 3, source: ctx.source.id });
    } },
  }),
  factionAbility('raid', 'horde', {
    name: 'Raid',
    description: 'This card has +1 Attack for each adjacent friendly creature. Holdings do not count.',
    translations: { de: { name: 'Überfall', description: 'Diese Karte erhält +1 Angriff für jede benachbarte eigene Kreatur. Besitzungen zählen nicht.' } },
    static: (source, target, _params, registry, state) => {
      if (source.id !== target.id || !state) return {};
      const neighbors = state.players[source.controller].board.filter(id => id &&
        registry.cards[state.cards[id].definitionId].type === 'creature' && areAdjacent(source, state.cards[id])).length;
      return { attack: neighbors };
    },
  }, 3),
  factionAbility('soul-harvest', 'black-host', {
    name: 'Soul Harvest',
    description: 'While this card is on the battlefield, whenever another friendly creature is destroyed, draw one card from your library. Does not trigger for holdings or this card itself.',
    translations: { de: { name: 'Seelenernte', description: 'Solange diese Karte auf dem Schlachtfeld liegt: Wird eine andere eigene Kreatur zerstört, ziehe eine Karte aus deiner Bibliothek. Gilt nicht für Besitzungen oder diese Karte selbst.' } },
    hooks: { 'creature.destroyed': ctx => {
      if (ctx.event.cardId !== ctx.source.id && ctx.event.snapshot?.controller === ctx.source.controller)
        ctx.issue({ type: 'draw', player: ctx.source.controller, amount: 1 });
    } },
  }),
  factionAbility('wayfarer', 'neutral', {
    name: 'Wayfarer',
    description: 'Exhaust during your play phase to return a friendly creature to its owner’s hand, clearing its damage. You may choose this card itself. Costs are not refunded; replaying it pays its normal cost and it enters exhausted.',
    translations: { de: { name: 'Weggefährte', description: 'Erschöpfe diese Karte während deiner Spielphase, um eine eigene Kreatur auf die Hand ihres Besitzers zurückzunehmen und ihren Schaden zu entfernen. Du darfst diese Karte selbst wählen. Kosten werden nicht erstattet; beim erneuten Ausspielen gelten die normalen Kosten und sie kommt erschöpft ins Spiel.' } },
    target: 'friendly-creature',
    activate: ctx => { if (ctx.target) ctx.issue({ type: 'return', target: ctx.target }); },
  }, 1),
];
