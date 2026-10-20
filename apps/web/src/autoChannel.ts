import type { Cost, Pool, PlayerView } from '../../../packages/contracts/src';

export type ChannelStep = { cardId: string; option: number };

const total = (pool: Pool) => Object.values(pool).reduce((sum, n) => sum + (n ?? 0), 0);

/** Does `pool` pay `cost`? Faction costs need their own colour; generic takes anything left over. */
export function covers(pool: Pool, cost: Cost): boolean {
  let need = cost.generic;
  for (const [color, n] of Object.entries(cost.factions)) {
    if (color === 'neutral' || !n) { need += n ?? 0; continue; }
    if ((pool[color] ?? 0) < n) return false;
    need += n;
  }
  return total(pool) >= need;
}

/**
 * The fewest producers to exhaust so the pool pays `cost`, or null when even all of them cannot.
 * Ties go to the plan that wastes the least energy. Boards hold five creatures, so brute force is instant.
 */
export function planChannels(cost: Cost, pool: Pool, producers: PlayerView['legal']['energy']): ChannelStep[] | null {
  if (covers(pool, cost)) return [];
  let best: { steps: ChannelStep[]; waste: number } | null = null;
  const walk = (index: number, steps: ChannelStep[], have: Pool) => {
    if (best && steps.length > best.steps.length) return;
    if (covers(have, cost)) {
      const waste = total(have) - (cost.generic + Object.values(cost.factions).reduce((a, b) => a + (b ?? 0), 0));
      if (!best || steps.length < best.steps.length || waste < best.waste) best = { steps, waste };
      return;
    }
    if (index >= producers.length) return;
    const producer = producers[index];
    producer.options.forEach((output, option) => {
      const next = { ...have };
      for (const [color, n] of Object.entries(output)) next[color] = (next[color] ?? 0) + (n ?? 0);
      walk(index + 1, [...steps, { cardId: producer.cardId, option }], next);
    });
    walk(index + 1, steps, have);
  };
  walk(0, [], pool);
  return (best as { steps: ChannelStep[] } | null)?.steps ?? null;
}
