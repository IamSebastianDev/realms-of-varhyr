import {
  cardFinishes,
  isCardFinish,
  type CardFinish,
  type CardAppearance,
} from "@realms/renderer/cardFinishes";

export type CardStyleCollection = {
  unlocked: Partial<Record<CardFinish, string[]>>;
  equipped: Record<string, CardAppearance>;
};
const validId = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[a-z0-9][a-z0-9-]*$/.test(value) &&
  value !== "constructor" &&
  value !== "prototype";
const ids = (input: unknown): string[] =>
  Array.isArray(input) ? [...new Set(input.filter(validId))] : [];
const record = (input: unknown): Record<string, unknown> =>
  input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};

/** Malformed optional cosmetics cannot invalidate an otherwise valid account save. */
export function parseCardStyles(value: unknown): CardStyleCollection | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const source = record(value),
    saved = record(source.unlocked);
  const unlocked: CardStyleCollection["unlocked"] = {};
  for (const finish of cardFinishes) {
    const owned = ids(saved[finish]);
    // The earlier etched experiment became basic foil, not the new Etched Foil finish.
    if (finish === "foil") owned.push(...ids(source.foil), ...ids(source.etched));
    if (owned.length) unlocked[finish] = [...new Set(owned)];
  }
  const equipped: CardStyleCollection["equipped"] = {};
  const candidates = Array.isArray(source.equipped)
    ? ids(source.equipped).map((id) => [id, "foil"] as const)
    : Object.entries(record(source.equipped));
  for (const [id, finish] of candidates) {
    if (
      validId(id) &&
      (finish === "original" || (isCardFinish(finish) && unlocked[finish]?.includes(id)))
    )
      equipped[id] = finish;
  }
  return { unlocked, equipped };
}
