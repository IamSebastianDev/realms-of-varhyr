import * as v from "valibot";
import { defineAbility as extension } from "@realms/extensions/definition";
import {
  areAdjacent,
  battlefieldPositions,
  positionSlot,
  type AbilityExtension,
  type BattlefieldPosition,
} from "@realms/contracts";
const positive = v.pipe(v.number(), v.integer(), v.minValue(1));
const amountSchema = v.object({ amount: positive });
const empty = v.object({});
const chargeSchema = v.object({ amount: positive, position: v.picklist(battlefieldPositions) });
const amount = (params: Record<string, unknown>) => params.amount as number;
/** Abilities as they were when the recorded match was played. They have since been merged, renamed or cut in the live
 * rule set; they live here so that historical recordings keep replaying with the exact same rules. */
export const legacyAbilities: AbilityExtension[] = [
  extension("war-banner", amountSchema, {
    translations: {
      de: {
        name: "Kriegsbanner {amount}",
        description:
          "Deine anderen Kreaturen erhalten +{amount} Angriff, solange diese Karte auf dem Schlachtfeld liegt.",
      },
    },
    name: "War Banner {amount}",
    description:
      "Your other creatures have +{amount} Attack while this card is on the battlefield.",
    static: (source, target, p, registry) =>
      source.id !== target.id &&
      source.controller === target.controller &&
      registry.cards[target.definitionId].type === "creature"
        ? { attack: amount(p) }
        : {},
  }),

  extension("adjacent-banner", amountSchema, {
    translations: {
      de: {
        name: "Formation {amount}",
        description:
          "Benachbarte eigene Kreaturen und Besitzungen erhalten +{amount} Angriff, solange diese Karte auf dem Schlachtfeld liegt. Leere Plätze schließen die Lücke nicht.",
      },
    },
    name: "Formation {amount}",
    description:
      "Adjacent friendly creatures and holdings get +{amount} Attack while this card is on the battlefield. Empty slots do not close the gap.",
    static: (source, target, p) => (areAdjacent(source, target) ? { attack: amount(p) } : {}),
  }),

  extension("flank-evasion", empty, {
    translations: {
      de: {
        name: "Flankenumgehung",
        description:
          "Diese Kreatur kann nicht von Karten auf der linken oder rechten Flanke geblockt werden. Karten auf den Flügeln oder in der Mitte können sie weiterhin blocken.",
      },
    },
    name: "Flank Evasion",
    description:
      "This creature cannot be blocked by cards in Left Flank or Right Flank. Cards in either wing or Center can still block it.",
    canBlock: (source, attacker, blocker) =>
      source.id !== attacker.id || (blocker.slot !== 0 && blocker.slot !== 4),
  }),

  extension("charge", chargeSchema, {
    translations: {
      de: {
        name: "Ansturm {amount} · {position}",
        description:
          "Beim Ausspielen: Füge der gegnerischen Kreatur auf Position {position} {amount} Schaden zu. Ist der Platz leer oder mit einer Besitzung besetzt, entsteht kein Schaden.",
      },
    },
    name: "Charge {amount} · {position}",
    description:
      "When played, deal {amount} damage to the enemy creature in {position}. If that position is empty or holds a holding, deal no damage.",
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

  extension("rally", amountSchema, {
    translations: {
      de: {
        name: "Erholung {amount}",
        description:
          "Erschöpfe diese Karte während deiner Spielphase, um bei dir selbst {amount} Leben wiederherzustellen.",
      },
    },
    name: "Restore {amount}",
    description: "Exhaust during your play phase to restore {amount} life to yourself.",
    activate: (ctx, p) =>
      ctx.issue({ type: "heal", target: ctx.source.controller, amount: amount(p) }),
  }),

  extension("invocation", amountSchema, {
    name: "Invocation {amount}",
    description:
      "Exhaust during your play phase to deal {amount} damage to the enemy creature directly opposite. Requires a creature in that position; cannot target holdings or players.",
    translations: {
      de: {
        name: "Anrufung {amount}",
        description:
          "Erschöpfe diese Karte während deiner Spielphase, um der direkt gegenüberliegenden gegnerischen Kreatur {amount} Schaden zuzufügen. Dort muss eine Kreatur liegen; Besitzungen und Spieler sind keine Ziele.",
      },
    },
    canActivate: (source, state, _p, registry) => {
      if (source.slot === null) return false;
      const id = state.players[source.controller === "p1" ? "p2" : "p1"].board[source.slot];
      return !!id && registry.cards[state.cards[id].definitionId].type === "creature";
    },
    activate: (ctx, p) => {
      if (ctx.source.slot === null) return;
      const id =
        ctx.state.players[ctx.source.controller === "p1" ? "p2" : "p1"].board[ctx.source.slot];
      if (id && ctx.registry.cards[ctx.state.cards[id].definitionId].type === "creature")
        ctx.issue({ type: "damage", target: id, amount: amount(p), source: ctx.source.id });
    },
  }),

  extension("rime", amountSchema, {
    name: "Rime {amount}",
    description:
      "The enemy creature or holding directly opposite has -{amount} Attack, down to zero, while this card remains on the battlefield. Active even while exhausted.",
    translations: {
      de: {
        name: "Raureif {amount}",
        description:
          "Die direkt gegenüberliegende gegnerische Kreatur oder die Besitzung hat -{amount} Angriff, bis auf null, solange diese Karte auf dem Schlachtfeld liegt. Auch im erschöpften Zustand aktiv.",
      },
    },
    static: (source, target, p) =>
      source.controller !== target.controller &&
      source.slot !== null &&
      target.zone === "board" &&
      source.slot === target.slot
        ? { attack: -amount(p) }
        : {},
  }),
];
