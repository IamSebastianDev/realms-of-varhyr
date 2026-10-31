/** Provisional tuning for adventures. Everything a designer would want to turn lives here; an adventure can override the shop. */
export const adventureRules = {
  /** Adventures begin with a smaller deck which grows throughout the run. */
  minimumCards: 20,
  /** Silver belongs to the run. */
  startSilver: 20,
  battleSilver: [10, 16] as const,
  eliteSilver: [20, 30] as const,
  /** Cards offered after a win: `size` shown, `pick` taken. */
  battlePick: { size: 3, pick: 1 },
  elitePick: { size: 5, pick: 1 },
  improvePick: { size: 3, pick: 1 },
  shopSize: 5,
  shopPrice: { common: 15, rare: 35, legendary: 80 } as const,
  rarityWeights: { common: 70, rare: 25, legendary: 5 } as const,
  /** An elite's reward leans rarer. */
  eliteRarityWeights: { common: 40, rare: 45, legendary: 15 } as const,
} as const;
