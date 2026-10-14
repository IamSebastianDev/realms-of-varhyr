import * as v from "valibot";
import { defineAbility as extension } from "./definition";
import { amount, amountSchema, positive } from "./schemas";
import type { AbilityExtension } from "../../contracts/src";
/** `energy` is a faction ID or "neutral"; the content compiler checks it against the registered energy types. */
const channelSchema = v.strictObject({ amount: positive, energy: v.pipe(v.string(), v.minLength(1)) });
const raiseSchema = v.strictObject({ subtype: v.pipe(v.string(), v.minLength(1)) });

/** Abilities that resolve when a spell is cast. They belong to no faction, so any faction's spells can use them. */
export const spellAbilities: AbilityExtension[] = [
    extension("damage", amountSchema, {
        translations: { de: {"name": "Schaden {amount}", "description": "Füge einer gegnerischen Feldkarte oder einem Spieler {amount} Schaden zu."} },
        name: "Damage {amount}",
        description: "Deal {amount} damage to an enemy field card or player.",
        target: "enemy-any",
        cast: (ctx, p) => {
            if (ctx.target) ctx.issue({ type: "damage", target: ctx.target, amount: amount(p), source: ctx.source.id });
        },
    }),

    extension("destroy", v.strictObject({}), {
        translations: { de: { name: "Vernichten", description: "Zerstöre eine gegnerische Kreatur." } },
        name: "Destroy",
        description: "Destroy target enemy creature.",
        target: "enemy-creature",
        cast: ctx => { if (ctx.target) ctx.issue({ type: "destroy", target: ctx.target }); },
    }),

    extension("rage", amountSchema, {
        translations: { de: { name: "Wut {amount}", description: "Eine eigene Kreatur erhält bis zum Ende des Zuges +{amount} Angriff." } },
        name: "Rage {amount}",
        description: "Target friendly creature gets +{amount} Attack until end of turn.",
        target: "friendly-creature",
        cast: (ctx, p) => { if (ctx.target) ctx.issue({ type: "boost", target: ctx.target, attack: amount(p), source: ctx.source.id }); },
    }),

    extension("steadfast", amountSchema, {
        translations: { de: { name: "Standhaft {amount}", description: "Eine eigene Kreatur erhält bis zum Ende des Zuges +{amount} Verteidigung." } },
        name: "Steadfast {amount}",
        description: "Target friendly creature gets +{amount} Defense until end of turn.",
        target: "friendly-creature",
        cast: (ctx, p) => { if (ctx.target) ctx.issue({ type: "boost", target: ctx.target, defense: amount(p), source: ctx.source.id }); },
    }),

    extension("barrage", amountSchema, {
        translations: { de: { name: "Sperrfeuer {amount}", description: "Füge jeder gegnerischen Kreatur {amount} Schaden zu. Besitzungen und Spieler sind nicht betroffen." } },
        name: "Barrage {amount}",
        description: "Deal {amount} damage to each enemy creature. Holdings and players are not affected.",
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

    extension("draw", amountSchema, {
        translations: { de: {"name": "Ziehen {amount}", "description": "Ziehe {amount} Karten aus deiner Bibliothek."} },
        name: "Draw {amount}",
        description: "Draw {amount} cards from your library.",
        cast: (ctx, p) => ctx.issue({ type: "draw", player: ctx.source.controller, amount: amount(p) }),
    }),

    extension("channel", channelSchema, {
        name: "Channel {amount} {energy}",
        description: "Gain {amount} {energy} energy in your current casting-phase pool. It pays that faction’s costs (neutral energy pays only generic costs) and expires with that pool.",
        translations: { de: { name: "Kanalisieren: {amount} {energy}", description: "Erhalte {amount} Energie ({energy}) im Energievorrat deiner aktuellen Zauberphase. Sie bezahlt die Kosten dieser Fraktion (neutrale Energie nur allgemeine Kosten) und verfällt mit diesem Vorrat." } },
        cast: (ctx, p) => ctx.issue({ type: "gain-energy", player: ctx.source.controller, output: { [p.energy as string]: amount(p) }, source: ctx.source.id }),
    }),

    extension("raise", raiseSchema, {
        translations: { de: { name: "Erwecken: {subtype}", description: "Wähle eine Kreatur der Art {subtype} aus deinem Ablagestapel und bringe sie auf eine freie Position deines Schlachtfelds. Sie kommt bereit ins Spiel." } },
        name: "Raise {subtype}",
        description: "Choose a {subtype} creature in your discard pile and return it to a free position on your battlefield. It enters ready.",
        target: "friendly-discard-creature",
        placement: true,
        cast: (ctx, p) => {
            if (ctx.target && ctx.slot !== undefined) ctx.issue({ type: "deploy", target: ctx.target, player: ctx.source.controller, slot: ctx.slot, ready: true });
        },
    }),
];
