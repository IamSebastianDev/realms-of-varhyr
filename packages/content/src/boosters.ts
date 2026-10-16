import type { CardDefinition } from '../../contracts/src';
import { factionDefinitions } from './factions';

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

/** Boosters are sold by alignment: each draws from a fixed group of factions. */
export type BoosterPack = { id: string; name: string; blurb: string; color: string; /** Faction whose icon stamps the pack. */ icon: string; factions: string[] };
export const packIds = { good: 'hearth-and-crown', neutral: 'wanderers-road', evil: 'gathering-dark' } as const;
const alignmentPacks: BoosterPack[] = [
  { id: packIds.good, name: 'The Hearth and the Crown', blurb: 'Five cards from the Bright Marches, the League of Winter and the Crownlands. Legendaries are rare.', color: '#e3c46f', icon: 'crownlands', factions: ['bright-marches', 'winter-league', 'crownlands'] },
  { id: packIds.neutral, name: 'The Wanderer’s Road', blurb: 'Five cards from the Mountain Clans, the Conclave and the unaligned. Legendaries are rare.', color: '#a9c0ad', icon: 'neutral', factions: ['mountain-clans', 'conclave', 'neutral'] },
  { id: packIds.evil, name: 'The Gathering Dark', blurb: 'Five cards from the Black Host, the Ember Fields and the Horde. Legendaries are rare.', color: '#b0586f', icon: 'black-host', factions: ['black-host', 'ember-fields', 'horde'] },
];
const known = new Set(factionDefinitions.map(faction => faction.id));
for (const pack of alignmentPacks) for (const id of [pack.icon, ...pack.factions]) if (!known.has(id)) throw new Error(`Booster '${pack.id}' references unknown faction '${id}'.`);
export const boosterPacks: BoosterPack[] = alignmentPacks;
/** Cards of any faction in the pool; factionless cards belong to the pool that lists neutral. */
export const packCards = (cards: CardDefinition[], pack: BoosterPack) =>
  cards.filter(card => card.factions.length ? card.factions.some(faction => pack.factions.includes(faction)) : pack.factions.includes('neutral'));
