import { defineAbility as extension } from "./definition";
import { signatureAbilities } from "./signatureAbilities";
import { spellAbilities } from "./spellAbilities";
import { amount, amountSchema } from "./schemas";
import * as v from "valibot";
import { areAdjacent, type AbilityExtension } from "../../contracts/src";
import { positive } from "./schemas";
/** `subtype` is a freeform creature subtype such as archer; it is matched against each card's subtypes. */
const empty = v.object({});
const drillSchema = v.strictObject({ amount: positive, subtype: v.pipe(v.string(), v.minLength(1)) });

/** Evergreen keywords: scalable vocabulary on the card itself, usable by any faction. */
export const evergreenAbilities: AbilityExtension[] = [
    extension("primal", amountSchema, {
        name: "Primal {amount}",
        description: "Exhaust during your play phase: choose a faction and gain {amount} energy of that faction.",
        translations: { de: { name: "Urkraft {amount}", description: "Erschöpfe diese Kreatur während deiner Spielphase: Wähle eine Fraktion und erhalte {amount} Energie dieser Fraktion." } },
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
        translations: { de: {"name": "Banner {amount}", "description": "Benachbarte eigene Kreaturen und Besitzungen erhalten +{amount} Angriff, solange diese Karte auf dem Schlachtfeld liegt. Leere Plätze schließen die Lücke nicht."} },
        name: "Banner {amount}",
        description:
            "Adjacent friendly creatures and holdings get +{amount} Attack while this card is on the battlefield. Empty slots do not close the gap.",
        static: (source, target, p) => (areAdjacent(source, target) ? { attack: amount(p) } : {}),
    }),

    extension("drillmaster", drillSchema, {
        translations: { de: { name: "Drillmeister {amount}", description: "Benachbarte eigene Kreaturen vom Typ {subtype} erhalten +{amount} Angriff, solange diese Karte auf dem Schlachtfeld liegt. Leere Plätze schließen die Lücke nicht." } },
        name: "Drillmaster {amount}",
        description: "Adjacent friendly {subtype} creatures have +{amount} Attack while this card is on the battlefield. Empty slots do not close the gap.",
        static: (source, target, p, registry) =>
            areAdjacent(source, target) && registry.cards[target.definitionId].type === "creature" && registry.cards[target.definitionId].subtypes.includes(p.subtype as string)
                ? { attack: amount(p) }
                : {},
    }),

    extension("shield-wall", amountSchema, {
        translations: { de: {"name": "Schildwall {amount}", "description": "Benachbarte eigene Kreaturen und Besitzungen erhalten +{amount} Verteidigung, solange diese Karte auf dem Schlachtfeld liegt. Leere Plätze schließen die Lücke nicht."} },
        name: "Shield Wall {amount}",
        description:
            "Adjacent friendly creatures and holdings get +{amount} Defense while this card is on the battlefield. Empty slots do not close the gap.",
        static: (source, target, p) => (areAdjacent(source, target) ? { defense: amount(p) } : {}),
    }),

    extension("guard", empty, {
        translations: { de: {"name": "Wache", "description": "Diese Karte blockt Angriffe auf eine benachbarte Bahn, selbst wenn die Bahn leer ist. Stoppt einen Angreifer pro Kampf; die Wache in der Zielbahn blockt zuerst."} },
        name: "Guard",
        description:
            "Attacks aimed at a lane next to this card are blocked by this card instead, even if that lane is empty. Stops one attacker per combat; the lane's own Guard blocks first.",
        intercepts: (source, _attacker, lane) => source.slot !== null && Math.abs(source.slot - lane) === 1,
    }),

    extension("charge", v.strictObject({ amount: positive }), {
        translations: { de: {"name": "Ansturm {amount}", "description": "Beim Ausspielen: Füge der gegnerischen Kreatur direkt gegenüber {amount} Schaden zu. Ist der Platz leer oder mit einer Besitzung besetzt, entsteht kein Schaden."} },
        name: "Charge {amount}",
        description:
            "When played, deal {amount} damage to the enemy creature directly opposite. If that position is empty or holds a holding, deal no damage.",
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
        translations: { de: {"name": "Rast {amount}", "description": "Erschöpfe diese Karte während deiner Spielphase, um bei dir selbst {amount} Leben wiederherzustellen."} },
        name: "Rest {amount}",
        description: "Exhaust during your play phase to restore {amount} life to yourself.",
        activate: (ctx, p) => ctx.issue({ type: "heal", target: ctx.source.controller, amount: amount(p) }),
    }),

    extension("weaken", amountSchema, {
        name: "Weaken {amount}",
        description: "The enemy creature or holding directly opposite has -{amount} Attack, down to zero, while this card remains on the battlefield. Active even while exhausted.",
        translations: { de: { name: "Schwächung {amount}", description: "Die direkt gegenüberliegende gegnerische Kreatur oder die Besitzung hat -{amount} Angriff, bis auf null, solange diese Karte auf dem Schlachtfeld liegt. Auch im erschöpften Zustand aktiv." } },
        static: (source, target, p) => source.controller !== target.controller && source.slot !== null && target.zone === "board" && source.slot === target.slot ? { attack: -amount(p) } : {},
    }),

    extension("longshot", amountSchema, {
        name: "Longshot {amount}",
        description: "Exhaust during your play phase to deal {amount} damage to any enemy creature. Cannot target holdings or players.",
        translations: { de: { name: "Fernschuss {amount}", description: "Erschöpfe diese Karte während deiner Spielphase, um einer beliebigen gegnerischen Kreatur {amount} Schaden zuzufügen. Besitzungen und Spieler sind keine Ziele." } },
        target: "enemy-creature",
        activate: (ctx, p) => { if (ctx.target) ctx.issue({ type: "damage", target: ctx.target, amount: amount(p), source: ctx.source.id }); },
    }),
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

    // consume
    // extension("consume", empty, {
    //     name: "Consume",
    //     description: "Sacrifice a friendly creature as an additional cost to play this card.",
    //     before: { "card.play.before": (_ctx, _p, payload) => ({ ...payload, consume: true }) },
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

    // collector (generic historical example; Black Host now uses faction-exclusive soul-harvest)
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

export { signatureAbilities, spellAbilities };
const activeExtensions: AbilityExtension[] = [...signatureAbilities, ...evergreenAbilities, ...spellAbilities];
export const abilities = Object.fromEntries(activeExtensions.map((a) => [a.id, a]));
