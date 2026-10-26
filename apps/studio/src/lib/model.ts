import { compileContent } from "@realms/content/compiler";
import { abilities } from "@realms/extensions";
import { describeAbility } from "@realms/extensions/describeAbility";
import { factions as factionIds } from "@realms/content/factions";
import schema from "../../../../assets/schemas/card.schema.json";

export type Binding = { id: string; params: Record<string, unknown> };
export type CardKind = "creature" | "spell" | "holding";
export type Timing = "play" | "response";
/** Everything the form edits. Neutral cards have no factions; stats and outputs only apply to field cards. */
export type Draft = {
  isNew: boolean;
  folder: string;
  id: string;
  revision: number;
  name: string;
  deckLimitKey: string;
  type: CardKind;
  set: string;
  rarity: "common" | "rare" | "legendary";
  legendary: boolean;
  factions: string[];
  subtypes: string[];
  cost: { generic: number; factions: Record<string, number> };
  attack: number;
  defense: number;
  outputs: Record<string, number>[];
  abilities: Binding[];
  timing: Timing[];
  cast: Binding[];
  /** Choose one: the caster picks a single entry of `cast`. */
  modal: boolean;
  lore: string;
  de: { name: string; lore: string };
};

export const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const slugify = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export function newDraft(set = "foundations", faction = ""): Draft {
  return {
    isNew: true,
    folder: "",
    id: "",
    revision: 1,
    name: "",
    deckLimitKey: "",
    type: "creature",
    set,
    rarity: "common",
    legendary: false,
    factions: faction.split("+").filter((id) => id && id !== "neutral"),
    subtypes: [],
    cost: { generic: 0, factions: {} },
    attack: 1,
    defense: 1,
    outputs: [],
    abilities: [],
    timing: ["play"],
    cast: [],
    modal: false,
    lore: "",
    de: { name: "", lore: "" },
  };
}

type Json = Record<string, any>;
/** Reads one card's data.json (and optional data.de.json) into form state. Unknown fields are not carried over. */
export function draftFromFiles(folder: string, data: Json, de?: Json): Draft {
  const base = newDraft(data.set);
  return {
    ...base,
    isNew: false,
    folder,
    id: data.id,
    revision: data.revision ?? 1,
    name: data.name ?? "",
    deckLimitKey: data.deckLimitKey ?? data.id,
    type: data.type,
    rarity: data.rarity,
    legendary: !!data.legendary,
    factions: [...(data.factions ?? [])].filter((id: string) => id !== "neutral"),
    subtypes: [...(data.subtypes ?? [])],
    cost: { generic: data.cost?.generic ?? 0, factions: { ...data.cost?.factions } },
    attack: data.stats?.attack ?? 0,
    defense: data.stats?.defense ?? 1,
    outputs: (data.stats?.energyOutputs ?? []).map((pool: Record<string, number>) => ({ ...pool })),
    abilities: (data.abilities ?? []).map((b: Binding) => ({ id: b.id, params: { ...b.params } })),
    timing: [...(data.timing ?? [])].map((t: string) =>
      t === "death" ? "response" : t,
    ) as Timing[],
    cast: (data.cast ?? []).map((b: Binding) => ({ id: b.id, params: { ...b.params } })),
    modal: data.modal === true,
    lore: data.lore ?? "",
    de: { name: de?.name ?? "", lore: de?.lore ?? "" },
  };
}

const positive = (record: Record<string, number>) =>
  Object.fromEntries(Object.entries(record).filter(([, n]) => n > 0));
/** The exact JSON written to disk, in the order existing card files use. */
export function serialize(draft: Draft): { data: Json; de: Json | null } {
  const field = draft.type !== "spell";
  const data: Json = {
    $schema: "../../schemas/card.schema.json",
    id: draft.id,
    revision: draft.revision,
    name: draft.name.trim(),
    deckLimitKey: draft.deckLimitKey || draft.id,
    type: draft.type,
    factions: draft.factions.length ? draft.factions : ["neutral"],
    subtypes: draft.subtypes,
    legendary: draft.legendary,
    rarity: draft.rarity,
    cost: { generic: draft.cost.generic },
  };
  const paid = positive(
    Object.fromEntries(
      Object.entries(draft.cost.factions).filter(([id]) => draft.factions.includes(id)),
    ),
  );
  if (Object.keys(paid).length) data.cost.factions = paid;
  const outputs =
    draft.type === "creature"
      ? draft.outputs.map(positive).filter((pool) => Object.keys(pool).length)
      : [];
  if (field)
    data.stats = {
      attack: draft.attack,
      defense: draft.defense,
      ...(outputs.length ? { energyOutputs: outputs } : {}),
    };
  data.abilities = draft.abilities; // On a spell these are play costs such as Consume.
  if (!field) {
    data.timing = draft.timing;
    data.cast = draft.cast;
    if (draft.modal) data.modal = true;
  }
  if (draft.lore.trim()) data.lore = draft.lore.trim();
  data.set = draft.set;
  const name = draft.de.name.trim(),
    lore = draft.de.lore.trim();
  const de =
    name || lore
      ? {
          $schema: "../../schemas/card-translation.schema.json",
          name: name || draft.name.trim(),
          ...(lore ? { lore } : {}),
        }
      : null;
  return { data, de };
}
export const toJson = (value: unknown) => JSON.stringify(value, null, 2);

/** Messages a card author can act on. Errors block saving; warnings do not. */
export function validate(
  draft: Draft,
  existingIds: ReadonlySet<string>,
  hasArt: boolean,
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [],
    warnings: string[] = [];
  if (!draft.name.trim()) errors.push("Give the card an English name.");
  if (!slug.test(draft.id))
    errors.push('The ID must be lowercase words joined by dashes, for example "hearth-guard".');
  else if (draft.isNew && existingIds.has(draft.id))
    errors.push(`A card with the ID "${draft.id}" already exists.`);
  if (!hasArt) errors.push("Add card art (it is saved as data.png).");
  if (!draft.set) errors.push("Choose a set.");
  if (draft.type === "spell" && !draft.cast.length)
    errors.push("A spell needs at least one spell effect.");
  if (draft.type === "spell" && draft.modal && draft.cast.length < 2)
    errors.push("A modal spell needs at least two effects to choose from.");
  if (draft.type === "spell" && !draft.timing.length)
    errors.push("Choose when the spell can be played.");
  if (draft.type === "holding" && draft.defense < 1)
    errors.push("Holding Defense must be at least 1.");
  if (draft.type === "creature" && draft.defense < 0) errors.push("Defense cannot be negative.");
  if (!errors.length) {
    try {
      compileContent([{ ...serialize(draft).data, art: "/placeholder.png" }]);
    } catch (error) {
      const issues = (error as { issues?: { path?: { key: string }[]; message: string }[] }).issues;
      if (issues?.length)
        for (const issue of issues)
          errors.push(
            `${issue.path?.map((part) => part.key).join(" › ") || "Card"}: ${issue.message}`,
          );
      else errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (!draft.de.name.trim())
    warnings.push("No German name yet; the English name will be shown in German.");
  if (
    draft.type === "creature" &&
    !draft.outputs.some((pool) => Object.values(pool).some((n) => n > 0))
  )
    warnings.push("This creature produces no energy.");
  if (draft.legendary && draft.rarity !== "legendary")
    warnings.push("Legendary (one copy per deck) is set, but the rarity is not Legendary.");
  return { errors, warnings };
}

/** Param form fields for one ability, read from the generated JSON schema so they always match the game's rules. */
export type ParamField = {
  key: string;
  /** "multi" is a list of the allowed options, at least one of them. */
  kind: "number" | "text" | "choice" | "multi" | "boolean";
  options?: string[];
  min?: number;
  initial: unknown;
  /** A number, flag or choice the card may leave out. Flags are set by ticking them; a choice has an "Any" entry that omits it. */
  optional?: boolean;
  /** Whether a new binding starts with this field present. */
  seed: boolean;
};
export function paramFields(id: string): ParamField[] {
  const definition = (schema.definitions as Record<string, any>)[`ability-${id}`];
  const params = definition?.properties?.params ?? {};
  // "Either this set of parameters or that one" (for example at least one of two bonuses) lists each branch.
  const branches: any[] = params.anyOf ?? [params];
  const specs = new Map<string, any>();
  for (const branch of branches)
    for (const [key, spec] of Object.entries<any>(branch.properties ?? {}))
      if (!specs.has(key)) specs.set(key, spec);
  const needs = (branch: any, key: string) => ((branch.required ?? []) as string[]).includes(key);
  return [...specs].map(([key, spec]) => {
    const always = branches.every((branch) => needs(branch, key)),
      optional =
        !always &&
        (spec.type === "boolean" ||
          spec.type === "integer" ||
          spec.type === "number" ||
          !!spec.enum),
      seed = !optional || (branches.length > 1 && needs(branches[0], key));
    if (spec.enum)
      return {
        key,
        kind: "choice" as const,
        options: spec.enum as string[],
        initial: spec.enum[0],
        optional,
        seed,
      };
    if (spec.type === "array" && spec.items?.enum)
      return {
        key,
        kind: "multi" as const,
        options: spec.items.enum as string[],
        initial: [spec.items.enum[0]],
        seed,
      };
    if (spec.type === "boolean")
      return { key, kind: "boolean" as const, initial: true, optional, seed };
    if (spec.type === "integer" || spec.type === "number")
      return {
        key,
        kind: "number" as const,
        min: spec.minimum,
        initial: spec.minimum ?? 1,
        optional,
        seed,
      };
    return { key, kind: "text" as const, initial: "", seed };
  });
}
export const newBinding = (id: string): Binding => ({
  id,
  params: Object.fromEntries(
    paramFields(id)
      .filter((field) => field.seed)
      .map((field) => [field.key, field.initial]),
  ),
});

/** Abilities a card of this kind may carry: field abilities, or spell effects. */
/** Cast-only abilities (Damage, Raise…) do nothing on a field card, so the studio does not offer them there. */
const isSpellOnly = (a: {
  cast?: unknown;
  activate?: unknown;
  hooks?: unknown;
  before?: unknown;
  static?: unknown;
  canBlock?: unknown;
  intercepts?: unknown;
}) => !!a.cast && !a.activate && !a.hooks && !a.before && !a.static && !a.canBlock && !a.intercepts;
export function allowedAbilities(draft: Draft, slot: "field" | "cast" | "cost"): string[] {
  return Object.values(abilities)
    .filter((ability) => {
      if (slot === "cast") return !!ability.cast;
      // Spells can only carry abilities that change how they are played.
      if (slot === "cost") return !!ability.before?.["card.play.before"];
      if (isSpellOnly(ability)) return false;
      return true;
    })
    .map((ability) => ability.id)
    .sort();
}
/** The keyword name, or the ID read as words ("searchForCreatureOrHolding" is "Search for creature or holding"). */
export const abilityLabel = (id: string) => {
  const name = abilities[id]?.name;
  if (name) return name.replace(/\s*\{[^}]+\}/g, "");
  const words = id
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/-/g, " ")
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** What an ability does, for browsing. Keywords come first by themselves; a new ability without an entry lands in "Other". */
const abilityThemes: Record<string, string[]> = {
  "Damage and removal": [
    "damage",
    "barrage",
    "plague",
    "destroy",
    "charge",
    "scorch",
    "longshot",
    "weaken",
  ],
  "Bonuses and auras": [
    "rage",
    "steadfast",
    "bolster",
    "drillmaster",
    "bind",
    "fealty",
    "raid",
    "dirge",
    "prowess",
    "kindle",
  ],
  Energy: ["primal", "channel", "sacrifice", "trade", "accord", "consume", "return"],
  "Cards and library": [
    "draw",
    "muster",
    "searchForCreatureOrHolding",
    "hive",
    "ransack",
    "dark-harvest",
  ],
  "Board and life": [
    "bounce",
    "reprise",
    "refresh",
    "refresh-all",
    "raise",
    "wayfarer",
    "marches-rally",
    "heal",
    "rest",
  ],
};
export const keywordGroup = "Keywords";
export const themeOf = (id: string) =>
  abilities[id]?.name
    ? keywordGroup
    : (Object.entries(abilityThemes).find(([, ids]) => ids.includes(id))?.[0] ?? "Other");

/** The rules text of an ability with its parameters as placeholders (X, a subtype), so the picker shows what it does. */
export function abilityPreview(id: string, slot: "field" | "cast" | "cost"): string {
  const ability = abilities[id];
  if (!ability) return "";
  const params = Object.fromEntries(
    paramFields(id).map((field) => [
      field.key,
      field.kind === "number"
        ? "X"
        : field.kind === "boolean"
          ? false
          : field.kind === "choice"
            ? field.key === "energy"
              ? "faction"
              : field.options![0]
            : field.kind === "multi"
              ? field.options!.join("/")
              : field.key,
    ]),
  );
  return describeAbility({ id, params }, ability, slot === "field" ? "field" : undefined)
    .description;
}
/** The rules text of one card's binding, as the card will show it. */
export function bindingText(binding: Binding, slot: "field" | "cast" | "cost"): string {
  const ability = abilities[binding.id];
  if (!ability) return "";
  try {
    return describeAbility(
      { ...binding, params: { ...ability.defaults, ...binding.params } },
      ability,
      slot === "field" ? "field" : undefined,
    ).description;
  } catch {
    return abilityPreview(binding.id, slot);
  }
}

export type AbilityChoice = { id: string; title: string; text: string; keyword: boolean };
/** The abilities a slot offers, grouped for browsing: keywords first, then by theme, each group alphabetical. */
export function abilityChoices(
  draft: Draft,
  slot: "field" | "cast" | "cost",
): { group: string; items: AbilityChoice[] }[] {
  const groups = new Map<string, AbilityChoice[]>();
  for (const id of allowedAbilities(draft, slot)) {
    const group = themeOf(id);
    const item = {
      id,
      title: abilityLabel(id),
      text: abilityPreview(id, slot),
      keyword: group === keywordGroup,
    };
    groups.set(group, [...(groups.get(group) ?? []), item]);
  }
  const order = [keywordGroup, ...Object.keys(abilityThemes), "Other"];
  return order
    .filter((group) => groups.has(group))
    .map((group) => ({
      group,
      items: groups.get(group)!.sort((a, b) => a.title.localeCompare(b.title)),
    }));
}
export const energyTypes = [...factionIds, "neutral"];

/** Filters for the card list. An empty string means "any". */
export type Filters = {
  query: string;
  faction: string;
  set: string;
  type: string;
  rarity: string;
  show: "" | "no-art" | "no-german";
};
export const noFilters: Filters = {
  query: "",
  faction: "",
  set: "",
  type: "",
  rarity: "",
  show: "",
};
export type Stored = {
  folder: string;
  data: Record<string, any>;
  de?: Record<string, any>;
  art?: Blob;
};

/** The named factions on a card; neutral is not one. */
export const named = (data: Record<string, any>): string[] =>
  ((data.factions as string[] | undefined) ?? []).filter((id) => id !== "neutral");
/** Two or more named factions. */
export const isHybrid = (data: Record<string, any>) => named(data).length > 1;
export const affiliation = (data: Record<string, any>) => named(data)[0] ?? "neutral";
/** A card's row in the set table: its faction, 'neutral', or the sorted pair for a hybrid ("a+b"). */
export const groupOf = (data: Record<string, any>, order: string[]) =>
  named(data).length
    ? [...named(data)].sort((a, b) => order.indexOf(a) - order.indexOf(b)).join("+")
    : "neutral";
export const costOf = (data: Record<string, any>) =>
  (data.cost?.generic ?? 0) +
  Object.values((data.cost?.factions ?? {}) as Record<string, number>).reduce(
    (sum, n) => sum + n,
    0,
  );

/** Faction filter values: a faction id, 'neutral', 'hybrid' (any hybrid) or 'a+b' (that exact hybrid). A hybrid also matches each of its factions. */
export function factionMatches(data: Record<string, any>, wanted: string): boolean {
  if (!wanted) return true;
  const factions = named(data);
  if (wanted === "neutral") return !factions.length;
  if (wanted === "hybrid") return factions.length > 1;
  if (wanted.includes("+")) {
    const parts = wanted.split("+");
    return factions.length === parts.length && parts.every((id) => factions.includes(id));
  }
  return factions.includes(wanted);
}
/** A German name is missing, or the card has English lore without a German version. */
export const germanIncomplete = (card: Stored) =>
  !card.de?.name || (!!card.data.lore && !card.de?.lore);
/** List order: single factions in game order, then neutral, then hybrids; within that by total cost, then name. */
export function compareCards(a: Stored, b: Stored, factionOrder: string[]): number {
  const rank = (data: Record<string, any>) => {
    const members = named(data);
    return [
      members.length === 0 ? 1 : members.length === 1 ? 0 : 2,
      ...[...members].map((id) => factionOrder.indexOf(id)).sort((x, y) => x - y),
    ];
  };
  const left = rank(a.data),
    right = rank(b.data);
  for (let i = 0; i < Math.max(left.length, right.length); i++)
    if ((left[i] ?? -1) !== (right[i] ?? -1)) return (left[i] ?? -1) - (right[i] ?? -1);
  return costOf(a.data) - costOf(b.data) || a.data.name.localeCompare(b.data.name);
}
/** The numbers worth seeing in a list: cost, Attack/Defense and the best single energy output. */
export function glance(data: Record<string, any>): string {
  const parts = [`Cost ${costOf(data)}`];
  if (data.type !== "spell" && data.stats) {
    parts.push(`${data.stats.attack ?? 0}/${data.stats.defense ?? 0}`);
    const output = Math.max(
      0,
      ...((data.stats.energyOutputs ?? []) as Record<string, number>[]).map((pool) =>
        Object.values(pool).reduce((sum, n) => sum + n, 0),
      ),
    );
    if (output) parts.push(`⚡${output}`);
  }
  return parts.join(" · ");
}
export function matches(card: Stored, filters: Filters): boolean {
  const { data } = card,
    query = filters.query.toLowerCase().trim();
  return (
    (!query ||
      data.name.toLowerCase().includes(query) ||
      card.de?.name?.toLowerCase().includes(query) ||
      data.id.includes(query)) &&
    factionMatches(data, filters.faction) &&
    (!filters.set || data.set === filters.set) &&
    (!filters.type || data.type === filters.type) &&
    (!filters.rarity || data.rarity === filters.rarity) &&
    (filters.show !== "no-art" || !card.art) &&
    (filters.show !== "no-german" || germanIncomplete(card))
  );
}

/** Counts for one set, for judging whether it is balanced and finished. */
export type Rarity = "legendary" | "rare" | "common";
export type FactionRow = {
  /** A faction id, 'neutral', or 'a+b' for a hybrid. */
  id: string;
  members: string[];
  creature: number;
  spell: number;
  holding: number;
  total: number;
  rarity: Record<Rarity, number>;
  /** Creatures that cost nothing: the opening economy. */
  free: Record<Rarity, number>;
  legendaryCreatures: number;
};
export type SetStats = {
  total: number;
  legendary: number;
  curveMax: number;
  type: Record<string, number>;
  rarity: Record<string, number>;
  /** Per affiliation (neutral last): cards by type. */
  factions: FactionRow[];
  /** Cards at each total cost; the last bucket is "N or more". */
  curve: Record<string, number>[];
  /** The same cost buckets, split by rarity. */
  curveRarity: Record<Rarity, number>[];
  /** Cards of each type by rarity. */
  typeRarity: Record<string, Record<Rarity, number>>;
  /** Average cost, Attack, Defense and best single energy output of the creatures (all 0 without creatures). */
  creatures: { count: number; cost: number; attack: number; defense: number; output: number };
  missingArt: string[];
  missingGerman: string[];
  /** How many hybrid cards include each faction (also counted in the hybrid rows). */
  hybridIn: Record<string, number>;
  hybrids: number;
};
export function setStats(cards: Stored[], factionOrder: string[], curveMax = 7): SetStats {
  const stats: SetStats = {
    total: cards.length,
    legendary: 0,
    curveMax,
    type: {},
    rarity: {},
    factions: [],
    curve: Array.from({ length: curveMax + 1 }, () => ({})),
    curveRarity: Array.from({ length: curveMax + 1 }, () => ({ legendary: 0, rare: 0, common: 0 })),
    typeRarity: {
      creature: { legendary: 0, rare: 0, common: 0 },
      spell: { legendary: 0, rare: 0, common: 0 },
      holding: { legendary: 0, rare: 0, common: 0 },
    },
    creatures: { count: 0, cost: 0, attack: 0, defense: 0, output: 0 },
    missingArt: [],
    missingGerman: [],
    hybridIn: {},
    hybrids: 0,
  };
  const blank = (id: string): FactionRow => ({
    id,
    members: id === "neutral" ? [] : id.split("+"),
    creature: 0,
    spell: 0,
    holding: 0,
    total: 0,
    rarity: { legendary: 0, rare: 0, common: 0 },
    free: { legendary: 0, rare: 0, common: 0 },
    legendaryCreatures: 0,
  });
  const rows = new Map<string, FactionRow>();
  for (const id of [...factionOrder, "neutral"]) rows.set(id, blank(id));
  for (const { data, de, art } of cards) {
    stats.type[data.type] = (stats.type[data.type] ?? 0) + 1;
    stats.rarity[data.rarity] = (stats.rarity[data.rarity] ?? 0) + 1;
    if (data.legendary) stats.legendary += 1;
    const group = groupOf(data, factionOrder);
    if (isHybrid(data)) {
      stats.hybrids += 1;
      for (const id of named(data)) stats.hybridIn[id] = (stats.hybridIn[id] ?? 0) + 1;
    }
    const row = rows.get(group) ?? (rows.set(group, blank(group)), rows.get(group)!);
    (row as any)[data.type] += 1;
    row.total += 1;
    row.rarity[data.rarity as Rarity] += 1;
    if (data.type === "creature") {
      if (costOf(data) === 0) row.free[data.rarity as Rarity] += 1;
      if (data.rarity === "legendary") row.legendaryCreatures += 1;
    }
    const bucket = stats.curve[Math.min(curveMax, costOf(data))];
    bucket[data.type] = (bucket[data.type] ?? 0) + 1;
    stats.curveRarity[Math.min(curveMax, costOf(data))][data.rarity as Rarity] += 1;
    (stats.typeRarity[data.type] ??= { legendary: 0, rare: 0, common: 0 })[data.rarity as Rarity] +=
      1;
    if (data.type === "creature") {
      const outputs = (data.stats?.energyOutputs ?? []) as Record<string, number>[];
      stats.creatures.count += 1;
      stats.creatures.cost += costOf(data);
      stats.creatures.attack += data.stats?.attack ?? 0;
      stats.creatures.defense += data.stats?.defense ?? 0;
      stats.creatures.output += Math.max(
        0,
        ...outputs.map((pool) => Object.values(pool).reduce((sum, n) => sum + n, 0)),
      );
    }
    if (!art) stats.missingArt.push(data.name);
    if (germanIncomplete({ data, de } as Stored)) stats.missingGerman.push(data.name);
  }
  if (stats.creatures.count)
    for (const key of ["cost", "attack", "defense", "output"] as const)
      stats.creatures[key] /= stats.creatures.count;
  // Single factions in game order, then neutral, then hybrid pairs in game order.
  const all = [...rows.values()],
    rank = (row: FactionRow) => row.members.map((id) => factionOrder.indexOf(id)).join(",");
  stats.factions = [
    ...all.filter((row) => row.members.length === 1),
    ...all.filter((row) => row.id === "neutral" && row.total),
    ...all.filter((row) => row.members.length > 1).sort((a, b) => rank(a).localeCompare(rank(b))),
  ];
  return stats;
}
