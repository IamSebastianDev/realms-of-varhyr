/** Small seeded random numbers, so a day's quest map and a run's rewards can be replayed exactly. */
export function hashString(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export type Rng = {
  next(): number;
  /** An integer from 0 up to, but not including, n. */
  int(n: number): number;
  range(low: number, high: number): number;
  chance(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
  weighted<T>(items: readonly T[], weight: (item: T) => number): T;
};

export function makeRng(seed: number | string): Rng {
  let state = (typeof seed === "string" ? hashString(seed) : seed) >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number) => Math.floor(next() * n);
  return {
    next,
    int,
    range: (low, high) => low + int(high - low + 1),
    chance: (probability) => next() < probability,
    pick: (items) => items[int(items.length)]!,
    shuffle: (items) => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(i + 1);
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },
    weighted: (items, weight) => {
      const total = items.reduce((sum, item) => sum + Math.max(0, weight(item)), 0);
      let roll = next() * total;
      for (const item of items) {
        roll -= Math.max(0, weight(item));
        if (roll < 0) return item;
      }
      return items[items.length - 1]!;
    },
  };
}
