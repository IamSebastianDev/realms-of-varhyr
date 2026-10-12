import type { CardDefinition } from '../../contracts/src';

/** POC odds per slot, independent of the number of cards in each rarity. */
export const boosterRules = { cardsPerPack: 5, rarityWeights: { common: 70, rare: 25, legendary: 5 } } as const;

/** Draws with replacement. Inject server-owned randomness when rewards move online. */
export function drawBooster(cards: CardDefinition[], random: () => number = Math.random): string[] {
  const pools = Object.entries(boosterRules.rarityWeights).map(([rarity, weight]) => ({
    weight, cards: cards.filter(card => card.rarity === rarity),
  })).filter(pool => pool.cards.length);
  if (!pools.length) throw new Error('No cards are available for boosters.');
  const totalWeight = pools.reduce((sum, pool) => sum + pool.weight, 0);
  function roll() {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Booster randomness must be between 0 and 1.');
    return value;
  }
  return Array.from({ length: boosterRules.cardsPerPack }, () => {
    let value = roll() * totalWeight;
    const pool = pools.find(pool => { value -= pool.weight; return value < 0; }) ?? pools[pools.length - 1];
    return pool.cards[Math.floor(roll() * pool.cards.length)].id;
  });
}
