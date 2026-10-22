import * as v from "valibot";
import type { FactionDefinition } from "./factionDefinition";
const slug = v.pipe(v.string(), v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/));
const text = v.pipe(v.string(), v.trim(), v.minLength(1));
const pack = v.strictObject({ id: slug, name: text, blurb: text });
const translated = v.strictObject({
  name: v.optional(text),
  description: v.optional(text),
  pack: v.optional(v.strictObject({ name: v.optional(text), blurb: v.optional(text) })),
});
/** A set groups logical cards. Faction focus is descriptive, never a deck or membership restriction. */
export const setSchema = v.strictObject({
  id: slug,
  name: text,
  code: v.pipe(text, v.regex(/^[A-Z0-9]{2,5}$/)),
  description: text,
  color: v.pipe(v.string(), v.regex(/^#[0-9a-fA-F]{6}$/)),
  symbol: v.pipe(text, v.maxLength(4)),
  factions: v.optional(v.array(slug), []),
  introduces: v.optional(v.array(slug), []),
  pack: v.optional(pack),
  translations: v.optional(v.record(v.picklist(["en", "de"]), translated)),
});
export type SetDefinition = v.InferOutput<typeof setSchema>;
export function parseSetDefinition(input: unknown): SetDefinition {
  const result = v.safeParse(setSchema, input);
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
export function validateSetDefinitions(
  sets: readonly SetDefinition[],
  factions: readonly FactionDefinition[],
): SetDefinition[] {
  const ids = new Set<string>(),
    codes = new Set<string>();
  const packIds = new Set([
    "bounty",
    ...factions.flatMap((faction) => (faction.pack ? [faction.pack.id] : [])),
  ]);
  const factionIds = new Set(factions.map((faction) => faction.id));
  for (const set of sets) {
    if (ids.has(set.id)) throw new Error(`Duplicate set ID '${set.id}'.`);
    if (codes.has(set.code)) throw new Error(`Duplicate set code '${set.code}'.`);
    ids.add(set.id);
    codes.add(set.code);
    for (const id of [...set.factions, ...set.introduces])
      if (!factionIds.has(id))
        throw new Error(
          `Set '${set.id}' references unknown faction '${id}'. Add its faction definition first.`,
        );
    if (set.pack) {
      if (packIds.has(set.pack.id))
        throw new Error(`Set '${set.id}' reuses booster pack ID '${set.pack.id}'.`);
      packIds.add(set.pack.id);
    }
  }
  return [...sets].sort((a, b) => a.id.localeCompare(b.id));
}
