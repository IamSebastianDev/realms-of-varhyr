import { defineAbility as extension } from "./definition";
import { spellAbilities } from "./spellAbilities";
import { amount, amountSchema } from "./schemas";
import * as v from "valibot";
import { areAdjacent, battlefieldPositions, type AbilityExtension, type BattlefieldState, type CardInstance } from "../../contracts/src";
import { positive } from "./schemas";
/** `subtype` is a freeform creature subtype such as archer; it is matched against each card's subtypes. */
const empty = v.object({});
/** `card` is a card ID; the content compiler checks that it exists. */
const musterSchema = v.strictObject({ card: v.pipe(v.string(), v.minLength(1)) });
/** Fixed-rule keywords without parameters, mostly carried by faction leaders. Resolved effects are announced on the triggering event. */
function leaderAbility(id: string, impl: Omit<AbilityExtension, "id" | "version" | "validate">, version = 2): AbilityExtension {
    return extension(id, empty, { ...impl, announce: true }, version);
}
const drillSchema = v.strictObject({ amount: positive, subtype: v.pipe(v.string(), v.minLength(1)) });

/** Evergreen keywords: scalable vocabulary on the card itself, usable by any faction. */
export const evergreenAbilities: AbilityExtension[] = [
    extension("primal", amountSchema, {
        name: "Primal {amount}",
        description: "Exhaust: choose a faction and gain {amount} energy of that faction.",
        translations: { de: { name: "Urkraft {amount}", description: "Erschöpfe: Wähle eine Fraktion und erhalte {amount} Energie dieser Fraktion." } },
        target: "energy-type",
        activationEnergy: (params, registry) => registry.energyTypes.filter(color => color !== "neutral").map(color => ({ [color]: amount(params) })),
        activate: (ctx, p) => ctx.issue({ type: "gain-energy", player: ctx.source.controller, output: { [ctx.target!]: amount(p) }, source: ctx.source.id }),
    }),

    extension("armor", amountSchema, {
        translations: { de: {"name": "Rüstung {amount}", "description": "Verringere jeden erlittenen Schaden um {amount}, bis auf null."} },
        name: "Armor {amount}",
        description: "Reduce each incoming damage hit by {amount}, down to zero.",
        before: {
            "damage.before": (_ctx, p, payload) => ({
                ...payload,
                amount: Math.max(0, (payload.amount ?? 0) - amount(p)),
            }),
        },
    }),

    extension("banner", amountSchema, {
        translations: { de: {"name": "Banner {amount}", "description": "Benachbarte eigene Kreaturen und Besitzungen erhalten +{amount} Angriff."} },
        name: "Banner {amount}",
        description:
            "Adjacent friendly creatures and holdings get +{amount} Attack.",
        static: (source, target, p) => (areAdjacent(source, target) ? { attack: amount(p) } : {}),
    }),

    extension("outflank", amountSchema, {
        translations: { de: { name: "Flankenangriff {amount}", description: "Solange diese Kreatur auf einer Flanke steht, hat sie +{amount} Angriff." } },
        name: "Outflank {amount}",
        description: "While on a flank, this creature has +{amount} Attack.",
        static: (source, target, p) => source.id === target.id && (source.slot === 0 || source.slot === battlefieldPositions.length - 1) ? { attack: amount(p) } : {},
    }),

    extension("drillmaster", drillSchema, {
        translations: { de: { name: "Drillmeister {amount}", description: "Benachbarte eigene Kreaturen vom Typ {subtype} erhalten +{amount} Angriff." } },
        name: "Drillmaster {amount}",
        description: "Adjacent friendly {subtype} creatures get +{amount} Attack.",
        static: (source, target, p, registry) =>
            areAdjacent(source, target) && registry.cards[target.definitionId].type === "creature" && registry.cards[target.definitionId].subtypes.includes(p.subtype as string)
                ? { attack: amount(p) }
                : {},
    }),

    extension("bind", drillSchema, {
        translations: { de: { name: "Bindung {amount}", description: "Eigene Kreaturen vom Typ {subtype} erhalten +{amount} Verteidigung." } },
        name: "Bind {amount}",
        description: "Friendly {subtype} creatures have +{amount} Defense.",
        static: (source, target, p, registry) =>
            source.id !== target.id &&
            source.controller === target.controller &&
            registry.cards[target.definitionId].type === "creature" &&
            registry.cards[target.definitionId].subtypes.includes(p.subtype as string)
                ? { defense: amount(p) }
                : {},
    }),

    extension("consume", amountSchema, {
        translations: { de: { name: "Verschlingen {amount}", description: "Zusätzliche Kosten: Opfere eine eigene Kreatur mit Kosten von mindestens {amount}." } },
        name: "Consume {amount}",
        description: "Additional cost: sacrifice one of your creatures that costs at least {amount}.",
        before: { "card.play.before": (_ctx, p, payload) => ({ ...payload, consume: true, consumeMin: Math.max(payload.consumeMin ?? 0, amount(p)) }) },
    }),

    extension("shield-wall", amountSchema, {
        translations: { de: {"name": "Schildwall {amount}", "description": "Benachbarte eigene Kreaturen und Besitzungen erhalten +{amount} Verteidigung."} },
        name: "Shield Wall {amount}",
        description:
            "Adjacent friendly creatures and holdings get +{amount} Defense.",
        static: (source, target, p) => (areAdjacent(source, target) ? { defense: amount(p) } : {}),
    }),

    extension("guard", empty, {
        translations: { de: {"name": "Wache", "description": "Blockt Angriffe auf benachbarte Bahnen, auch leere. Stoppt einen Angreifer pro Kampf."} },
        name: "Guard",
        description:
            "Blocks attacks aimed at adjacent lanes, even empty ones. Stops one attacker per combat.",
        intercepts: (source, _attacker, lane) => source.slot !== null && Math.abs(source.slot - lane) === 1,
    }),

    extension("sneaky", empty, {
        translations: { de: {"name": "Heimlich", "description": "Kann nicht geblockt werden. Sein Angriff trifft immer den Spieler."} },
        name: "Sneaky",
        description: "Cannot be blocked. Its attack always hits the opposing player.",
        // Only restricts the carrier as an attacker; a Sneaky card still blocks normally.
        canBlock: (source, attacker) => source.id !== attacker.id,
    }),

    extension("muster", musterSchema, {
        translations: { de: {"name": "Aufgebot: {card}", "description": "Beim Ausspielen: Suche alle Exemplare von {card} in deiner Bibliothek und nimm sie auf die Hand."} },
        name: "Muster {card}",
        description: "When played, search your library for all copies of {card} and put them into your hand.",
        announce: true,
        hooks: { "card.played": (ctx, p) => {
            if (ctx.event.cardId !== ctx.source.id) return;
            ctx.issue({ type: "search", player: ctx.source.controller, card: p.card as string, source: ctx.source.id });
        } },
        // As a spell operation, the same search resolves when the spell is cast.
        cast: (ctx, p) => ctx.issue({ type: "search", player: ctx.source.controller, card: p.card as string, source: ctx.source.id }),
    }),

    extension("ransack", empty, {
        translations: { de: {"name": "Plündern", "description": "Beim Ausspielen: Sieh dir die Handkarten deines Gegners an und wähle eine davon. Dein Gegner legt sie ab."} },
        name: "Ransack",
        description: "When played, look at your opponent's hand and choose a card. They discard it.",
        announce: true,
        hooks: { "card.played": (ctx) => {
            if (ctx.event.cardId !== ctx.source.id) return;
            ctx.issue({ type: "ransack", player: ctx.source.controller, source: ctx.source.id });
        } },
        // As a spell operation, the same look-and-discard resolves when the spell is cast.
        cast: (ctx) => ctx.issue({ type: "ransack", player: ctx.source.controller, source: ctx.source.id }),
    }),

    extension("forced-march", empty, {
        translations: { de: {"name": "Eilmarsch", "description": "Kommt bereit ins Spiel: Kann im selben Zug angreifen oder Energie erzeugen."} },
        name: "Forced March",
        description: "Enters the battlefield ready: it can attack or channel energy the turn it is played.",
        before: { "creature.enter.before": (_ctx, _p, payload) => ({ ...payload, exhausted: false }) },
    }),

    extension("charge", v.strictObject({ amount: positive }), {
        translations: { de: {"name": "Ansturm {amount}", "description": "Beim Ausspielen: Füge der gegenüberliegenden gegnerischen Kreatur {amount} Schaden zu."} },
        name: "Charge {amount}",
        description:
            "When played, deal {amount} damage to the enemy creature opposite.",
        hooks: {
            "card.played": (ctx, p) => {
                if (ctx.event.cardId !== ctx.source.id || ctx.source.slot === null) return;
                const enemy = ctx.source.controller === "p1" ? "p2" : "p1";
                const id = ctx.state.players[enemy].board[ctx.source.slot];
                if (id && ctx.registry.cards[ctx.state.cards[id].definitionId].type === "creature")
                    ctx.issue({ type: "damage", target: id, amount: amount(p), source: ctx.source.id });
            },
        },
    }),

    extension("rest", amountSchema, {
        translations: { de: {"name": "Rast {amount}", "description": "Erschöpfe: Stelle {amount} Leben wieder her."} },
        name: "Rest {amount}",
        description: "Exhaust: restore {amount} life.",
        activate: (ctx, p) => ctx.issue({ type: "heal", target: ctx.source.controller, amount: amount(p) }),
    }),

    extension("weaken", amountSchema, {
        name: "Weaken {amount}",
        description: "The enemy creature or holding opposite has -{amount} Attack.",
        translations: { de: { name: "Schwächung {amount}", description: "Die gegenüberliegende gegnerische Kreatur oder Besitzung hat -{amount} Angriff." } },
        static: (source, target, p) => source.controller !== target.controller && source.slot !== null && target.zone === "board" && source.slot === target.slot ? { attack: -amount(p) } : {},
    }),

    extension("longshot", amountSchema, {
        name: "Longshot {amount}",
        description: "Exhaust: deal {amount} damage to an enemy creature.",
        translations: { de: { name: "Fernschuss {amount}", description: "Erschöpfe: Füge einer gegnerischen Kreatur {amount} Schaden zu." } },
        target: "enemy-creature",
        activate: (ctx, p) => { if (ctx.target) ctx.issue({ type: "damage", target: ctx.target, amount: amount(p), source: ctx.source.id }); },
    }),
  leaderAbility('fealty', {
    name: 'Fealty',
    description: 'All friendly creatures, including this one, have +1 Attack and +1 Defense.',
    translations: { de: { name: 'Lehnstreue', description: 'Alle eigenen Kreaturen, auch diese, erhalten +1 Angriff und +1 Verteidigung.' } },
    static: (source, target, _params, registry) => source.controller === target.controller && target.zone === 'board' && registry.cards[target.definitionId].type === 'creature' ? { attack: 1, defense: 1 } : {},
  }, 3),
  leaderAbility('accord', {
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
  leaderAbility('marches-rally', {
    name: 'Rally',
    description: 'Exhaust: deploy a creature or holding from your hand to a free position without paying its cost. It enters exhausted.',
    translations: { de: { name: 'Aufgebot', description: 'Erschöpfe: Setze eine Kreatur oder Besitzung aus deiner Hand ohne Kosten auf einen freien Platz ein. Sie kommt erschöpft ins Spiel.' } },
    target: 'friendly-hand-field',
    placement: true,
    activate: ctx => { if (ctx.target && ctx.slot !== undefined) ctx.issue({ type: 'deploy', target: ctx.target, player: ctx.source.controller, slot: ctx.slot }); },
  }),
  leaderAbility('trade', {
    name: 'Trade',
    description: 'When this creature channels during your play phase, it also produces 1 neutral energy.',
    translations: { de: { name: 'Handel', description: 'Wenn diese Kreatur während deiner Spielphase Energie kanalisiert, erzeugt sie zusätzlich 1 neutrale Energie.' } },
    before: { 'energy.generate.before': (_ctx, _params, payload) => ({ ...payload, output: { ...payload.output, neutral: (payload.output?.neutral ?? 0) + 1 } }) },
  }),
  leaderAbility('sanctuary', {
    name: 'Sanctuary',
    description: 'Adjacent friendly creatures have +1 Defense (+2 for Elves).',
    translations: { de: { name: 'Zuflucht', description: 'Benachbarte eigene Kreaturen erhalten +1 Verteidigung (Elfen +2).' } },
    static: (source, target, _params, registry) => {
      const card = registry.cards[target.definitionId];
      return areAdjacent(source, target) && card.type === 'creature' ? { defense: card.subtypes.includes('elf') ? 2 : 1 } : {};
    },
  }, 3),
  extension('scorch', amountSchema, {
    name: 'Scorch {amount}',
    description: 'When played, deal {amount} damage to an enemy creature in range (opposite or in a neighbouring lane) or to the enemy player.',
    translations: { de: { name: 'Versengen {amount}', description: 'Beim Ausspielen: Füge einer gegnerischen Kreatur in Reichweite (gegenüber oder in einer Nachbarbahn) oder dem gegnerischen Spieler {amount} Schaden zu.' } },
    announce: true,
    target: 'enemy-reach',
    hooks: { 'card.played': (ctx, p) => {
      // Entering by other means (Rally, Raise) has no chosen target, so nothing is burned.
      if (ctx.event.cardId !== ctx.source.id || !ctx.target) return;
      ctx.issue({ type: 'damage', target: ctx.target, amount: amount(p), source: ctx.source.id });
    } },
  }, 3),
  leaderAbility('raid', {
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
  leaderAbility('soul-harvest', {
    name: 'Soul Harvest',
    description: 'Whenever another friendly creature is destroyed, draw a card.',
    translations: { de: { name: 'Seelenernte', description: 'Wird eine andere eigene Kreatur zerstört, ziehe eine Karte.' } },
    hooks: { 'creature.destroyed': ctx => {
      if (ctx.event.cardId !== ctx.source.id && ctx.event.snapshot?.controller === ctx.source.controller)
        ctx.issue({ type: 'draw', player: ctx.source.controller, amount: 1 });
    } },
  }),
  leaderAbility('dark-harvest', {
    name: 'Dark Harvest',
    description: 'Exhaust: put the top card of your library into your discard pile and gain 2 Host energy. Needs two cards in your library.',
    translations: { de: { name: 'Dunkle Ernte', description: 'Erschöpfe: Lege die oberste Karte deiner Bibliothek auf den Ablagestapel und erhalte 2 Heerenergie. Benötigt zwei Karten in der Bibliothek.' } },
    canActivate: (source, state) => state.players[source.controller].deck.length > 1,
    activate: ctx => {
      ctx.issue({ type: 'mill', player: ctx.source.controller, amount: 1 });
      ctx.issue({ type: 'gain-energy', player: ctx.source.controller, output: { 'black-host': 2 }, source: ctx.source.id });
    },
  }),
  leaderAbility('wayfarer', {
    name: 'Wayfarer',
    description: 'Exhaust: return a friendly creature (including this one) to its owner’s hand, clearing its damage.',
    translations: { de: { name: 'Weggefährte', description: 'Erschöpfe: Nimm eine eigene Kreatur (auch diese) auf die Hand ihres Besitzers zurück und entferne ihren Schaden.' } },
    target: 'friendly-creature',
    activate: ctx => { if (ctx.target) ctx.issue({ type: 'return', target: ctx.target }); },
  }, 1),

];


    // Inactive reference implementations. Uncomment entries to register them.
    // Ready / Consume / Return use the `empty` schema above.
    // Triggered effects also need `self` and its HookContext type import.
    // ready
    // extension("ready", empty, {
    //     name: "Ready",
    //     description: "Enters the battlefield ready to channel energy or attack.",
    //     before: { "creature.enter.before": (_ctx, _p, payload) => ({ ...payload, exhausted: false }) },
    // }),

    // battlecry
    // extension("battlecry", amountSchema, {
    //     name: "Battlecry {amount}",
    //     description: "When played, deal {amount} damage to an enemy creature, if one is available.",
    //     target: "enemy-creature",
    //     hooks: {
    //         "card.played": (ctx, p) => {
    //             if (self(ctx) && ctx.target)
    //                 ctx.issue({ type: "damage", target: ctx.target, amount: amount(p), source: ctx.source.id });
    //         },
    //     },
    // }),

    // deathbound
    // extension("deathbound", amountSchema, {
    //     name: "Deathbound {amount}",
    //     description: "When this creature is destroyed, draw {amount} from your library.",
    //     hooks: {
    //         "creature.destroyed": (ctx, p) => {
    //             if (self(ctx)) ctx.issue({ type: "draw", player: ctx.source.controller, amount: amount(p) });
    //         },
    //     },
    // }),

    // collector (historical example; Black Host uses soul-harvest)
    // extension("collector", amountSchema, {
    //     name: "Collector {amount}",
    //     description: "When another friendly creature is destroyed, draw {amount} from your library.",
    //     hooks: { "creature.destroyed": (ctx, p) => {
    //         if (!self(ctx) && ctx.event.snapshot?.controller === ctx.source.controller)
    //             ctx.issue({ type: "draw", player: ctx.source.controller, amount: amount(p) });
    //     } },
    // }),

    // return
    // extension("return", empty, {
    //     name: "Return",
    //     description: "Return a friendly creature to its owner's hand.",
    //     target: "friendly-creature",
    //     cast: (ctx) => {
    //         if (ctx.target) ctx.issue({ type: "return", target: ctx.target });
    //     },
    // }),

    // blood-price
    // extension("blood-price", amountSchema, {
    //     name: "Blood Price {amount}",
    //     description: "When played, lose {amount} life.",
    //     hooks: {
    //         "card.played": (ctx, p) => {
    //             if (self(ctx))
    //                 ctx.issue({ type: "damage", target: ctx.source.controller, amount: amount(p), source: ctx.source.id });
    //         },
    //     },
    // }),

    // reckoning
    // extension("reckoning", amountSchema, {
    //     name: "Reckoning {amount}",
    //     description: "Deal {amount} damage to both players.",
    //     cast: (ctx, p) => {
    //         ctx.issue({ type: "damage", target: "p1", amount: amount(p) });
    //         ctx.issue({ type: "damage", target: "p2", amount: amount(p) });
    //     },
    // }),

export { spellAbilities };
const activeExtensions: AbilityExtension[] = [...evergreenAbilities, ...spellAbilities];
export const abilities = Object.fromEntries(activeExtensions.map((a) => [a.id, a]));
