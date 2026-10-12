import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { avatarDefinitions } from '../packages/content/src';

describe('avatars', () => {
  it('has ten portraits with unique ids, names and artwork on disk', () => {
    expect(avatarDefinitions).toHaveLength(10);
    expect(new Set(avatarDefinitions.map(a => a.id)).size).toBe(10);
    expect(new Set(avatarDefinitions.map(a => a.name)).size).toBe(10);
    for (const a of avatarDefinitions) {
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.lore.length).toBeGreaterThan(20);
      expect(a.accent).toMatch(/^#[0-9a-f]{6}$/i);
      expect(existsSync(`public${a.art}`), a.art).toBe(true);
    }
  });
});

import { startMatch } from '../apps/web/src/session';
import { parseClientMessage } from '../packages/multiplayer/src/protocol';

describe('match avatars', () => {
  it('gives the opponent a seeded portrait different from yours', () => {
    const a = startMatch(731, undefined, false, undefined, undefined, undefined, 'Sebastian', 'ilyan-veyr');
    const b = startMatch(731, undefined, false, undefined, undefined, undefined, 'Sebastian', 'ilyan-veyr');
    expect(a.players.p1.avatar).toBe('ilyan-veyr');
    expect(a.players.p2.avatar).toBeTruthy();
    expect(a.players.p2.avatar).not.toBe('ilyan-veyr');
    expect(b.players.p2.avatar).toBe(a.players.p2.avatar);
    expect(avatarDefinitions.some(x => x.id === a.players.p2.avatar)).toBe(true);
    const seen = new Set(Array.from({ length: 40 }, (_, i) => startMatch(i + 1, undefined, false, undefined, undefined, undefined, 'S', 'ilyan-veyr').players.p2.avatar));
    expect(seen.size).toBeGreaterThan(4);
  });
  it('leaves avatars off without a player portrait (hotseat)', () => {
    expect(startMatch(731).players.p2.avatar).toBeUndefined();
  });
  it('carries the guest avatar in the hello message', () => {
    const hello = parseClientMessage({ type: 'hello', version: 1, rules: 'r', content: 'c', token: 't', name: 'Guest', avatar: 'ysolde-rime', deck: { name: 'D', cards: ['x'] } });
    expect(hello.type === 'hello' && hello.avatar).toBe('ysolde-rime');
  });
});
