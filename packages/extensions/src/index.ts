import { defineAbility as extension } from "./definition";
import { spellAbilities } from "./spellAbilities";
import { amount, amountSchema } from "./schemas";
import * as v from "valibot";
import type { AbilityExtension } from "@realms/contracts";
import { positive } from "./schemas";
import {
  activatableWhen,
  addEnergy,
  adjacent,
  adjacentCreatures,
  and,
  byYou,
  chosen,
  damage,
  deployChosen,
  destroy,
  duringYourPlayPhase,
  entersReady,
  firstThisTurn,
  gainEnergy,
  gainEnergyOfChosen,
  gainEnergyOfTypes,
  guardsAdjacentLanes,
  heal,
  libraryHasAtLeast,
  mill,
  modifiers,
  modify,
  not,
  opposite,
  oppositeCreature,
  param,
  ransack,
  reduceDamage,
  replacing,
  requireSacrifice,
  returnToHand,
  run,
  sameController,
  searchLibrary,
  searchLibraryForSubtype,
  sourceOnFlank,
  targetHasSubtype,
  targetIsCreature,
  targetIsSource,
  targetOnBoard,
  unblockable,
  when,
  whenFriendlyDies,
  whenPlayed,
  you,
} from "./blocks";
/** `subtype` is a freeform creature subtype such as archer; it is matched against each card's subtypes. */
const empty = v.object({});
/** `card` is a card ID; the content compiler checks that it exists. */
const musterSchema = v.strictObject({ card: v.pipe(v.string(), v.minLength(1)) });
/** Fixed-rule keywords without parameters, mostly carried by faction leaders. Resolved effects are announced on the triggering event. */
function leaderAbility(
  id: string,
  impl: Omit<AbilityExtension, "id" | "version" | "validate">,
  version = 2,
): AbilityExtension {
  return extension(id, empty, { ...impl, announce: true }, version);
}
const drillSchema = v.strictObject({
  amount: positive,
  subtype: v.pipe(v.string(), v.minLength(1)),
});

/** Evergreen keywords: scalable vocabulary on the card itself, usable by any faction. */
export const evergreenAbilities: AbilityExtension[] = [
  extension("primal", amountSchema, {
    description: "Exhaust: choose a faction and gain {amount} energy of that faction.",
    translations: {
      de: {
        description: "Erschöpfe: Wähle eine Fraktion und erhalte {amount} Energie dieser Fraktion.",
      },
    },
    target: "energy-type",
    activationEnergy: (params, registry) =>
      registry.energyTypes
        .filter((color) => color !== "neutral")
        .map((color) => ({ [color]: amount(params) })),
    activate: run(gainEnergyOfChosen(param<number>("amount"))),
  }),

  extension("armor", amountSchema, {
    translations: {
      de: {
        name: "Rüstung {amount}",
        description: "Verringere jeden erlittenen Schaden um {amount}, bis auf null.",
      },
    },
    name: "Armor {amount}",
    description: "Reduce each incoming damage hit by {amount}, down to zero.",
    before: replacing("damage.before", reduceDamage(param<number>("amount"))),
  }),

  extension("banner", amountSchema, {
    translations: {
      de: {
        name: "Banner {amount}",
        description: "Benachbarte eigene Kreaturen und Besitzungen erhalten +{amount} Angriff.",
      },
    },
    name: "Banner {amount}",
    description: "Adjacent friendly creatures and holdings get +{amount} Attack.",
    static: modifiers(modify(adjacent, { attack: param<number>("amount") })),
  }),

  extension("outflank", amountSchema, {
    translations: {
      de: {
        description: "Solange diese Kreatur auf einer Flanke steht, hat sie +{amount} Angriff.",
      },
    },
    description: "While on a flank, this creature has +{amount} Attack.",
    static: modifiers(
      modify(and(targetIsSource, sourceOnFlank), { attack: param<number>("amount") }),
    ),
  }),

  extension("drillmaster", drillSchema, {
    translations: {
      de: {
        name: "Drillmeister {amount}",
        description: "Benachbarte eigene Kreaturen vom Typ {subtype} erhalten +{amount} Angriff.",
      },
    },
    name: "Drillmaster {amount}",
    description: "Adjacent friendly {subtype} creatures get +{amount} Attack.",
    static: modifiers(
      modify(and(adjacent, targetIsCreature, targetHasSubtype(param<string>("subtype"))), {
        attack: param<number>("amount"),
      }),
    ),
  }),

  extension("bind", drillSchema, {
    translations: {
      de: {
        name: "Bindung {amount}",
        description: "Eigene Kreaturen vom Typ {subtype} erhalten +{amount} Verteidigung.",
      },
    },
    name: "Bind {amount}",
    description: "Friendly {subtype} creatures have +{amount} Defense.",
    static: modifiers(
      modify(
        and(
          not(targetIsSource),
          sameController,
          targetIsCreature,
          targetHasSubtype(param<string>("subtype")),
        ),
        { defense: param<number>("amount") },
      ),
    ),
  }),

  extension("consume", amountSchema, {
    translations: {
      de: {
        name: "Verschlingen {amount}",
        description:
          "Zusätzliche Kosten: Opfere eine eigene Kreatur mit Kosten von mindestens {amount}.",
      },
    },
    name: "Consume {amount}",
    description: "Additional cost: sacrifice one of your creatures that costs at least {amount}.",
    before: replacing("card.play.before", requireSacrifice(param<number>("amount"))),
  }),

  extension("shield-wall", amountSchema, {
    translations: {
      de: {
        description:
          "Benachbarte eigene Kreaturen und Besitzungen erhalten +{amount} Verteidigung.",
      },
    },
    description: "Adjacent friendly creatures and holdings get +{amount} Defense.",
    static: modifiers(modify(adjacent, { defense: param<number>("amount") })),
  }),

  extension("guard", empty, {
    translations: {
      de: {
        name: "Wache",
        description:
          "Blockt Angriffe auf benachbarte Bahnen, auch leere. Stoppt einen Angreifer pro Kampf.",
      },
    },
    name: "Guard",
    description:
      "Blocks attacks aimed at adjacent lanes, even empty ones. Stops one attacker per combat.",
    intercepts: guardsAdjacentLanes,
  }),

  extension("sneaky", empty, {
    translations: {
      de: {
        description: "Kann nicht geblockt werden. Sein Angriff trifft immer den Spieler.",
      },
    },
    description: "Cannot be blocked. Its attack always hits the opposing player.",
    // Only restricts the carrier as an attacker; a Sneaky card still blocks normally.
    canBlock: unblockable,
  }),

  extension("muster", musterSchema, {
    translations: {
      de: {
        description:
          "Beim Ausspielen: Suche alle Exemplare von {card} in deiner Bibliothek und nimm sie auf die Hand.",
      },
    },
    description:
      "When played, search your library for all copies of {card} and put them into your hand.",
    announce: true,
    hooks: whenPlayed(searchLibrary(param<string>("card"))),
    // As a spell operation, the same search resolves when the spell is cast.
    cast: run(searchLibrary(param<string>("card"))),
  }),

  extension("hive", v.strictObject({ subtype: v.pipe(v.string(), v.minLength(1)) }), {
    translations: {
      de: {
        description:
          "Stirbt eine eigene Kreatur der Art {subtype}, suche in deiner Bibliothek die erste Kreatur dieser Art und nimm sie auf die Hand.",
      },
    },
    description:
      "Whenever a friendly {subtype} dies, search your library for the first {subtype} and put it into your hand.",
    announce: true,
    hooks: whenFriendlyDies(
      { subtype: param<string>("subtype") },
      searchLibraryForSubtype(param<string>("subtype")),
    ),
  }),

  extension("ransack", empty, {
    translations: {
      de: {
        description:
          "Beim Ausspielen: Sieh dir die Handkarten deines Gegners an und wähle eine davon. Dein Gegner legt sie ab.",
      },
    },
    description: "When played, look at your opponent's hand and choose a card. They discard it.",
    announce: true,
    hooks: whenPlayed(ransack()),
    // As a spell operation, the same look-and-discard resolves when the spell is cast.
    cast: run(ransack()),
  }),

  extension("forced-march", empty, {
    translations: {
      de: {
        description: "Kommt bereit ins Spiel: Kann im selben Zug angreifen oder Energie erzeugen.",
      },
    },
    description:
      "Enters the battlefield ready: it can attack or channel energy the turn it is played.",
    before: replacing("creature.enter.before", entersReady()),
  }),

  extension("charge", v.strictObject({ amount: positive }), {
    translations: {
      de: {
        name: "Ansturm {amount}",
        description:
          "Beim Ausspielen: Füge der gegenüberliegenden gegnerischen Kreatur {amount} Schaden zu.",
      },
    },
    name: "Charge {amount}",
    description: "When played, deal {amount} damage to the enemy creature opposite.",
    hooks: whenPlayed(damage(oppositeCreature, param<number>("amount"))),
  }),

  extension("sacrifice", v.strictObject({ amount: v.optional(positive) }), {
    translations: {
      de: {
        description:
          "Opfere eine andere eigene Kreatur: Erhalte {amount} Energie ihrer Art, bei mehreren Arten von jeder.",
      },
    },
    description:
      "Sacrifice another friendly creature: gain {amount} energy of its type, of each type if it has several.",
    // Left out, the amount is 1. The card does not exhaust, so it can be used again for another creature.
    defaults: { amount: 1 },
    exhausts: false,
    target: "friendly-creature",
    targetOthers: true,
    // A neutral creature has no faction and gives neutral energy.
    activate: run(destroy(chosen), gainEnergyOfTypes(chosen, param<number>("amount", 1))),
  }),

  extension("rest", amountSchema, {
    translations: {
      de: { name: "Rast {amount}", description: "Erschöpfe: Stelle {amount} Leben wieder her." },
    },
    name: "Rest {amount}",
    description: "Exhaust: restore {amount} life.",
    activate: run(heal(you, param<number>("amount"))),
  }),

  extension("weaken", amountSchema, {
    description: "The enemy creature or holding opposite has -{amount} Attack.",
    translations: {
      de: {
        description:
          "Die gegenüberliegende gegnerische Kreatur oder Besitzung hat -{amount} Angriff.",
      },
    },
    static: modifiers(modify(opposite, { attack: (params) => -(params.amount as number) })),
  }),

  extension("longshot", amountSchema, {
    description: "Exhaust: deal {amount} damage to an enemy creature.",
    translations: {
      de: {
        description: "Erschöpfe: Füge einer gegnerischen Kreatur {amount} Schaden zu.",
      },
    },
    target: "enemy-creature",
    activate: run(damage(chosen, param<number>("amount"))),
  }),
  leaderAbility(
    "fealty",
    {
      description: "All friendly creatures, including this one, have +1 Attack and +1 Defense.",
      translations: {
        de: {
          description:
            "Alle eigenen Kreaturen, auch diese, erhalten +1 Angriff und +1 Verteidigung.",
        },
      },
      static: modifiers(
        modify(and(sameController, targetOnBoard, targetIsCreature), { attack: 1, defense: 1 }),
      ),
    },
    3,
  ),
  leaderAbility("accord", {
    description:
      "After the first spell you cast during your play phase each turn, gain 1 Winter energy.",
    translations: {
      de: {
        description:
          "Nach dem ersten Zauber, den du während deiner Spielphase in einem Zug wirkst, erhältst du 1 Winterenergie.",
      },
    },
    hooks: when(
      "spell.cast",
      and(duringYourPlayPhase, byYou, firstThisTurn("spell.cast")),
      gainEnergy({ "winter-league": 1 }),
    ),
  }),
  leaderAbility("marches-rally", {
    description:
      "Exhaust: deploy a creature or holding from your hand to a free position without paying its cost. It enters exhausted.",
    translations: {
      de: {
        description:
          "Erschöpfe: Setze eine Kreatur oder Besitzung aus deiner Hand ohne Kosten auf einen freien Platz ein. Sie kommt erschöpft ins Spiel.",
      },
    },
    target: "friendly-hand-field",
    placement: true,
    activate: run(deployChosen()),
  }),
  leaderAbility("trade", {
    name: "Trade",
    description:
      "When this creature channels during your play phase, it also produces 1 neutral energy.",
    translations: {
      de: {
        name: "Handel",
        description:
          "Wenn diese Kreatur während deiner Spielphase Energie kanalisiert, erzeugt sie zusätzlich 1 neutrale Energie.",
      },
    },
    before: replacing("energy.generate.before", addEnergy("neutral", 1)),
  }),
  extension(
    "scorch",
    amountSchema,
    {
      description:
        "When played, deal {amount} damage to an enemy creature in range (opposite or in a neighbouring lane) or to the enemy player.",
      translations: {
        de: {
          description:
            "Beim Ausspielen: Füge einer gegnerischen Kreatur in Reichweite (gegenüber oder in einer Nachbarbahn) oder dem gegnerischen Spieler {amount} Schaden zu.",
        },
      },
      announce: true,
      target: "enemy-reach",
      // Entering by other means (Rally, Raise) has no chosen target, so nothing is burned.
      hooks: whenPlayed(damage(chosen, param<number>("amount"))),
    },
    3,
  ),
  leaderAbility(
    "raid",
    {
      name: "Raid",
      description: "This card has +1 Attack for each adjacent friendly creature.",
      translations: {
        de: {
          name: "Überfall",
          description: "Diese Karte erhält +1 Angriff für jede benachbarte eigene Kreatur.",
        },
      },
      static: modifiers(modify(targetIsSource, { attack: adjacentCreatures })),
    },
    3,
  ),
  leaderAbility("dark-harvest", {
    description:
      "Exhaust: put the top card of your library into your discard pile and gain 2 Host energy. Needs two cards in your library.",
    translations: {
      de: {
        description:
          "Erschöpfe: Lege die oberste Karte deiner Bibliothek auf den Ablagestapel und erhalte 2 Heerenergie. Benötigt zwei Karten in der Bibliothek.",
      },
    },
    canActivate: activatableWhen(libraryHasAtLeast(2)),
    activate: run(mill(1), gainEnergy({ "black-host": 2 })),
  }),
  leaderAbility(
    "wayfarer",
    {
      description:
        "Exhaust: return a friendly creature (including this one) to its owner’s hand, clearing its damage.",
      translations: {
        de: {
          description:
            "Erschöpfe: Nimm eine eigene Kreatur (auch diese) auf die Hand ihres Besitzers zurück und entferne ihren Schaden.",
        },
      },
      target: "friendly-creature",
      activate: run(returnToHand(chosen)),
    },
    1,
  ),
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
