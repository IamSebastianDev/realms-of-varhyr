/** Provisional tuning for expeditions. Everything a designer would want to turn lives here. */
export const questRules = {
  /** A match starts both sides at 10 life; an expedition can never carry more than that into a fight. */
  maxLife: 10,
  /** 9 producers plus core cards, fixed by the faction. */
  baseDeck: 15,
  baseProducers: 8,
  draftPicks: 15,
  packSize: 5,
  /** The deck can never be destroyed below this many cards. */
  minDeck: 30,
  /** Silver belongs to the expedition. */
  startSilver: 30,
  fightSilver: [12, 20] as const,
  arenaSilver: [30, 45] as const,
  fightPick: { size: 3, pick: 1 },
  arenaPick: { size: 5, pick: 1 },
  foundPick: { size: 3, pick: 1 },
  exchangePick: { size: 3, pick: 1 },
  foundSilver: [20, 35] as const,
  /** Healing costs silver: a city charges more than a roadside camp. */
  cityHealSilverPerLife: 6,
  campHealSilverPerLife: 4,
  shopSize: 5,
  shopPrice: { common: 15, rare: 35, legendary: 80 } as const,
  /** After the expedition, spend the remaining silver to keep copies from its final deck. A smith pays half of this, rounded down. */
  keepPrice: { common: 15, rare: 35, legendary: 80 } as const,
  smithShare: 0.5,
  /** The capital's market sells only the faction's best. */
  capitalPrices: { common: 25, rare: 55, legendary: 120 } as const,
  rarityWeights: { common: 70, rare: 25, legendary: 5 } as const,
  /** Share of the map's transient positions switched on for an expedition. */
  /** What a travel location turns out to be, rolled on first visit. */
  transientRoll: { encounter: 50, camp: 20, merchant: 15, cache: 15 } as const,
  /** What a cache holds, rolled on first visit. */
  cacheRoll: { life: 25, silver: 35, nothing: 40 } as const,
  cacheLife: 1,
  cacheSilver: [8, 16] as const,
  /** Sites flagged as boss sites are only candidates: each expedition makes this many of them bosses, chosen from its seed. The rest stay what they are. */
  bossCount: 3,
  /** A roadside camp is always switched on this close to the start. */
  startCamp: { min: 0.03, max: 0.2 },
  /** A waymark shows the land around it, this many times as far as a visited node does. */
  waymarkReveal: 2,
  /** Rumors a settlement offers, and how far from it a quest destination may stand (fractions of the map width). */
  rumorsPerSettlement: 2,
  questDistance: { min: 0.06, max: 0.22 },
  /** Generated places keep this far from every other node, and stay within this reach of existing land when no placement area is painted. */
  placementSpacing: 0.035,
  placementReach: 0.14,
  /** Enemy life grows with the tier: wins plus the deck's card grade, one tier per `tierStep` points, to a cap. */
  tierStep: 3,
  maxTier: 5,
  gradePoints: { common: 0, rare: 0.25, legendary: 1 } as const,
  bossLife: 5,
} as const;
