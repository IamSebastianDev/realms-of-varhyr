// Regression fixtures for inactive ability examples. Never imported by the app.
import * as v from "valibot";
import type { AbilityExtension, HookContext } from "@realms/contracts";
const positive = v.pipe(v.number(), v.integer(), v.minValue(1));
const amountSchema = v.object({ amount: positive });
const empty = v.object({});
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
const n = (params: Record<string, unknown>) => params.amount as number;
const self = (ctx: HookContext) => ctx.event.cardId === ctx.source.id;
const all: AbilityExtension[] = [
  extension("ready", empty, {
    name: "Ready",
    description: "Enters the battlefield ready to channel energy or attack.",
    before: { "creature.enter.before": (_ctx, _p, payload) => ({ ...payload, exhausted: false }) },
  }),
  extension("consume", empty, {
    name: "Consume",
    description: "Sacrifice a friendly creature as an additional cost to play this card.",
    before: { "card.play.before": (_ctx, _p, payload) => ({ ...payload, consume: true }) },
  }),
  extension("armor", amountSchema, {
    name: "Armor {amount}",
    description: "Reduce each incoming damage hit by {amount}, down to zero.",
    before: {
      "damage.before": (_ctx, p, payload) => ({
        ...payload,
        amount: Math.max(0, (payload.amount ?? 0) - n(p)),
      }),
    },
  }),
  extension("battlecry", amountSchema, {
    name: "Battlecry {amount}",
    description: "When played, deal {amount} damage to an enemy creature, if one is available.",
    target: "enemy-creature",
    hooks: {
      "card.played": (ctx, p) => {
        if (self(ctx) && ctx.target)
          ctx.issue({ type: "damage", target: ctx.target, amount: n(p), source: ctx.source.id });
      },
    },
  }),
  extension("deathbound", amountSchema, {
    name: "Deathbound {amount}",
    description: "When this creature is destroyed, draw {amount} from your library.",
    hooks: {
      "creature.destroyed": (ctx, p) => {
        if (self(ctx)) ctx.issue({ type: "draw", player: ctx.source.controller, amount: n(p) });
      },
    },
  }),
  extension("collector", amountSchema, {
    name: "Collector {amount}",
    description: "When another friendly creature is destroyed, draw {amount} from your library.",
    hooks: {
      "creature.destroyed": (ctx, p) => {
        if (!self(ctx) && ctx.event.snapshot?.controller === ctx.source.controller)
          ctx.issue({ type: "draw", player: ctx.source.controller, amount: n(p) });
      },
    },
  }),
  extension("war-banner", amountSchema, {
    name: "War Banner {amount}",
    description:
      "Your other creatures have +{amount} Attack while this creature is on the battlefield.",
    static: (source, target, p) =>
      source.id !== target.id && source.controller === target.controller ? { attack: n(p) } : {},
  }),
  extension("damage", amountSchema, {
    name: "Damage {amount}",
    description: "Deal {amount} damage to an enemy creature or player.",
    target: "enemy-any",
    cast: (ctx, p) => {
      if (ctx.target)
        ctx.issue({ type: "damage", target: ctx.target, amount: n(p), source: ctx.source.id });
    },
  }),
  extension("heal", amountSchema, {
    name: "Heal {amount}",
    description: "Restore {amount} life to yourself.",
    cast: (ctx, p) => ctx.issue({ type: "heal", target: ctx.source.controller, amount: n(p) }),
  }),
  extension("draw", amountSchema, {
    name: "Draw {amount}",
    description: "Draw {amount} from your library.",
    cast: (ctx, p) => ctx.issue({ type: "draw", player: ctx.source.controller, amount: n(p) }),
  }),
  extension("blood-price", amountSchema, {
    name: "Blood Price {amount}",
    description: "When played, lose {amount} life.",
    hooks: {
      "card.played": (ctx, p) => {
        if (self(ctx))
          ctx.issue({
            type: "damage",
            target: ctx.source.controller,
            amount: n(p),
            source: ctx.source.id,
          });
      },
    },
  }),
  extension("reckoning", amountSchema, {
    name: "Reckoning {amount}",
    description: "Deal {amount} damage to both players.",
    cast: (ctx, p) => {
      ctx.issue({ type: "damage", target: "p1", amount: n(p) });
      ctx.issue({ type: "damage", target: "p2", amount: n(p) });
    },
  }),
];
export const referenceAbilities = Object.fromEntries(all.map((a) => [a.id, a]));
