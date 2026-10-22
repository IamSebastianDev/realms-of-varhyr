/** Legacy test-booster format, read only for migration. Live grants now use collection.ts. */
export const rewardsKey = "varhir-booster-rewards-v1";
export type RewardCollection = {
  version: 1;
  boostersOpened: number;
  counts: Record<string, number>;
};
export type BoosterCardReward = { id: string; isNew: boolean; copies: number };

export function emptyRewards(): RewardCollection {
  return { version: 1, boostersOpened: 0, counts: {} };
}

/** Retain rewards for retired cards, too, so content edits do not erase ownership. */
export function parseRewards(raw: string | null): RewardCollection {
  try {
    const data = JSON.parse(raw ?? "null");
    if (
      !data ||
      data.version !== 1 ||
      !Number.isSafeInteger(data.boostersOpened) ||
      data.boostersOpened < 0 ||
      !data.counts ||
      typeof data.counts !== "object" ||
      Array.isArray(data.counts)
    )
      return emptyRewards();
    const entries = Object.entries(data.counts);
    if (
      !entries.every(
        ([id, count]) =>
          id.length && typeof count === "number" && Number.isSafeInteger(count) && count > 0,
      )
    )
      return emptyRewards();
    return {
      version: 1,
      boostersOpened: data.boostersOpened,
      counts: Object.fromEntries(entries) as Record<string, number>,
    };
  } catch {
    return emptyRewards();
  }
}

/** One immutable grant per opened pack; revealing or dismissing it never grants again. */
export function grantBooster(collection: RewardCollection, ids: string[]) {
  const counts = { ...collection.counts };
  const cards: BoosterCardReward[] = ids.map((id) => {
    const previous = Object.hasOwn(counts, id) ? counts[id] : 0;
    counts[id] = previous + 1;
    return { id, isNew: previous === 0, copies: counts[id] };
  });
  return {
    collection: { version: 1 as const, boostersOpened: collection.boostersOpened + 1, counts },
    cards,
  };
}
