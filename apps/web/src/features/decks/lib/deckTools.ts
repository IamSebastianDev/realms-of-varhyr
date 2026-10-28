import { energyProductionOptions } from "@realms/core/production";
import type { CardDefinition, Registry } from "@realms/contracts";
import { setInfo } from "@realms/content/sets";
import { factions } from "@realms/content/factions";
import { describeAbility } from "@realms/extensions/describeAbility";
import { copyCount, copyLimit, deckCardAvailability, type CustomDeck } from "./decks";
import { subtypeLabel } from "@realms/ui/i18n";
import type { OwnedCopies } from "../../collection/lib/collection";
import { currentCardId } from "../../../lib/cardIds";
export { copyLimit } from "./decks";

export const cardCost = (card: CardDefinition) =>
  card.cost.generic + Object.values(card.cost.factions).reduce((sum, n) => sum + n, 0);
export const isProducer = (card: CardDefinition, content: Registry) =>
  card.type !== "spell" &&
  energyProductionOptions(card, content).some((output) => Object.values(output).some((n) => n > 0));
export type CardSort = "faction" | "cost" | "name" | "attack" | "defense";
/** Named factions in their authored order; cards without a faction (neutral) come last. */
const factionRank = (card: CardDefinition) => {
  const index = card.factions.length ? factions.indexOf(card.factions[0]) : -1;
  return index < 0 ? factions.length : index;
};
/** Faction, then total cost, then name: the default order for the collection and deck builder. */
export const compareCards = (a: CardDefinition, b: CardDefinition) =>
  factionRank(a) - factionRank(b) ||
  cardCost(a) - cardCost(b) ||
  a.name.localeCompare(b.name) ||
  a.id.localeCompare(b.id);
/** Each list is multi-select: empty means "any", otherwise a card matches when it fits at least one chosen value. */
export type CardRole = "producers" | "free-producers";
export type BuilderFilters = {
  query: string;
  set: string[];
  faction: string[];
  kind: string[];
  rarity: string[];
  cost: number[];
  role: CardRole[];
  addable: boolean;
  sort: CardSort;
};
export const initialBuilderFilters: BuilderFilters = {
  query: "",
  set: [],
  faction: [],
  kind: [],
  rarity: [],
  cost: [],
  role: [],
  addable: false,
  sort: "faction",
};

export function builderCards(
  content: Registry,
  deck: string[],
  filters: BuilderFilters,
  owned?: OwnedCopies,
): CardDefinition[] {
  const words = filters.query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return Object.values(content.cards)
    .filter((card) => {
      const bindings =
        card.type === "spell" ? [...card.abilities, ...(card.cast ?? [])] : card.abilities;
      const release = card.set ? setInfo[card.set] : undefined;
      const text = [
        card.name,
        card.lore,
        card.set,
        release?.name,
        release?.code,
        release?.translations?.de?.name,
        ...Object.values(card.translations ?? {}).flatMap((text) => [text?.name, text?.lore]),
        ...card.subtypes,
        ...card.subtypes.map((subtype) => subtypeLabel(subtype, "de")),
        ...card.factions,
        card.legendary ? "legendary" : "",
        ...bindings.map((binding) => {
          const ability = describeAbility(binding, content.abilities[binding.id]);
          return `${ability.name ?? ""} ${ability.description} ${Object.values(
            content.abilities[binding.id].translations ?? {},
          )
            .map((text) => `${text?.name ?? ""} ${text?.description ?? ""}`)
            .join(" ")}`;
        }),
      ]
        .join(" ")
        .toLocaleLowerCase();
      return (
        words.every((word) => text.includes(word)) &&
        (!filters.set.length || (!!card.set && filters.set.includes(card.set))) &&
        (!filters.faction.length ||
          filters.faction.some((faction) =>
            faction === "neutral" ? !card.factions.length : card.factions.includes(faction),
          )) &&
        (!filters.kind.length || filters.kind.includes(card.type)) &&
        (!filters.rarity.length || filters.rarity.includes(card.rarity)) &&
        (!filters.cost.length || filters.cost.includes(Math.min(6, cardCost(card)))) &&
        (!filters.role.length ||
          (isProducer(card, content) &&
            (cardCost(card) === 0 ? true : filters.role.includes("producers")))) &&
        (!filters.addable || deckCardAvailability(deck, card.id, content, owned).remaining > 0)
      );
    })
    .sort((a, b) => {
      const primary =
        filters.sort === "faction"
          ? 0
          : filters.sort === "cost"
            ? cardCost(a) - cardCost(b)
            : filters.sort === "attack"
              ? (b.stats?.attack ?? 0) - (a.stats?.attack ?? 0)
              : filters.sort === "defense"
                ? (b.stats?.defense ?? 0) - (a.stats?.defense ?? 0)
                : 0;
      return primary || compareCards(a, b);
    });
}

export function summarizeDeck(ids: string[], content: Registry) {
  const cards = ids.flatMap((id) => (content.cards[id] ? [content.cards[id]] : []));
  const curve = Array<number>(7).fill(0);
  const types = { creature: 0, spell: 0, holding: 0 };
  let totalCost = 0,
    producers = 0,
    freeProducers = 0;
  for (const card of cards) {
    const cost = cardCost(card);
    curve[Math.min(6, cost)]++;
    types[card.type]++;
    totalCost += cost;
    if (isProducer(card, content)) {
      producers++;
      if (!cost) freeProducers++;
    }
  }
  return {
    total: ids.length,
    unique: new Set(ids).size,
    curve,
    types,
    producers,
    freeProducers,
    averageCost: cards.length ? totalCost / cards.length : 0,
  };
}

/** Portable decks carry stable card IDs, not local saved-deck identities. */
export function exportDeck(deck: CustomDeck): string {
  const counts: Record<string, number> = {};
  for (const id of deck.cards) counts[id] = (counts[id] ?? 0) + 1;
  return JSON.stringify(
    {
      format: "varhyr-deck",
      version: 1,
      name: deck.name.trim() || "Untitled deck",
      cards: Object.entries(counts)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, count]) => ({ id, count })),
    },
    null,
    2,
  );
}

/** An import is a new draft. Validate the entire file before replacing the current one. */
export function importDeck(raw: string, content: Registry): Pick<CustomDeck, "name" | "cards"> {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  if (!value || typeof value !== "object") throw new Error("This file does not contain a deck.");
  const data = value as { format?: unknown; version?: unknown; name?: unknown; cards?: unknown };
  if (data.format !== "varhyr-deck" || data.version !== 1)
    throw new Error("Choose a Realms of Varhyr deck export.");
  if (
    typeof data.name !== "string" ||
    !data.name.trim() ||
    data.name.length > 60 ||
    !Array.isArray(data.cards)
  )
    throw new Error("The deck name or card list is invalid.");
  const cards: string[] = [];
  for (const entry of data.cards) {
    if (!entry || typeof entry !== "object") throw new Error("The card list is invalid.");
    const { id: savedId, count } = entry as { id?: unknown; count?: unknown };
    const id = typeof savedId === "string" ? currentCardId(savedId) : savedId;
    if (typeof id !== "string" || !Object.hasOwn(content.cards, id))
      throw new Error(`Unknown card: ${String(savedId)}.`);
    const card = content.cards[id];
    if (
      typeof count !== "number" ||
      !Number.isSafeInteger(count) ||
      count < 1 ||
      count > copyLimit(card) ||
      copyCount(cards, id, content) + count > copyLimit(card)
    )
      throw new Error(`Too many or invalid copies of ${card.name}.`);
    cards.push(...Array<string>(count).fill(id));
  }
  return { name: data.name.trim(), cards };
}
