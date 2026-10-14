import { compileContent } from '../../../packages/content/src/compiler';
import { abilities } from '../../../packages/extensions/src';
import { factions as factionIds } from '../../../packages/content/src/factions';
import schema from '../../../assets/schemas/card.schema.json';

export type Binding = { id: string; params: Record<string, unknown> };
export type CardKind = 'creature' | 'spell' | 'holding';
export type Timing = 'play' | 'death';
/** Everything the form edits. Neutral cards have no factions; stats and outputs only apply to field cards. */
export type Draft = {
  isNew: boolean; folder: string; id: string; revision: number; name: string; deckLimitKey: string; type: CardKind;
  set: string; rarity: 'common' | 'rare' | 'legendary'; legendary: boolean; factions: string[]; subtypes: string[];
  cost: { generic: number; factions: Record<string, number> };
  attack: number; defense: number; outputs: Record<string, number>[];
  abilities: Binding[]; timing: Timing[]; cast: Binding[];
  lore: string; de: { name: string; lore: string };
};

export const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const slugify = (text: string) => text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function newDraft(set = 'foundations', faction = ''): Draft {
  return { isNew: true, folder: '', id: '', revision: 1, name: '', deckLimitKey: '', type: 'creature', set, rarity: 'common', legendary: false,
    factions: faction.split('+').filter(id => id && id !== 'neutral'), subtypes: [], cost: { generic: 0, factions: {} }, attack: 1, defense: 1, outputs: [], abilities: [], timing: ['play'], cast: [], lore: '', de: { name: '', lore: '' } };
}

type Json = Record<string, any>;
/** Reads one card's data.json (and optional data.de.json) into form state. Unknown fields are not carried over. */
export function draftFromFiles(folder: string, data: Json, de?: Json): Draft {
  const base = newDraft(data.set);
  return { ...base, isNew: false, folder, id: data.id, revision: data.revision ?? 1, name: data.name ?? '', deckLimitKey: data.deckLimitKey ?? data.id,
    type: data.type, rarity: data.rarity, legendary: !!data.legendary, factions: [...(data.factions ?? [])].filter((id: string) => id !== 'neutral'), subtypes: [...(data.subtypes ?? [])],
    cost: { generic: data.cost?.generic ?? 0, factions: { ...(data.cost?.factions ?? {}) } },
    attack: data.stats?.attack ?? 0, defense: data.stats?.defense ?? 1, outputs: (data.stats?.energyOutputs ?? []).map((pool: Record<string, number>) => ({ ...pool })),
    abilities: (data.abilities ?? []).map((b: Binding) => ({ id: b.id, params: { ...b.params } })), timing: [...(data.timing ?? [])], cast: (data.cast ?? []).map((b: Binding) => ({ id: b.id, params: { ...b.params } })),
    lore: data.lore ?? '', de: { name: de?.name ?? '', lore: de?.lore ?? '' } };
}

const positive = (record: Record<string, number>) => Object.fromEntries(Object.entries(record).filter(([, n]) => n > 0));
/** The exact JSON written to disk, in the order existing card files use. */
export function serialize(draft: Draft): { data: Json; de: Json | null } {
  const field = draft.type !== 'spell';
  const data: Json = {
    $schema: '../../schemas/card.schema.json', id: draft.id, revision: draft.revision, name: draft.name.trim(), deckLimitKey: draft.deckLimitKey || draft.id,
    type: draft.type, factions: draft.factions.length ? draft.factions : ['neutral'], subtypes: draft.subtypes, legendary: draft.legendary, rarity: draft.rarity,
    cost: { generic: draft.cost.generic },
  };
  const paid = positive(Object.fromEntries(Object.entries(draft.cost.factions).filter(([id]) => draft.factions.includes(id))));
  if (Object.keys(paid).length) data.cost.factions = paid;
  const outputs = draft.type === 'creature' ? draft.outputs.map(positive).filter(pool => Object.keys(pool).length) : [];
  if (field) data.stats = { attack: draft.attack, defense: draft.defense, ...(outputs.length ? { energyOutputs: outputs } : {}) };
  data.abilities = field ? draft.abilities : [];
  if (!field) { data.timing = draft.timing; data.cast = draft.cast; }
  if (draft.lore.trim()) data.lore = draft.lore.trim();
  data.set = draft.set;
  const name = draft.de.name.trim(), lore = draft.de.lore.trim();
  const de = name || lore ? { $schema: '../../schemas/card-translation.schema.json', name: name || draft.name.trim(), ...(lore ? { lore } : {}) } : null;
  return { data, de };
}
export const toJson = (value: unknown) => JSON.stringify(value, null, 2);

/** Messages a card author can act on. Errors block saving; warnings do not. */
export function validate(draft: Draft, existingIds: ReadonlySet<string>, hasArt: boolean): { errors: string[]; warnings: string[] } {
  const errors: string[] = [], warnings: string[] = [];
  if (!draft.name.trim()) errors.push('Give the card an English name.');
  if (!slug.test(draft.id)) errors.push('The ID must be lowercase words joined by dashes, for example "hearth-guard".');
  else if (draft.isNew && existingIds.has(draft.id)) errors.push(`A card with the ID "${draft.id}" already exists.`);
  if (!hasArt) errors.push('Add card art (it is saved as data.png).');
  if (!draft.set) errors.push('Choose a set.');
  if (draft.type === 'spell' && !draft.cast.length) errors.push('A spell needs at least one spell effect.');
  if (draft.type === 'spell' && !draft.timing.length) errors.push('Choose when the spell can be played.');
  if (draft.type === 'creature' && draft.defense < 1) errors.push('Defense must be at least 1.');
  if (!errors.length) {
    try { compileContent([{ ...serialize(draft).data, art: '/placeholder.png' }]); }
    catch (error) {
      const issues = (error as { issues?: { path?: { key: string }[]; message: string }[] }).issues;
      if (issues?.length) for (const issue of issues) errors.push(`${issue.path?.map(part => part.key).join(' › ') || 'Card'}: ${issue.message}`);
      else errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (!draft.de.name.trim()) warnings.push('No German name yet; the English name will be shown in German.');
  if (draft.type === 'creature' && !draft.outputs.some(pool => Object.values(pool).some(n => n > 0))) warnings.push('This creature produces no energy.');
  if (draft.legendary && draft.rarity !== 'legendary') warnings.push('Legendary (one copy per deck) is set, but the rarity is not Legendary.');
  return { errors, warnings };
}

/** Param form fields for one ability, read from the generated JSON schema so they always match the game's rules. */
export type ParamField = { key: string; kind: 'number' | 'text' | 'choice'; options?: string[]; min?: number; initial: unknown };
export function paramFields(id: string): ParamField[] {
  const definition = (schema.definitions as Record<string, any>)[`ability-${id}`];
  const properties: Record<string, any> = definition?.properties?.params?.properties ?? {};
  return Object.entries(properties).map(([key, spec]) => {
    if (spec.enum) return { key, kind: 'choice' as const, options: spec.enum as string[], initial: spec.enum[0] };
    if (spec.type === 'integer' || spec.type === 'number') return { key, kind: 'number' as const, min: spec.minimum, initial: spec.minimum ?? 1 };
    return { key, kind: 'text' as const, initial: '' };
  });
}
export const newBinding = (id: string): Binding => ({ id, params: Object.fromEntries(paramFields(id).map(field => [field.key, field.initial])) });

/** Abilities a card of this kind may carry: field abilities, or spell effects. */
export function allowedAbilities(draft: Draft, slot: 'field' | 'cast'): string[] {
  return Object.values(abilities).filter(ability => {
    if (slot === 'cast') return !!ability.cast;
    if (draft.type === 'holding' && ability.activationEnergy) return false;
    if (ability.faction && (ability.faction === 'neutral' ? draft.factions.length !== 0 : !draft.factions.includes(ability.faction))) return false;
    return true;
  }).map(ability => ability.id).sort();
}
export const abilityLabel = (id: string) => (abilities[id]?.name ?? id).replace(/\s*\{[^}]+\}/g, '');
export const energyTypes = [...factionIds, 'neutral'];

/** Filters for the card list. An empty string means "any". */
export type Filters = { query: string; faction: string; set: string; type: string; rarity: string; show: '' | 'no-art' | 'no-german' };
export const noFilters: Filters = { query: '', faction: '', set: '', type: '', rarity: '', show: '' };
export type Stored = { folder: string; data: Record<string, any>; de?: Record<string, any>; art?: Blob };

/** The named factions on a card; neutral is not one. */
export const named = (data: Record<string, any>): string[] => ((data.factions as string[] | undefined) ?? []).filter(id => id !== 'neutral');
/** Two or more named factions. */
export const isHybrid = (data: Record<string, any>) => named(data).length > 1;
export const affiliation = (data: Record<string, any>) => named(data)[0] ?? 'neutral';
/** A card's row in the set table: its faction, 'neutral', or the sorted pair for a hybrid ("a+b"). */
export const groupOf = (data: Record<string, any>, order: string[]) => named(data).length ? [...named(data)].sort((a, b) => order.indexOf(a) - order.indexOf(b)).join('+') : 'neutral';
export const costOf = (data: Record<string, any>) => (data.cost?.generic ?? 0) + Object.values((data.cost?.factions ?? {}) as Record<string, number>).reduce((sum, n) => sum + n, 0);

/** Faction filter values: a faction id, 'neutral', 'hybrid' (any hybrid) or 'a+b' (that exact hybrid). A hybrid also matches each of its factions. */
export function factionMatches(data: Record<string, any>, wanted: string): boolean {
  if (!wanted) return true;
  const factions = named(data);
  if (wanted === 'neutral') return !factions.length;
  if (wanted === 'hybrid') return factions.length > 1;
  if (wanted.includes('+')) { const parts = wanted.split('+'); return factions.length === parts.length && parts.every(id => factions.includes(id)); }
  return factions.includes(wanted);
}
/** A German name is missing, or the card has English lore without a German version. */
export const germanIncomplete = (card: Stored) => !card.de?.name || (!!card.data.lore && !card.de?.lore);
export function matches(card: Stored, filters: Filters): boolean {
  const { data } = card, query = filters.query.toLowerCase().trim();
  return (!query || data.name.toLowerCase().includes(query) || card.de?.name?.toLowerCase().includes(query) || data.id.includes(query))
    && factionMatches(data, filters.faction)
    && (!filters.set || data.set === filters.set)
    && (!filters.type || data.type === filters.type)
    && (!filters.rarity || data.rarity === filters.rarity)
    && (filters.show !== 'no-art' || !card.art)
    && (filters.show !== 'no-german' || germanIncomplete(card));
}

/** Counts for one set, for judging whether it is balanced and finished. */
export type Rarity = 'legendary' | 'rare' | 'common';
export type FactionRow = {
  /** A faction id, 'neutral', or 'a+b' for a hybrid. */
  id: string; members: string[]; creature: number; spell: number; holding: number; total: number;
  rarity: Record<Rarity, number>;
  /** Creatures that cost nothing: the opening economy. */
  free: Record<Rarity, number>;
  legendaryCreatures: number;
};
export type SetStats = {
  total: number; legendary: number; curveMax: number;
  type: Record<string, number>; rarity: Record<string, number>;
  /** Per affiliation (neutral last): cards by type. */
  factions: FactionRow[];
  /** Cards at each total cost; the last bucket is "N or more". */
  curve: Record<string, number>[];
  missingArt: string[]; missingGerman: string[];
  /** How many hybrid cards include each faction (also counted in the hybrid rows). */
  hybridIn: Record<string, number>;
  hybrids: number;
};
export function setStats(cards: Stored[], factionOrder: string[], curveMax = 7): SetStats {
  const stats: SetStats = { total: cards.length, legendary: 0, curveMax, type: {}, rarity: {}, factions: [], curve: Array.from({ length: curveMax + 1 }, () => ({})), missingArt: [], missingGerman: [], hybridIn: {}, hybrids: 0 };
  const blank = (id: string): FactionRow => ({ id, members: id === 'neutral' ? [] : id.split('+'), creature: 0, spell: 0, holding: 0, total: 0, rarity: { legendary: 0, rare: 0, common: 0 }, free: { legendary: 0, rare: 0, common: 0 }, legendaryCreatures: 0 });
  const rows = new Map<string, FactionRow>();
  for (const id of [...factionOrder, 'neutral']) rows.set(id, blank(id));
  for (const { data, de, art } of cards) {
    stats.type[data.type] = (stats.type[data.type] ?? 0) + 1;
    stats.rarity[data.rarity] = (stats.rarity[data.rarity] ?? 0) + 1;
    if (data.legendary) stats.legendary += 1;
    const group = groupOf(data, factionOrder);
    if (isHybrid(data)) { stats.hybrids += 1; for (const id of named(data)) stats.hybridIn[id] = (stats.hybridIn[id] ?? 0) + 1; }
    const row = rows.get(group) ?? (rows.set(group, blank(group)), rows.get(group)!);
    (row as any)[data.type] += 1; row.total += 1; row.rarity[data.rarity as Rarity] += 1;
    if (data.type === 'creature') { if (costOf(data) === 0) row.free[data.rarity as Rarity] += 1; if (data.rarity === 'legendary') row.legendaryCreatures += 1; }
    const bucket = stats.curve[Math.min(curveMax, costOf(data))];
    bucket[data.type] = (bucket[data.type] ?? 0) + 1;
    if (!art) stats.missingArt.push(data.name);
    if (germanIncomplete({ data, de } as Stored)) stats.missingGerman.push(data.name);
  }
  // Single factions in game order, then neutral, then hybrid pairs in game order.
  const all = [...rows.values()], rank = (row: FactionRow) => row.members.map(id => factionOrder.indexOf(id)).join(',');
  stats.factions = [...all.filter(row => row.members.length === 1), ...all.filter(row => row.id === 'neutral' && row.total), ...all.filter(row => row.members.length > 1).sort((a, b) => rank(a).localeCompare(rank(b)))];
  return stats;
}
