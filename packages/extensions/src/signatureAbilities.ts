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
 * Ordinary abilities such as Banner, Weaken and Armor remain shared, scalable vocabulary. */
export const signatureAbilities: AbilityExtension[] = [
  factionAbility('fealty', 'crownlands', {
    name: 'Fealty',
    description: 'All friendly creatures, including this one, have +1 Attack and +1 Defense.',
    translations: { de: { name: 'Lehnstreue', description: 'Alle eigenen Kreaturen, auch diese, erhalten +1 Angriff und +1 Verteidigung.' } },
    static: (source, target, _params, registry) => source.controller === target.controller && target.zone === 'board' && registry.cards[target.definitionId].type === 'creature' ? { attack: 1, defense: 1 } : {},
  }, 3),
  factionAbility('accord', 'winter-league', {
    name: 'Accord',
    description: 'After the first spell you cast during your play phase each turn, gain 1 Winter energy.',
    translations: { de: { name: 'Übereinkunft', description: 'Nach dem ersten Zauber, den du während deiner Spielphase in einem Zug wirkst, erhältst du 1 Winterenergie.' } },
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
    description: 'Exhaust: deploy a creature or holding from your hand to a free position without paying its cost. It enters exhausted.',
    translations: { de: { name: 'Aufgebot', description: 'Erschöpfe: Setze eine Kreatur oder Besitzung aus deiner Hand ohne Kosten auf einen freien Platz ein. Sie kommt erschöpft ins Spiel.' } },
    target: 'friendly-hand-field',
    placement: true,
    activate: ctx => { if (ctx.target && ctx.slot !== undefined) ctx.issue({ type: 'deploy', target: ctx.target, player: ctx.source.controller, slot: ctx.slot }); },
  }),
  factionAbility('trade', 'mountain-clans', {
    name: 'Trade',
    description: 'When this creature channels during your play phase, it also produces 1 neutral energy.',
    translations: { de: { name: 'Handel', description: 'Wenn diese Kreatur während deiner Spielphase Energie kanalisiert, erzeugt sie zusätzlich 1 neutrale Energie.' } },
    before: { 'energy.generate.before': (_ctx, _params, payload) => ({ ...payload, output: { ...payload.output, neutral: (payload.output?.neutral ?? 0) + 1 } }) },
  }),
  factionAbility('sanctuary', 'conclave', {
    name: 'Sanctuary',
    description: 'Adjacent friendly creatures have +1 Defense (+2 for Elves).',
    translations: { de: { name: 'Zuflucht', description: 'Benachbarte eigene Kreaturen erhalten +1 Verteidigung (Elfen +2).' } },
    static: (source, target, _params, registry) => {
      const card = registry.cards[target.definitionId];
      return areAdjacent(source, target) && card.type === 'creature' ? { defense: card.subtypes.includes('elf') ? 2 : 1 } : {};
    },
  }, 3),
  factionAbility('scorch', 'ember-fields', {
    name: 'Scorch',
    description: 'When played, deal 3 damage to the enemy creature or holding opposite.',
    translations: { de: { name: 'Versengen', description: 'Beim Ausspielen: Füge der gegenüberliegenden gegnerischen Kreatur oder Besitzung 3 Schaden zu.' } },
    hooks: { 'card.played': ctx => {
      if (ctx.event.cardId !== ctx.source.id) return;
      const id = opposite(ctx.source, ctx.state);
      if (id) ctx.issue({ type: 'damage', target: id, amount: 3, source: ctx.source.id });
    } },
  }),
  factionAbility('raid', 'horde', {
    name: 'Raid',
    description: 'This card has +1 Attack for each adjacent friendly creature.',
    translations: { de: { name: 'Überfall', description: 'Diese Karte erhält +1 Angriff für jede benachbarte eigene Kreatur.' } },
    static: (source, target, _params, registry, state) => {
      if (source.id !== target.id || !state) return {};
      const neighbors = state.players[source.controller].board.filter(id => id &&
        registry.cards[state.cards[id].definitionId].type === 'creature' && areAdjacent(source, state.cards[id])).length;
      return { attack: neighbors };
    },
  }, 3),
  factionAbility('soul-harvest', 'black-host', {
    name: 'Soul Harvest',
    description: 'Whenever another friendly creature is destroyed, draw a card.',
    translations: { de: { name: 'Seelenernte', description: 'Wird eine andere eigene Kreatur zerstört, ziehe eine Karte.' } },
    hooks: { 'creature.destroyed': ctx => {
      if (ctx.event.cardId !== ctx.source.id && ctx.event.snapshot?.controller === ctx.source.controller)
        ctx.issue({ type: 'draw', player: ctx.source.controller, amount: 1 });
    } },
  }),
  factionAbility('dark-harvest', 'black-host', {
    name: 'Dark Harvest',
    description: 'Exhaust: put the top card of your library into your discard pile and gain 2 Host energy. Needs two cards in your library.',
    translations: { de: { name: 'Dunkle Ernte', description: 'Erschöpfe: Lege die oberste Karte deiner Bibliothek auf den Ablagestapel und erhalte 2 Heerenergie. Benötigt zwei Karten in der Bibliothek.' } },
    canActivate: (source, state) => state.players[source.controller].deck.length > 1,
    activate: ctx => {
      ctx.issue({ type: 'mill', player: ctx.source.controller, amount: 1 });
      ctx.issue({ type: 'gain-energy', player: ctx.source.controller, output: { 'black-host': 2 }, source: ctx.source.id });
    },
  }),
  factionAbility('wayfarer', 'neutral', {
    name: 'Wayfarer',
    description: 'Exhaust: return a friendly creature (including this one) to its owner’s hand, clearing its damage.',
    translations: { de: { name: 'Weggefährte', description: 'Erschöpfe: Nimm eine eigene Kreatur (auch diese) auf die Hand ihres Besitzers zurück und entferne ihren Schaden.' } },
    target: 'friendly-creature',
    activate: ctx => { if (ctx.target) ctx.issue({ type: 'return', target: ctx.target }); },
  }, 1),
];
