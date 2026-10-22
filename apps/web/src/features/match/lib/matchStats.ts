import type { GameState, PlayerId, Registry } from "@realms/contracts";
import { other } from "@realms/core";

export type SideStats = {
  cardsPlayed: number;
  spellsCast: number;
  creaturesLost: number;
  creaturesDestroyed: number;
  damageDealt: number;
  faceDamage: number;
  biggestHit: number;
  attacks: number;
  energy: number;
  healed: number;
  topAttacker: { name: string; attacks: number } | null;
  fallen: string[];
};
const blank = (): SideStats => ({
  cardsPlayed: 0,
  spellsCast: 0,
  creaturesLost: 0,
  creaturesDestroyed: 0,
  damageDealt: 0,
  faceDamage: 0,
  biggestHit: 0,
  attacks: 0,
  energy: 0,
  healed: 0,
  topAttacker: null,
  fallen: [],
});
const isSeat = (id: string | undefined): id is PlayerId => id === "p1" || id === "p2";

/** Everything a match summary shows, read from the event log alone so it works for local and online games alike. */
export function matchStats(state: GameState, registry: Registry): Record<PlayerId, SideStats> {
  const sides = { p1: blank(), p2: blank() };
  const swings = { p1: new Map<string, number>(), p2: new Map<string, number>() };
  const nameOf = (id: string | undefined) => {
    const card = id ? state.cards[id] : undefined;
    return card ? (registry.cards[card.definitionId]?.name ?? "Unknown") : "Unknown";
  };
  for (const event of state.events) {
    const who = event.player;
    if (event.type === "card.played" && isSeat(who)) sides[who].cardsPlayed++;
    else if (event.type === "spell.cast" && isSeat(who)) {
      sides[who].cardsPlayed++;
      sides[who].spellsCast++;
    } else if (event.type === "energy.generated" && isSeat(who)) sides[who].energy++;
    else if (event.type === "creature.attacked" && isSeat(who) && event.cardId)
      swings[who].set(event.cardId, (swings[who].get(event.cardId) ?? 0) + 1);
    else if (event.type === "life.restored" && isSeat(event.target))
      sides[event.target].healed += event.amount ?? 0;
    else if (
      (event.type === "creature.destroyed" || event.type === "holding.destroyed") &&
      event.cardId
    ) {
      const owner = event.snapshot?.controller ?? state.cards[event.cardId]?.controller;
      if (!isSeat(owner)) continue;
      sides[owner].creaturesLost++;
      sides[other(owner)].creaturesDestroyed++;
      sides[owner].fallen.push(nameOf(event.cardId));
    } else if (event.type === "damage.dealt" && event.target && event.amount) {
      const victim = isSeat(event.target) ? event.target : state.cards[event.target]?.controller;
      if (!isSeat(victim)) continue;
      const dealer = other(victim);
      sides[dealer].damageDealt += event.amount;
      if (isSeat(event.target)) sides[dealer].faceDamage += event.amount;
      sides[dealer].biggestHit = Math.max(sides[dealer].biggestHit, event.amount);
    }
  }
  for (const id of ["p1", "p2"] as const) {
    sides[id].attacks = [...swings[id].values()].reduce((a, b) => a + b, 0);
    const [top] = [...swings[id]].sort((a, b) => b[1] - a[1]);
    if (top) sides[id].topAttacker = { name: nameOf(top[0]), attacks: top[1] };
  }
  return sides;
}
