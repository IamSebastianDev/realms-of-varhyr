/** Provisional tuning for the quest mode. Everything a designer would want to turn lives here. */
export const questRules = {
  /** A match starts both sides at 10 life; a run can never carry more than that into a fight. */
  maxLife: 10,
  /** 9 producers plus core cards, fixed by the faction. */
  baseDeck: 15,
  baseProducers: 8,
  draftPicks: 15,
  packSize: 5,
  /** Crowns paid from the account to set out. */
  entryCrowns: 50,
  /** Paid once per quest kind and day when the boss falls. */
  rewardCrowns: 150,
  rewardPacks: 3,
  /** At most this many completed quests pay out per day. */
  dailyCap: 3,
  softFailHours: 24,
  startGold: 30,
  fightGold: [12, 20] as const,
  arenaGold: [30, 45] as const,
  fightPick: { size: 3, pick: 1 },
  arenaPick: { size: 5, pick: 1 },
  foundPick: { size: 3, pick: 1 },
  exchangePick: { size: 3, pick: 1 },
  foundGold: [20, 35] as const,
  refugeHeal: 5,
  healGoldPerLife: 6,
  shopSize: 5,
  shopPrice: { common: 15, rare: 35, legendary: 80 } as const,
  /** The capital's market sells only the faction's best. */
  capitalPrices: { common: 25, rare: 55, legendary: 120 } as const,
  rarityWeights: { common: 70, rare: 25, legendary: 5 } as const,
  /** Share of the transient positions switched on for a run. */
  transientShare: 0.5,
  transientRoll: { fight: 50, refuge: 20, cache: 20, trader: 10 } as const,
  /** A refuge is always switched on this close to the start. */
  startRefuge: { min: 0.03, max: 0.2 },
  /** A city's rumor points at fights this close to the city. */
  rumorRadius: 0.22,
  rumorCount: 2,
  rumorGold: [30, 50] as const,
  /** A waymark shows the land around it, this many times as far as a visited node does. */
  waymarkReveal: 2,
  /** A boss must start at least this far from every start site (fraction of image width). */
  minQuestDistance: 0.25,
  /** Where the hint circle sits off the target, as a share of its radius. */
  hintOffset: [0.2, 0.6] as const,
  hintRadius: 1.5,
} as const;
