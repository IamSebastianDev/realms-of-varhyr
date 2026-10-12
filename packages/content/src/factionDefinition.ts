import * as v from 'valibot';

/** A faction as authored in assets/factions/<id>.json. Pure data; no filesystem access. */
const slug = v.pipe(v.string(), v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, digits and hyphens.'));
const text = v.pipe(v.string(), v.trim(), v.minLength(1, 'Required.'));

export const factionSchema = v.strictObject({
  id: v.pipe(slug, v.check(id => id !== 'neutral', "'neutral' is built in and cannot be redefined.")),
  name: text,
  /** Short label used on card faces. */
  short: text,
  color: v.pipe(v.string(), v.regex(/^#[0-9a-fA-F]{6}$/, 'Use a #rrggbb color.')),
  /** One distinct character shown next to the faction's energy and on its booster pack. */
  symbol: v.pipe(text, v.maxLength(4)),
  /** Optional store booster that draws only this faction's cards. The pack ID is stable once players own packs. */
  pack: v.optional(v.strictObject({ id: slug, name: text, blurb: text })),
});

export type FactionDefinition = v.InferOutput<typeof factionSchema>;

export function parseFactionDefinition(data: unknown): FactionDefinition {
  const result = v.safeParse(factionSchema, data);
  if (result.success) return result.output;
  throw new Error(result.issues.map(issue => `${issue.path?.map(part => part.key).join('.') || 'definition'}: ${issue.message}`).join('; '));
}

/** Cross-faction rules: unique IDs, symbols and pack IDs. Returns the list sorted by ID. */
export function validateFactionSet(factions: FactionDefinition[]): FactionDefinition[] {
  const seen = { id: new Map<string, string>(), symbol: new Map<string, string>(), pack: new Map<string, string>() };
  for (const faction of factions) {
    for (const [kind, value] of [['id', faction.id], ['symbol', faction.symbol], ['pack', faction.pack?.id]] as const) {
      if (value === undefined) continue;
      const previous = seen[kind].get(value);
      if (previous) throw new Error(`Faction '${faction.id}' reuses the ${kind === 'pack' ? 'booster pack ID' : kind} '${value}' of '${previous}'.`);
      seen[kind].set(value, faction.id);
    }
    if (faction.symbol === '◇') throw new Error(`Faction '${faction.id}' uses ◇, which is reserved for Neutral.`);
    if (faction.pack?.id === 'bounty') throw new Error(`Faction '${faction.id}' uses the reserved booster pack ID 'bounty'.`);
  }
  return [...factions].sort((a, b) => a.id < b.id ? -1 : 1);
}
