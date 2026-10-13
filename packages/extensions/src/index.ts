import * as v from "valibot";
import { defineAbility as extension } from "./definition";
import { signatureAbilities } from "./signatureAbilities";
import {
    areAdjacent,
    battlefieldPositions,
    positionSlot,
    type AbilityExtension,
    type BattlefieldPosition,
} from "../../contracts/src";
const positive = v.pipe(v.number(), v.integer(), v.minValue(1));
const amountSchema = v.object({ amount: positive });
const empty = v.object({});
/** `energy` is a faction ID or "neutral"; the content compiler checks it against the registered energy types. */
const channelSchema = v.strictObject({ amount: positive, energy: v.pipe(v.string(), v.minLength(1)) });
/** `subtype` is a freeform creature subtype such as archer; it is matched against each card's subtypes. */
const drillSchema = v.strictObject({ amount: positive, subtype: v.pipe(v.string(), v.minLength(1)) });
const chargeSchema = v.object({ amount: positive, position: v.picklist(battlefieldPositions) });
const amount = (params: Record<string, unknown>) => params.amount as number;
// const self = (ctx: HookContext) => ctx.event.cardId === ctx.source.id;
// Bind these IDs from a card's abilities / cast arrays in data.json.
const activeExtensions: AbilityExtension[] = [
    ...signatureAbilities,
    extension("primal", v.strictObject({}), {
        name: "Primal",
        description: "Exhaust during your play phase: choose a faction and gain 1 energy of that faction.",
        translations: { de: { name: "Urkraft", description: "Erschöpfe diese Kreatur während deiner Spielphase: Wähle eine Fraktion und erhalte 1 Energie dieser Fraktion." } },
        target: "energy-type",
        activationEnergy: (_params, registry) => registry.energyTypes.filter(color => color !== "neutral").map(color => ({ [color]: 1 })),
        activate: ctx => ctx.issue({ type: "gain-energy", player: ctx.source.controller, output: { [ctx.target!]: 1 }, source: ctx.source.id }),
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

    extension("war-banner", amountSchema, {
        translations: { de: {"name": "Kriegsbanner {amount}", "description": "Deine anderen Kreaturen erhalten +{amount} Angriff, solange diese Karte auf dem Schlachtfeld liegt."} },
        name: "War Banner {amount}",
        description: "Your other creatures have +{amount} Attack while this card is on the battlefield.",
        static: (source, target, p, registry) =>
            source.id !== target.id &&
            source.controller === target.controller &&
            registry.cards[target.definitionId].type === "creature"
                ? { attack: amount(p) }
                : {},
    }),

    extension("adjacent-banner", amountSchema, {
        translations: { de: {"name": "Formation {amount}", "description": "Benachbarte eigene Kreaturen und Bastionen erhalten +{amount} Angriff, solange diese Karte auf dem Schlachtfeld liegt. Leere Plätze schließen die Lücke nicht."} },
        name: "Formation {amount}",
        description:
            "Adjacent friendly creatures and bastions get +{amount} Attack while this card is on the battlefield. Empty slots do not close the gap.",
        static: (source, target, p) => (areAdjacent(source, target) ? { attack: amount(p) } : {}),
    }),
    extension("shoulder-to-shoulder", empty, {
        translations: { de: { name: "Schulter an Schulter", description: "Diese Karte erhält +1 Angriff, solange links und rechts von ihr je eine eigene Kreatur oder Bastion steht. Auf den äußeren Plätzen ist das nie erfüllt." } },
        name: "Shoulder to Shoulder",
        description: "This card has +1 Attack while a friendly creature or bastion stands in both the slot to its left and the slot to its right. It never applies on a flank.",
        static: (source, target, _p, _registry, state) => {
            if (source.id !== target.id || !state || source.slot === null) return {};
            const row = state.players[source.controller].board;
            return row[source.slot - 1] && row[source.slot + 1] ? { attack: 1 } : {};
        },
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
        translations: { de: {"name": "Schildwall {amount}", "description": "Benachbarte eigene Kreaturen und Bastionen erhalten +{amount} Verteidigung, solange diese Karte auf dem Schlachtfeld liegt. Leere Plätze schließen die Lücke nicht."} },
        name: "Shield Wall {amount}",
        description:
            "Adjacent friendly creatures and bastions get +{amount} Defense while this card is on the battlefield. Empty slots do not close the gap.",
        static: (source, target, p) => (areAdjacent(source, target) ? { defense: amount(p) } : {}),
    }),

    extension("flank-evasion", empty, {
        translations: { de: {"name": "Flankenumgehung", "description": "Diese Kreatur kann nicht von Karten auf der linken oder rechten Flanke geblockt werden. Karten auf den Flügeln oder in der Mitte können sie weiterhin blocken."} },
        name: "Flank Evasion",
        description:
            "This creature cannot be blocked by cards in Left Flank or Right Flank. Cards in either wing or Center can still block it.",
        canBlock: (source, attacker, blocker) =>
            source.id !== attacker.id || (blocker.slot !== 0 && blocker.slot !== 4),
    }),

    extension("guard", empty, {
        translations: { de: {"name": "Wache", "description": "Diese Karte blockt Angriffe auf eine benachbarte Bahn, selbst wenn die Bahn leer ist. Stoppt einen Angreifer pro Kampf; die Wache in der Zielbahn blockt zuerst."} },
        name: "Guard",
        description:
            "Attacks aimed at a lane next to this card are blocked by this card instead, even if that lane is empty. Stops one attacker per combat; the lane's own Guard blocks first.",
        intercepts: (source, _attacker, lane) => source.slot !== null && Math.abs(source.slot - lane) === 1,
    }),

    extension("charge", chargeSchema, {
        translations: { de: {"name": "Ansturm {amount} · {position}", "description": "Beim Ausspielen: Füge der gegnerischen Kreatur auf Position {position} {amount} Schaden zu. Ist der Platz leer oder mit einer Bastion besetzt, entsteht kein Schaden."} },
        name: "Charge {amount} · {position}",
        description:
            "When played, deal {amount} damage to the enemy creature in {position}. If that position is empty or holds a bastion, deal no damage.",
        hooks: {
            "card.played": (ctx, p) => {
                if (ctx.event.cardId !== ctx.source.id) return;
                const enemy = ctx.source.controller === "p1" ? "p2" : "p1";
                const id = ctx.state.players[enemy].board[positionSlot(p.position as BattlefieldPosition)];
                if (id && ctx.registry.cards[ctx.state.cards[id].definitionId].type === "creature")
                    ctx.issue({ type: "damage", target: id, amount: amount(p), source: ctx.source.id });
            },
        },
    }),

    extension("damage", amountSchema, {
        translations: { de: {"name": "Schaden {amount}", "description": "Füge einer gegnerischen Feldkarte oder einem Spieler {amount} Schaden zu."} },
        name: "Damage {amount}",
        description: "Deal {amount} damage to an enemy field card or player.",
        target: "enemy-any",
        cast: (ctx, p) => {
            if (ctx.target) ctx.issue({ type: "damage", target: ctx.target, amount: amount(p), source: ctx.source.id });
        },
    }),

    extension("barrage", amountSchema, {
        translations: { de: { name: "Sperrfeuer {amount}", description: "Füge jeder gegnerischen Kreatur {amount} Schaden zu. Bastionen und Spieler sind nicht betroffen." } },
        name: "Barrage {amount}",
        description: "Deal {amount} damage to each enemy creature. Bastions and players are not affected.",
        cast: (ctx, p) => {
            const enemy = ctx.source.controller === "p1" ? "p2" : "p1";
            for (const id of ctx.state.players[enemy].board)
                if (id && ctx.registry.cards[ctx.state.cards[id].definitionId].type === "creature")
                    ctx.issue({ type: "damage", target: id, amount: amount(p), source: ctx.source.id });
        },
    }),

    extension("heal", amountSchema, {
        translations: { de: {"name": "Heilung {amount}", "description": "Stelle bei dir selbst {amount} Leben wieder her."} },
        name: "Heal {amount}",
        description: "Restore {amount} life to yourself.",
        cast: (ctx, p) => ctx.issue({ type: "heal", target: ctx.source.controller, amount: amount(p) }),
    }),

    extension("rally", amountSchema, {
        translations: { de: {"name": "Erholung {amount}", "description": "Erschöpfe diese Karte während deiner Spielphase, um bei dir selbst {amount} Leben wiederherzustellen."} },
        name: "Restore {amount}",
        description: "Exhaust during your play phase to restore {amount} life to yourself.",
        activate: (ctx, p) => ctx.issue({ type: "heal", target: ctx.source.controller, amount: amount(p) }),
    }),
    extension("draw", amountSchema, {
        translations: { de: {"name": "Ziehen {amount}", "description": "Ziehe {amount} Karten aus deiner Bibliothek."} },
        name: "Draw {amount}",
        description: "Draw {amount} cards from your library.",
        cast: (ctx, p) => ctx.issue({ type: "draw", player: ctx.source.controller, amount: amount(p) }),
    }),

    extension("rime", amountSchema, {
        name: "Rime {amount}",
        description: "The enemy creature or bastion directly opposite has -{amount} Attack, down to zero, while this card remains on the battlefield. Active even while exhausted.",
        translations: { de: { name: "Raureif {amount}", description: "Die direkt gegenüberliegende gegnerische Kreatur oder Bastion hat -{amount} Angriff, bis auf null, solange diese Karte auf dem Schlachtfeld liegt. Auch im erschöpften Zustand aktiv." } },
        static: (source, target, p) => source.controller !== target.controller && source.slot !== null && target.zone === "board" && source.slot === target.slot ? { attack: -amount(p) } : {},
    }),
    extension("invocation", amountSchema, {
        name: "Invocation {amount}",
        description: "Exhaust during your play phase to deal {amount} damage to the enemy creature directly opposite. Requires a creature in that position; cannot target bastions or players.",
        translations: { de: { name: "Anrufung {amount}", description: "Erschöpfe diese Karte während deiner Spielphase, um der direkt gegenüberliegenden gegnerischen Kreatur {amount} Schaden zuzufügen. Dort muss eine Kreatur liegen; Bastionen und Spieler sind keine Ziele." } },
        canActivate: (source, state, _p, registry) => {
            if (source.slot === null) return false;
            const id = state.players[source.controller === "p1" ? "p2" : "p1"].board[source.slot];
            return !!id && registry.cards[state.cards[id].definitionId].type === "creature";
        },
        activate: (ctx, p) => {
            if (ctx.source.slot === null) return;
            const id = ctx.state.players[ctx.source.controller === "p1" ? "p2" : "p1"].board[ctx.source.slot];
            if (id && ctx.registry.cards[ctx.state.cards[id].definitionId].type === "creature")
                ctx.issue({ type: "damage", target: id, amount: amount(p), source: ctx.source.id });
        },
    }),
    extension("longshot", amountSchema, {
        name: "Longshot {amount}",
        description: "Exhaust during your play phase to deal {amount} damage to any enemy creature. Cannot target bastions or players.",
        translations: { de: { name: "Fernschuss {amount}", description: "Erschöpfe diese Karte während deiner Spielphase, um einer beliebigen gegnerischen Kreatur {amount} Schaden zuzufügen. Bastionen und Spieler sind keine Ziele." } },
        target: "enemy-creature",
        activate: (ctx, p) => { if (ctx.target) ctx.issue({ type: "damage", target: ctx.target, amount: amount(p), source: ctx.source.id }); },
    }),
    extension("channel", channelSchema, {
        name: "Channel {amount} {energy}",
        description: "Gain {amount} {energy} energy in your current casting-phase pool. It pays that faction’s costs (neutral energy pays only generic costs) and expires with that pool.",
        translations: { de: { name: "Kanalisieren: {amount} {energy}", description: "Erhalte {amount} Energie ({energy}) im Energievorrat deiner aktuellen Zauberphase. Sie bezahlt die Kosten dieser Fraktion (neutrale Energie nur allgemeine Kosten) und verfällt mit diesem Vorrat." } },
        cast: (ctx, p) => ctx.issue({ type: "gain-energy", player: ctx.source.controller, output: { [p.energy as string]: amount(p) }, source: ctx.source.id }),
    }),

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
];
export const abilities = Object.fromEntries(activeExtensions.map((a) => [a.id, a]));
