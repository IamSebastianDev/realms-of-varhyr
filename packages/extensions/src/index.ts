import * as v from "valibot";
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
const chargeSchema = v.object({ amount: positive, position: v.picklist(battlefieldPositions) });
function extension(
    id: string,
    schema: v.GenericSchema,
    impl: Omit<AbilityExtension, "id" | "version" | "validate">,
): AbilityExtension {
    return {
        id,
        version: 1,
        validate: (p) => {
            v.parse(schema, p);
        },
        ...impl,
    };
}
const amount = (params: Record<string, unknown>) => params.amount as number;
// const self = (ctx: HookContext) => ctx.event.cardId === ctx.source.id;
// Bind these IDs from a card's abilities / cast arrays in data.json.
const activeExtensions: AbilityExtension[] = [
    extension("armor", amountSchema, {
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
        name: "Formation {amount}",
        description:
            "Adjacent friendly creatures and bastions get +{amount} Attack while this card is on the battlefield. Empty slots do not close the gap.",
        static: (source, target, p) => (areAdjacent(source, target) ? { attack: amount(p) } : {}),
    }),
    extension("shield-wall", amountSchema, {
        name: "Shield Wall {amount}",
        description:
            "Adjacent friendly creatures and bastions get +{amount} Defense while this card is on the battlefield. Empty slots do not close the gap.",
        static: (source, target, p) => (areAdjacent(source, target) ? { defense: amount(p) } : {}),
    }),

    extension("flank-evasion", empty, {
        name: "Flank Evasion",
        description:
            "This creature cannot be blocked by cards in Left Flank or Right Flank. Cards in either wing or Center can still block it.",
        canBlock: (source, attacker, blocker) =>
            source.id !== attacker.id || (blocker.slot !== 0 && blocker.slot !== 4),
    }),

    extension("guard", empty, {
        name: "Guard",
        description:
            "Attacks aimed at a lane next to this card are blocked by this card instead, even if that lane is empty. Stops one attacker per combat; the lane's own Guard blocks first.",
        intercepts: (source, _attacker, lane) => source.slot !== null && Math.abs(source.slot - lane) === 1,
    }),

    extension("charge", chargeSchema, {
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
        name: "Damage {amount}",
        description: "Deal {amount} damage to an enemy field card or player.",
        target: "enemy-any",
        cast: (ctx, p) => {
            if (ctx.target) ctx.issue({ type: "damage", target: ctx.target, amount: amount(p), source: ctx.source.id });
        },
    }),

    extension("heal", amountSchema, {
        name: "Heal {amount}",
        description: "Restore {amount} life to yourself.",
        cast: (ctx, p) => ctx.issue({ type: "heal", target: ctx.source.controller, amount: amount(p) }),
    }),

    extension("rally", amountSchema, {
        name: "Rally {amount}",
        description: "Exhaust during your play phase to restore {amount} life to yourself.",
        activate: (ctx, p) => ctx.issue({ type: "heal", target: ctx.source.controller, amount: amount(p) }),
    }),
    extension("draw", amountSchema, {
        name: "Draw {amount}",
        description: "Draw {amount} cards from your library.",
        cast: (ctx, p) => ctx.issue({ type: "draw", player: ctx.source.controller, amount: amount(p) }),
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

    // collector
    // extension("collector", amountSchema, {
    //     name: "Collector {amount}",
    //     description: "When another friendly creature is destroyed, draw {amount} from your library.",
    //     hooks: {
    //         "creature.destroyed": (ctx, p) => {
    //             if (!self(ctx) && ctx.event.snapshot?.controller === ctx.source.controller)
    //                 ctx.issue({ type: "draw", player: ctx.source.controller, amount: amount(p) });
    //         },
    //     },
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
