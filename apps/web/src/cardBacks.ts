import type { Goals } from "./goals";

/** Card backs ("sleeves"). The artwork lives in assets/sleeves and ships as public/sleeves/<id>.webp. */
export type CardBackDef = {
  id: string;
  name: string;
  /** Free from the start, bought in the Store for `price` crowns, or unlocked by reaching an achievement tier (1 bronze, 2 silver, 3 gold). */
  source: "free" | "shop" | "achievement";
  price?: number;
  unlock?: { achievement: string; tier: 1 | 2 | 3 };
};
export const cardBackArt = (id: string) => `/sleeves/${id}.webp`;
export const cardBacks: CardBackDef[] = [
  { id: "varhyr", name: "Realms of Varhyr", source: "free" },
  // The ink landscapes are bought with crowns.
  { id: "peaks", name: "Misted Peaks", source: "shop", price: 300 },
  { id: "keep", name: "Cliffside Keep", source: "shop", price: 300 },
  { id: "elder", name: "Elder Forest", source: "shop", price: 300 },
  { id: "ashfield", name: "Field of Ash", source: "shop", price: 400 },
  // The banners are earned through achievements.
  {
    id: "crownlands",
    name: "Crownlands",
    source: "achievement",
    unlock: { achievement: "victories", tier: 1 },
  },
  {
    id: "highland",
    name: "Highland Banner",
    source: "achievement",
    unlock: { achievement: "streak", tier: 1 },
  },
  {
    id: "greenwood",
    name: "Greenwood",
    source: "achievement",
    unlock: { achievement: "decks", tier: 1 },
  },
  {
    id: "tidecallers",
    name: "Tidecallers",
    source: "achievement",
    unlock: { achievement: "online", tier: 1 },
  },
  {
    id: "thornwatch",
    name: "Thornwatch",
    source: "achievement",
    unlock: { achievement: "collector", tier: 2 },
  },
  {
    id: "gilded",
    name: "Gilded V",
    source: "achievement",
    unlock: { achievement: "collector", tier: 3 },
  },
];
export const defaultCardBack = cardBacks[0].id;
export const cardBackById = (id: string | undefined) =>
  cardBacks.find((back) => back.id === id) ?? cardBacks[0];
export function isBackUnlocked(back: CardBackDef, goals: Goals, bought: readonly string[]) {
  if (back.source === "free" || bought.includes(back.id)) return true;
  if (back.source === "shop") return false;
  return (goals.claimedTiers[back.unlock!.achievement] ?? 0) >= back.unlock!.tier;
}
