import { defineAbility as extension } from "./definition";
import { spellAbilities } from "./spellAbilities";
import { amount, amountSchema } from "./schemas";
import * as v from "valibot";
import { spellSubtypes, type AbilityExtension } from "@realms/contracts";
import { positive } from "./schemas";
import {
  activatableWhen,
  addEnergy,
  adjacent,
  adjacentCreatures,
  and,
  cardsInDiscard,
  forStat,
  byYou,
  castSpellSubtype,
  damageChosenEnemy,
  perSpellCast,
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
  requireReturn,
  requireSacrifice,
  returnToHand,
  run,
  sameController,
  searchLibrary,
  searchLibraryByCost,
  searchLibraryForSubtype,
  sourceOnFlank,
  targetHasSubtype,
  targetIsCreature,
  targetIsSource,
  targetOnBoard,
  unblockable,
  when,
  whenFriendlyDies,
  repriseSpell,
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
/** `maxCost` is the highest total energy cost (generic plus faction) the found card may have. The player picks the card unless `first` is set, which takes the topmost match. */
const searchForCreatureOrHoldingSchema = v.strictObject({
  maxCost: v.pipe(v.number(), v.integer(), v.minValue(0)),
  first: v.optional(v.boolean()),
});
/** Counts the discard-pile cards of these types; every friendly creature gets that much of `stat`. */
const dirgeSchema = v.strictObject({
  cards: v.pipe(
    v.array(v.picklist(["creature", "holding", "spell"])),
    v.minLength(1),
    v.maxLength(3),
  ),
  stat: v.picklist(["attack", "defense"]),
});
/** At least one of `attack` and `defense`; each is the bonus this creature gets for every spell its controller has cast this turn. */
const prowessSchema = v.union([
  v.strictObject({ attack: positive, defense: v.optional(positive) }),
  v.strictObject({ attack: v.optional(positive), defense: positive }),
]);
/** `subtype` limits the trigger to spells of that subtype; left out, any spell triggers it. */
const kindleSchema = v.strictObject({
  amount: positive,
  subtype: v.optional(v.picklist(spellSubtypes)),
});
const drillSchema = v.strictObject({
  amount: positive,
  subtype: v.pipe(v.string(), v.minLength(1)),
});

/** Evergreen keywords: scalable vocabulary on the card itself, usable by any faction. */
export const evergreenAbilities: AbilityExtension[] = [
  extension("primal", amountSchema, {
    description: "Exhaust: gain {amount} energy of a faction of your choice.",
    translations: {
      de: {
        description: "Erschöpfen: Erhalte {amount} Energie einer Fraktion deiner Wahl.",
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
        description: "Schaden, der dieser Karte zugefügt wird, ist um {amount} verringert.",
      },
    },
    name: "Armor {amount}",
    description: "Damage dealt to this card is reduced by {amount}.",
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
        name: "Flankieren {amount}",
        description: "Auf einer Flanke erhält diese Kreatur +{amount} Angriff.",
      },
    },
    name: "Outflank {amount}",
    description: "While on a flank, this creature gets +{amount} Attack.",
    static: modifiers(
      modify(and(targetIsSource, sourceOnFlank), { attack: param<number>("amount") }),
    ),
  }),

  extension("drillmaster", drillSchema, {
    translations: {
      de: {
        description: "Benachbarte eigene Kreaturen der Art {subtype} erhalten +{amount} Angriff.",
      },
    },
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
        description: "Andere eigene Kreaturen der Art {subtype} erhalten +{amount} Verteidigung.",
      },
    },
    description: "Other friendly {subtype} creatures get +{amount} Defense.",
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

  extension("dirge", dirgeSchema, {
    translations: {
      de: {
        description:
          "Jede eigene Kreatur erhält +1 {stat} für jede Karte vom Typ {cards} in deinem Ablagestapel.",
      },
    },
    description:
      "Each friendly creature gets +1 {stat} for each {cards} card in your discard pile.",
    static: modifiers(
      modify(and(sameController, targetOnBoard, targetIsCreature), {
        attack: forStat("attack", cardsInDiscard(param<string[]>("cards"))),
        defense: forStat("defense", cardsInDiscard(param<string[]>("cards"))),
      }),
    ),
  }),

  extension("prowess", prowessSchema, {
    translations: {
      de: {
        description:
          "Diese Kreatur erhält {?attack|+{attack} Angriff|}{?attack&defense| und |}{?defense|+{defense} Verteidigung|} für jeden Zauber, den du in diesem Zug gewirkt hast.",
      },
    },
    description:
      "This creature gets {?attack|+{attack} Attack|}{?attack&defense| and |}{?defense|+{defense} Defense|} for each spell you cast this turn.",
    static: modifiers(
      modify(and(targetIsSource, targetOnBoard), {
        attack: perSpellCast(param<number | undefined>("attack")),
        defense: perSpellCast(param<number | undefined>("defense")),
      }),
    ),
  }),

  extension("kindle", kindleSchema, {
    translations: {
      de: {
        description:
          "Immer wenn du {?subtype|einen Zauber der Art {subtype}|einen Zauber} wirkst, füge einer gegnerischen Kreatur, einer gegnerischen Besitzung oder dem gegnerischen Spieler {amount} Schaden zu.",
      },
    },
    description:
      "Whenever you cast {?subtype|a {subtype} spell|a spell}, deal {amount} damage to target enemy creature, holding or player.",
    announce: true,
    hooks: when(
      "spell.cast",
      and(byYou, castSpellSubtype(param<string | undefined>("subtype"))),
      damageChosenEnemy(param<number>("amount")),
    ),
  }),

  extension("reprise", v.strictObject({}), {
    translations: {
      de: {
        description:
          "Beim Ausspielen: Wirke einen Zauber aus deinem Ablagestapel, ohne seine Kosten zu bezahlen.",
      },
    },
    description: "When played, cast a spell from your discard pile without paying its cost.",
    announce: true,
    hooks: whenPlayed(repriseSpell()),
  }),

  extension("return", v.strictObject({}), {
    translations: {
      de: {
        description:
          "Zusätzliche Kosten: Nimm eine eigene Kreatur auf die Hand ihres Besitzers zurück.",
      },
    },
    description: "Additional cost: return a friendly creature to its owner's hand.",
    before: replacing("card.play.before", requireReturn()),
  }),

  extension("consume", amountSchema, {
    translations: {
      de: {
        description:
          "Zusätzliche Kosten: Opfere eine eigene Kreatur mit Energiekosten von {amount} oder mehr.",
      },
    },
    description:
      "Additional cost: sacrifice a friendly creature with an energy cost of {amount} or more.",
    before: replacing("card.play.before", requireSacrifice(param<number>("amount"))),
  }),

  extension("shield-wall", amountSchema, {
    translations: {
      de: {
        name: "Schildwall {amount}",
        description:
          "Benachbarte eigene Kreaturen und Besitzungen erhalten +{amount} Verteidigung.",
      },
    },
    name: "Shield Wall {amount}",
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

  extension("covert", empty, {
    translations: {
      de: {
        name: "Verdeckt",
        description:
          "Diese Kreatur kann nicht geblockt werden. Ihr Angriff trifft immer den gegnerischen Spieler.",
      },
    },
    name: "Covert",
    description: "This creature can't be blocked. Its attack always hits the opposing player.",
    // Only restricts the carrier as an attacker; a Covert card still blocks normally.
    canBlock: unblockable,
  }),

  extension("muster", musterSchema, {
    translations: {
      de: {
        description:
          "Suche alle Exemplare von {card} in deiner Bibliothek und nimm sie auf die Hand.",
        fieldDescription:
          "Beim Ausspielen: Suche alle Exemplare von {card} in deiner Bibliothek und nimm sie auf die Hand.",
      },
    },
    description: "Search your library for all copies of {card} and put them into your hand.",
    fieldDescription:
      "When played, search your library for all copies of {card} and put them into your hand.",
    announce: true,
    hooks: whenPlayed(searchLibrary(param<string>("card"))),
    // As a spell operation, the same search resolves when the spell is cast.
    cast: run(searchLibrary(param<string>("card"))),
  }),

  extension("searchForCreatureOrHolding", searchForCreatureOrHoldingSchema, {
    translations: {
      de: {
        description:
          "{?first|Nimm die oberste Kreatur oder Besitzung mit Energiekosten von {maxCost} oder weniger aus deiner Bibliothek auf die Hand.|Suche in deiner Bibliothek eine Kreatur oder Besitzung mit Energiekosten von {maxCost} oder weniger und nimm sie auf die Hand.}",
        fieldDescription:
          "Beim Ausspielen: {?first|Nimm die oberste Kreatur oder Besitzung mit Energiekosten von {maxCost} oder weniger aus deiner Bibliothek auf die Hand.|Suche in deiner Bibliothek eine Kreatur oder Besitzung mit Energiekosten von {maxCost} oder weniger und nimm sie auf die Hand.}",
      },
    },
    description:
      "{?first|Put the topmost creature or holding with an energy cost of {maxCost} or less from your library into your hand.|Search your library for a creature or holding with an energy cost of {maxCost} or less and put it into your hand.}",
    fieldDescription:
      "When played, {?first|put the topmost creature or holding with an energy cost of {maxCost} or less from your library into your hand.|search your library for a creature or holding with an energy cost of {maxCost} or less and put it into your hand.}",
    announce: true,
    hooks: whenPlayed(
      searchLibraryByCost(param<number>("maxCost"), param<boolean>("first", false)),
    ),
    // As a spell operation, the same search resolves when the spell is cast.
    cast: run(searchLibraryByCost(param<number>("maxCost"), param<boolean>("first", false))),
  }),

  extension(
    "hive",
    v.strictObject({ subtype: v.pipe(v.string(), v.minLength(1)), first: v.optional(v.boolean()) }),
    {
      translations: {
        de: {
          description:
            "Wenn eine eigene Kreatur der Art {subtype} stirbt, {?first|nimm die oberste Kreatur der Art {subtype} aus deiner Bibliothek auf die Hand.|suche in deiner Bibliothek eine Kreatur der Art {subtype} und nimm sie auf die Hand.}",
        },
      },
      description:
        "Whenever a friendly {subtype} creature dies, {?first|put the topmost {subtype} creature from your library into your hand.|search your library for one {subtype} creature and put it into your hand.}",
      announce: true,
      hooks: whenFriendlyDies(
        { subtype: param<string>("subtype") },
        searchLibraryForSubtype(param<string>("subtype"), param<boolean>("first", false)),
      ),
    },
  ),

  extension("ransack", empty, {
    translations: {
      de: {
        description: "Sieh dir die Hand deines Gegners an. Er legt eine Karte deiner Wahl ab.",
        fieldDescription:
          "Beim Ausspielen: Sieh dir die Hand deines Gegners an. Er legt eine Karte deiner Wahl ab.",
      },
    },
    description: "Look at your opponent's hand. They discard a card of your choice.",
    fieldDescription:
      "When played, look at your opponent's hand. They discard a card of your choice.",
    announce: true,
    hooks: whenPlayed(ransack()),
    // As a spell operation, the same look-and-discard resolves when the spell is cast.
    cast: run(ransack()),
  }),

  extension("quickened", empty, {
    translations: {
      de: {
        name: "Beschleunigt",
        description:
          "Kommt bereit ins Spiel: Sie kann im selben Zug angreifen oder Energie kanalisieren.",
      },
    },
    name: "Quickened",
    description: "Enters ready: it can attack or channel energy the turn it is played.",
    before: replacing("creature.enter.before", entersReady()),
  }),

  extension("charge", v.strictObject({ amount: positive }), {
    translations: {
      de: {
        description:
          "Beim Ausspielen: Füge der gegenüberliegenden gegnerischen Kreatur {amount} Schaden zu.",
      },
    },
    description: "When played, deal {amount} damage to the opposite enemy creature.",
    hooks: whenPlayed(damage(oppositeCreature, param<number>("amount"))),
  }),

  extension("sacrifice", v.strictObject({ amount: v.optional(positive) }), {
    translations: {
      de: {
        description:
          "Opfere eine andere eigene Kreatur: Erhalte {amount} Energie jedes ihrer Typen.",
      },
    },
    description: "Sacrifice another friendly creature: gain {amount} energy of each of its types.",
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
      de: { description: "Erschöpfen: Stelle {amount} Leben wieder her." },
    },
    description: "Exhaust: restore {amount} life.",
    activate: run(heal(you, param<number>("amount"))),
  }),

  extension("weaken", amountSchema, {
    description: "The opposite enemy creature or holding gets -{amount} Attack.",
    translations: {
      de: {
        description:
          "Die gegenüberliegende gegnerische Kreatur oder Besitzung erhält -{amount} Angriff.",
      },
    },
    static: modifiers(modify(opposite, { attack: (params) => -(params.amount as number) })),
  }),

  extension("longshot", amountSchema, {
    description: "Exhaust: deal {amount} damage to target enemy creature.",
    translations: {
      de: {
        description: "Erschöpfen: Füge einer gegnerischen Kreatur {amount} Schaden zu.",
      },
    },
    target: "enemy-creature",
    activate: run(damage(chosen, param<number>("amount"))),
  }),
  leaderAbility(
    "fealty",
    {
      description: "All friendly creatures, including this one, get +1 Attack and +1 Defense.",
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
      "After you cast your first spell each turn during your play phase, gain 1 Northern League energy.",
    translations: {
      de: {
        description:
          "Nachdem du in deiner Spielphase deinen ersten Zauber des Zuges gewirkt hast, erhältst du 1 Nordbund-Energie.",
      },
    },
    hooks: when(
      "spell.cast",
      and(duringYourPlayPhase, byYou, firstThisTurn("spell.cast")),
      gainEnergy({ "northern-league": 1 }),
    ),
  }),
  leaderAbility("marches-rally", {
    description:
      "Exhaust: deploy a creature or holding from your hand to a free position without paying its cost. It enters exhausted.",
    translations: {
      de: {
        description:
          "Erschöpfen: Setze eine Kreatur oder Besitzung aus deiner Hand ohne Kosten auf eine freie Position ein. Sie kommt erschöpft ins Spiel.",
      },
    },
    target: "friendly-hand-field",
    placement: true,
    activate: run(deployChosen()),
  }),
  leaderAbility("trade", {
    description:
      "When this creature channels during your play phase, it also produces 1 neutral energy.",
    translations: {
      de: {
        description:
          "Wenn diese Kreatur in deiner Spielphase Energie kanalisiert, erzeugt sie zusätzlich 1 neutrale Energie.",
      },
    },
    before: replacing("energy.generate.before", addEnergy("neutral", 1)),
  }),
  extension(
    "scorch",
    amountSchema,
    {
      description:
        "When played, deal {amount} damage to target enemy creature opposite or in an adjacent lane, or to the enemy player.",
      translations: {
        de: {
          description:
            "Beim Ausspielen: Füge einer gegnerischen Kreatur gegenüber oder in einer benachbarten Bahn oder dem gegnerischen Spieler {amount} Schaden zu.",
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
      description: "This card has +1 Attack for each adjacent friendly creature.",
      translations: {
        de: {
          description: "Diese Karte erhält +1 Angriff für jede benachbarte eigene Kreatur.",
        },
      },
      static: modifiers(modify(targetIsSource, { attack: adjacentCreatures })),
    },
    3,
  ),
  leaderAbility("dark-harvest", {
    description:
      "Exhaust: put the top card of your library into your discard pile and gain 2 Host energy. Requires at least 2 cards in your library.",
    translations: {
      de: {
        description:
          "Erschöpfen: Lege die oberste Karte deiner Bibliothek auf den Ablagestapel und erhalte 2 Heerenergie. Erfordert mindestens 2 Karten in deiner Bibliothek.",
      },
    },
    canActivate: activatableWhen(libraryHasAtLeast(2)),
    activate: run(mill(1), gainEnergy({ "black-host": 2 })),
  }),
  leaderAbility(
    "wayfarer",
    {
      description: "Exhaust: return a friendly creature, including this one, to its owner’s hand.",
      translations: {
        de: {
          description:
            "Erschöpfen: Nimm eine eigene Kreatur, auch diese, auf die Hand ihres Besitzers zurück.",
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
