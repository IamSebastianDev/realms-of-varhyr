import * as v from "valibot";
import { defineAbility as extension } from "./definition";
import { amountSchema, positive } from "./schemas";
import {
  boost,
  chosen,
  damage,
  deployChosen,
  destroy,
  draw as drawCards,
  enemyCreatures,
  gainEnergy,
  heal,
  param,
  returnToHand,
  run,
  whenPlayed,
  you,
} from "./blocks";
import type { AbilityExtension } from "@realms/contracts";
/** `energy` is a faction ID or "neutral"; the content compiler checks it against the registered energy types. */
const channelSchema = v.strictObject({
  amount: positive,
  energy: v.pipe(v.string(), v.minLength(1)),
});
const raiseSchema = v.strictObject({ subtype: v.pipe(v.string(), v.minLength(1)) });
/** `type` lists what may be destroyed: ["creature"], ["holding"] or ["creature", "holding"]. Left out, it means creatures. */
const destroySchema = v.strictObject({
  type: v.optional(
    v.pipe(v.array(v.picklist(["creature", "holding"])), v.minLength(1), v.maxLength(2)),
  ),
});
/** `target` lists whose creatures may be returned: ["friendly"], ["enemy"] or both. Left out, it means both. */
const recallSchema = v.strictObject({
  target: v.optional(
    v.pipe(v.array(v.picklist(["friendly", "enemy"])), v.minLength(1), v.maxLength(2)),
  ),
});
const recallSides = (params: Record<string, unknown>) =>
  (params.target as ("friendly" | "enemy")[] | undefined) ?? ["friendly", "enemy"];
/** What Channel gives: `amount` of the chosen energy type. */
const channelOutput = (params: Record<string, unknown>) => ({
  [params.energy as string]: params.amount as number,
});
const destroyTypes = (params: Record<string, unknown>) =>
  (params.type as string[] | undefined) ?? ["creature"];

/** Abilities that resolve when a spell is cast. They belong to no faction, so any faction's spells can use them. */
export const spellAbilities: AbilityExtension[] = [
  extension("damage", amountSchema, {
    translations: {
      de: {
        name: "Schaden {amount}",
        description: "Füge einer gegnerischen Feldkarte oder einem Spieler {amount} Schaden zu.",
      },
    },
    name: "Damage {amount}",
    description: "Deal {amount} damage to an enemy field card or player.",
    target: "enemy-any",
    cast: run(damage(chosen, param<number>("amount"))),
  }),

  extension("destroy", destroySchema, {
    translations: {
      de: { description: "Zerstöre eine gegnerische {type}." },
    },
    description: "Destroy target enemy {type}.",
    // Cards written before `type` existed destroy creatures only.
    defaults: { type: ["creature"] },
    // Any enemy board card may be offered; the filter keeps only the chosen types.
    target: "enemy-field",
    targetFilter: (card, p) => destroyTypes(p).includes(card.type),
    cast: run(destroy(chosen)),
  }),

  extension("plague", v.strictObject({}), {
    translations: { de: { description: "Zerstöre jede gegnerische Kreatur." } },
    description: "Destroy each enemy creature.",
    cast: run(destroy(enemyCreatures)),
  }),

  extension("rage", amountSchema, {
    translations: {
      de: {
        name: "Wut {amount}",
        description: "Eine eigene Kreatur erhält bis zum Ende des Zuges +{amount} Angriff.",
      },
    },
    name: "Rage {amount}",
    description: "Target friendly creature gets +{amount} Attack until end of turn.",
    target: "friendly-creature",
    cast: run(boost(chosen, { attack: param<number>("amount") })),
  }),

  extension("steadfast", amountSchema, {
    translations: {
      de: {
        description: "Eine eigene Kreatur erhält bis zum Ende des Zuges +{amount} Verteidigung.",
      },
    },
    description: "Target friendly creature gets +{amount} Defense until end of turn.",
    target: "friendly-creature",
    cast: run(boost(chosen, { defense: param<number>("amount") })),
  }),

  extension("barrage", amountSchema, {
    translations: {
      de: {
        description: "Füge jeder gegnerischen Kreatur {amount} Schaden zu.",
      },
    },
    description: "Deal {amount} damage to each enemy creature.",
    cast: run(damage(enemyCreatures, param<number>("amount"))),
  }),

  extension("heal", amountSchema, {
    translations: {
      de: {
        description: "Stelle bei dir selbst {amount} Leben wieder her.",
      },
    },
    description: "Restore {amount} life to yourself.",
    cast: run(heal(you, param<number>("amount"))),
  }),

  extension("draw", amountSchema, {
    translations: {
      de: {
        name: "Ziehen {amount}",
        description: "Ziehe {amount} Karten aus deiner Bibliothek.",
        fieldDescription: "Beim Ausspielen: Ziehe {amount} Karten aus deiner Bibliothek.",
      },
    },
    name: "Draw {amount}",
    description: "Draw {amount} cards from your library.",
    // On a creature or holding the same effect happens when it is played, like Muster and Charge.
    fieldDescription: "When played, draw {amount} cards from your library.",
    hooks: whenPlayed(drawCards(param<number>("amount"))),
    cast: run(drawCards(param<number>("amount"))),
  }),

  extension("recall", recallSchema, {
    translations: {
      de: {
        description: "Nimm eine {target} Kreatur auf die Hand ihres Besitzers zurück.",
        fieldDescription:
          "Beim Ausspielen: Nimm eine {target} Kreatur auf die Hand ihres Besitzers zurück.",
      },
    },
    description: "Return target {target} creature to its owner's hand.",
    // On a creature the same effect happens when it is played. Entering by other means (Rally, Raise) has no chosen target.
    fieldDescription: "When played, return target {target} creature to its owner's hand.",
    announce: true,
    defaults: { target: ["friendly", "enemy"] },
    target: "any-creature",
    targetSides: recallSides,
    hooks: whenPlayed(returnToHand(chosen)),
    cast: run(returnToHand(chosen)),
  }),

  extension("channel", channelSchema, {
    translations: {
      de: {
        description: "Erhalte {amount} Energie ({energy}) für diese Zauberphase.",
        fieldDescription: "Erschöpfen: Erhalte {amount} Energie ({energy}) für diese Zauberphase.",
      },
    },
    description: "Gain {amount} {energy} energy for this casting phase.",
    // On a creature or holding it is an activated ability: exhaust it to get the energy.
    fieldDescription: "Exhaust: gain {amount} {energy} energy for this casting phase.",
    cast: run(gainEnergy(channelOutput)),
    activate: run(gainEnergy(channelOutput)),
  }),

  extension("raise", raiseSchema, {
    translations: {
      de: {
        description:
          "Bringe eine Kreatur der Art {subtype} aus deinem Ablagestapel auf eine freie Position. Sie kommt bereit ins Spiel.",
      },
    },
    description:
      "Return a {subtype} creature from your discard pile to a free position. It enters ready.",
    target: "friendly-discard-creature",
    placement: true,
    cast: run(deployChosen({ ready: true })),
  }),
];
