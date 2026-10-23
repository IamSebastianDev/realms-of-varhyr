import * as v from "valibot";
import {
  spellSubtypes,
  type AbilityExtension,
  type CardDefinition,
  type Registry,
} from "@realms/contracts";
import { abilities } from "@realms/extensions";
import { describeAbility } from "@realms/extensions/describeAbility";
import { factions } from "./factions";

const nonnegativeInteger = v.pipe(v.number(), v.integer(), v.minValue(0));
const binding = v.object({ id: v.string(), params: v.record(v.string(), v.unknown()) });

export function cardSchema(factionIds: readonly string[]) {
  const faction = v.picklist(factionIds);
  const affiliation = v.picklist([...factionIds, "neutral"]);
  const pool = v.record(v.picklist([...factionIds, "neutral"]), nonnegativeInteger);
  return v.object({
    id: v.string(),
    set: v.optional(v.pipe(v.string(), v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/))),
    revision: v.pipe(nonnegativeInteger, v.minValue(1)),
    name: v.string(),
    deckLimitKey: v.string(),
    type: v.picklist(["creature", "spell", "holding"]),
    factions: v.array(affiliation),
    subtypes: v.array(v.string()),
    legendary: v.boolean(),
    rarity: v.picklist(["common", "rare", "legendary"]),
    cost: v.object({
      generic: nonnegativeInteger,
      factions: v.optional(v.record(faction, nonnegativeInteger), {}),
    }),
    lore: v.optional(v.string()),
    // Authored in assets/cards/<card>/data.<language>.json and merged by the importer; never part of data.json.
    translations: v.optional(
      v.record(
        v.picklist(["en", "de"]),
        v.strictObject({
          name: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1))),
          lore: v.optional(v.string()),
        }),
      ),
    ),
    art: v.string(),
    animation: v.optional(v.string()),
    abilities: v.array(binding),
    stats: v.optional(
      v.object({
        attack: nonnegativeInteger,
        defense: nonnegativeInteger,
        energyOutputs: v.optional(v.array(pool), []),
      }),
    ),
    timing: v.optional(v.pipe(v.array(v.picklist(["play", "response"])), v.minLength(1))),
    cast: v.optional(v.array(binding)),
  });
}

/** What a card's data.json may contain. Translations live in data.<language>.json instead. */
export function authoredCardSchema(factionIds: readonly string[]) {
  return v.omit(cardSchema(factionIds), ["translations"]);
}

/** The translated fields of one card in one language. Everything else (type, subtypes, rarity, rules) is translated statically. */
export const cardTranslationSchema = v.strictObject({
  $schema: v.optional(v.string()),
  name: v.pipe(v.string(), v.trim(), v.minLength(1)),
  lore: v.optional(v.string()),
});
export function parseCardTranslation(input: unknown) {
  const { $schema: _schema, ...translation } = v.parse(cardTranslationSchema, input);
  return translation;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  return value;
}

/** Validates plain data; no filesystem, React or browser dependencies. */
export function compileContent(
  input: unknown[],
  extensions: Record<string, AbilityExtension> = abilities,
  version = "varhir-core-0.1",
  factionIds: readonly string[] = factions,
): Registry {
  for (const extension of Object.values(extensions)) {
    if (
      typeof extension.name !== "string" ||
      !extension.name.trim() ||
      typeof extension.description !== "string" ||
      !extension.description.trim()
    ) {
      throw new Error(`Ability ${extension.id} needs a name and description`);
    }
  }
  const schema = cardSchema(factionIds);
  const cards: Record<string, CardDefinition> = {};
  for (const data of input) {
    const card = v.parse(schema, data) as CardDefinition;
    // Neutral is an authoring affiliation, not a faction-specific energy cost.
    // Keep canonical cards factionless so existing rules and presentation agree.
    if (card.factions.includes("neutral")) {
      if (card.factions.some((id) => id !== "neutral"))
        throw new Error(`Card ${card.id} cannot mix neutral with named factions`);
      card.factions = [];
    }
    if (cards[card.id]) throw new Error(`Duplicate card ID: ${card.id}`);
    if (card.type !== "spell" && (!card.stats || card.cast || card.timing))
      throw new Error(`Invalid field card: ${card.id}`);
    if (card.type === "holding" && card.stats!.defense < 1)
      throw new Error(`Holding ${card.id} needs at least 1 Defense`);
    if (card.type === "holding" && card.stats!.energyOutputs.length)
      throw new Error(`Holding ${card.id} cannot produce energy`);
    if (card.type === "spell" && (card.stats || !card.cast?.length || !card.timing))
      throw new Error(`Invalid spell: ${card.id}`);
    if (
      card.type === "spell" &&
      (card.subtypes.length > 1 ||
        card.subtypes.some((subtype) => !(spellSubtypes as readonly string[]).includes(subtype)))
    )
      throw new Error(
        `Spell ${card.id} needs at most one subtype from: ${spellSubtypes.join(", ")}`,
      );
    for (const binding of [...card.abilities, ...(card.cast ?? [])]) {
      const extension = extensions[binding.id];
      if (!extension) throw new Error(`Unknown ability ${binding.id} on ${card.id}`);
      extension.validate(binding.params);
      if (
        typeof binding.params.energy === "string" &&
        ![...factionIds, "neutral"].includes(binding.params.energy)
      )
        throw new Error(`Unknown energy type ${binding.params.energy} on ${card.id}`);
      describeAbility(binding, extension);
      describeAbility(binding, extension, "field");
      for (const translation of Object.values(extension.translations ?? {})) {
        if (!translation || !translation.name.trim() || !translation.description.trim())
          throw new Error(`Ability ${extension.id} needs translated names and descriptions`);
        if (extension.fieldDescription && !translation.fieldDescription?.trim())
          throw new Error(`Ability ${extension.id} needs a translated field description`);
        describeAbility(binding, { ...extension, ...translation });
        describeAbility(binding, { ...extension, ...translation }, "field");
      }
      if (card.cast?.includes(binding) && !extension.cast)
        throw new Error(`Ability ${binding.id} is not a spell operation`);
      if (
        card.type !== "spell" &&
        card.abilities.includes(binding) &&
        extension.cast &&
        !extension.activate &&
        !extension.hooks &&
        !extension.before &&
        !extension.static &&
        !extension.canBlock &&
        !extension.intercepts
      )
        throw new Error(
          `Ability ${binding.id} is spell-only and cannot be on field card ${card.id}`,
        );
      if (card.type === "spell" && card.abilities.includes(binding) && extension.activate)
        throw new Error(`Spell ${card.id} cannot have an activated field ability`);
    }
    cards[card.id] = card;
  }

  const bundle = JSON.stringify(
    canonical({
      // Presentation-only set membership and translations do not invalidate saved matches or change the wire content version.
      cards: Object.fromEntries(
        Object.entries(cards).map(([id, { translations: _translations, set: _set, ...card }]) => [
          id,
          card,
        ]),
      ),
      factions: factionIds,
      extensions: Object.keys(extensions)
        .sort()
        .map((id) => [
          id,
          extensions[id].version,
          extensions[id].name,
          extensions[id].description,
          ...(extensions[id].placement ? [true] : []),
        ]),
    }),
  );
  let hash = 2166136261;
  for (let index = 0; index < bundle.length; index++)
    hash = Math.imul(hash ^ bundle.charCodeAt(index), 16777619) >>> 0;
  return {
    version: `${version}-${hash.toString(16).padStart(8, "0")}`,
    energyTypes: [...factionIds, "neutral"],
    cards,
    abilities: extensions,
  };
}

/** Ability params named `card` hold card IDs. Cards are compiled one at a time, so this runs once the whole catalogue is loaded. Returns one message per unknown reference. */
export function unknownCardReferences(
  cards: readonly CardDefinition[],
): { cardId: string; message: string }[] {
  const ids = new Set(cards.map((card) => card.id));
  return cards.flatMap((card) =>
    [...card.abilities, ...(card.cast ?? [])].flatMap((binding) =>
      typeof binding.params.card === "string" && !ids.has(binding.params.card)
        ? [
            {
              cardId: card.id,
              message: `${binding.id} refers to unknown card '${binding.params.card}'.`,
            },
          ]
        : [],
    ),
  );
}
