import * as v from "valibot";

/** A faction as authored in assets/factions/<id>.json. Pure data; no filesystem access. */
const slug = v.pipe(
  v.string(),
  v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, digits and hyphens."),
);
const text = v.pipe(v.string(), v.trim(), v.minLength(1, "Required."));

export const factionSchema = v.strictObject({
  id: slug,
  name: text,
  /** Short label used on card faces. */
  short: text,
  color: v.pipe(v.string(), v.regex(/^#[0-9a-fA-F]{6}$/, "Use a #rrggbb color.")),
  /** Optional short note on how the faction plays in the Faction draft: what to take early, what it wants to do. */
  draft: v.optional(text),
  /** Optional store booster that draws only this faction's cards. The pack ID is stable once players own packs. */
  pack: v.optional(v.strictObject({ id: slug, name: text, blurb: text })),
  /** Optional starter deck for this faction: card ID -> copies. The deck ID is stable once decks are saved. */
  starter: v.optional(
    v.strictObject({
      id: slug,
      name: text,
      /** The deck new players begin with. At most one faction may set this; otherwise the first starter (by faction ID) is used. */
      default: v.optional(v.boolean()),
      cards: v.pipe(
        v.record(slug, v.pipe(v.number(), v.integer(), v.minValue(1))),
        v.check((cards) => Object.keys(cards).length > 0, "A starter deck needs cards."),
      ),
    }),
  ),
});

export type FactionDefinition = v.InferOutput<typeof factionSchema>;

export function parseFactionDefinition(data: unknown): FactionDefinition {
  const result = v.safeParse(factionSchema, data);
  if (result.success) return result.output;
  throw new Error(
    result.issues
      .map(
        (issue) =>
          `${issue.path?.map((part) => part.key).join(".") || "definition"}: ${issue.message}`,
      )
      .join("; "),
  );
}

/** Neutral cards have no named faction and pay with generic energy. The rules are built in; its look is authored like any faction. */
export const neutralId = "neutral";

/** Cross-faction rules: unique faction, pack and starter IDs. Returns the list sorted by ID. */
export function validateFactionSet(factions: FactionDefinition[]): FactionDefinition[] {
  const seen = {
    id: new Map<string, string>(),
    pack: new Map<string, string>(),
    starter: new Map<string, string>(),
  };
  for (const faction of factions) {
    for (const [kind, value] of [
      ["id", faction.id],
      ["pack", faction.pack?.id],
      ["starter", faction.starter?.id],
    ] as const) {
      if (value === undefined) continue;
      const previous = seen[kind].get(value);
      if (previous)
        throw new Error(
          `Faction '${faction.id}' reuses the ${kind === "pack" ? "booster pack ID" : kind === "starter" ? "starter deck ID" : kind} '${value}' of '${previous}'.`,
        );
      seen[kind].set(value, faction.id);
    }
    if (faction.pack?.id === "bounty")
      throw new Error(`Faction '${faction.id}' uses the reserved booster pack ID 'bounty'.`);
  }
  const defaults = factions.filter((faction) => faction.starter?.default);
  if (defaults.length > 1)
    throw new Error(
      `Only one faction can mark its starter deck as the default: ${defaults.map((faction) => faction.id).join(", ")}.`,
    );
  if (!factions.some((faction) => faction.id === neutralId))
    throw new Error(
      `Missing the built-in '${neutralId}' faction. Add ${neutralId}.json (name, short, color).`,
    );
  return [...factions].sort((a, b) => (a.id < b.id ? -1 : 1));
}
