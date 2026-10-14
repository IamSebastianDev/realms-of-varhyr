import { describe, expect, it } from 'vitest';
import { registry } from '../packages/content/src';
import { arenaForMatch, fallbackArena } from '../apps/web/src/arenas';

function matchFor(definitionIds: string[], seed = 0) {
  return {
    seed,
    cards: Object.fromEntries(definitionIds.map((definitionId, index) => [`card-${index}`, { definitionId }])),
  } as Parameters<typeof arenaForMatch>[0];
}

describe('match arenas', () => {
  it('uses the represented faction for a mono-faction match', () => {
    expect(arenaForMatch(matchFor(['goldfield-farmer', 'crown-recruit']), registry).id).toBe('crownlands');
  });

  it('uses only represented factions and resolves the same seed the same way', () => {
    const match = matchFor(['goldfield-farmer', 'herald-of-the-mark'], 1);
    const first = arenaForMatch(match, registry).id;
    expect(['crownlands', 'bright-marches']).toContain(first);
    expect(arenaForMatch(match, registry).id).toBe(first);
  });

  it('falls back to common ground for a neutral-only match', () => {
    expect(arenaForMatch(matchFor(['ancient-unicorn']), registry)).toEqual(fallbackArena);
  });
});
