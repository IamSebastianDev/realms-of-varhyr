import { factionInfo, registry } from '../../../../packages/content/src';
import { boosterPacks } from '../../../../packages/content/src/boosters';
import { draftableFactions, factionPool, isHybrid } from '../../../../packages/draft/src';
import { rarest } from '../DeckShelf';

/** The name of a faction as the draft screens say it. */
export const factionName = (faction: string) => factionInfo[faction]?.name ?? faction;
export const factionColor = (faction: string) => factionInfo[faction]?.color ?? '#c9a45c';
/** The collection booster that holds the faction: its look stands in for the draft booster, and a run pays out in it. */
export const factionPack = (faction: string) => boosterPacks.find(pack => pack.factions.includes(faction)) ?? boosterPacks[0]!;
/** The best card of the faction, for backdrops and stripes. */
export const factionArt = (faction: string) => rarest(factionPool(Object.values(registry.cards), faction).filter(card => card.factions.includes(faction)).map(card => card.id))[0];
/** The factions a drafter can start with or move on to. */
export const startingFactions = () => draftableFactions(registry);
/** The factions that join this one in a hybrid, with how many hybrids each has. */
export function hybridPartners(faction: string): { faction: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const card of Object.values(registry.cards)) if (isHybrid(card) && card.factions.includes(faction)) for (const other of card.factions) if (other !== faction) counts.set(other, (counts.get(other) ?? 0) + 1);
  return [...counts].map(([partner, count]) => ({ faction: partner, count })).sort((a, b) => b.count - a.count || (a.faction < b.faction ? -1 : 1));
}

