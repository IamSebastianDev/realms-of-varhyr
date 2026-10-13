import { existsSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { avatarDefinitions, defaultAvatarId } from '../packages/content/src';

describe('avatars', () => {
  it('has nine faction heroes with unique ids, names and artwork on disk', () => {
    expect(avatarDefinitions).toHaveLength(9);
    expect(new Set(avatarDefinitions.map(a => a.id)).size).toBe(9);
    expect(new Set(avatarDefinitions.map(a => a.name)).size).toBe(9);
    expect(avatarDefinitions[4]?.id).toBe(defaultAvatarId);
    for (const a of avatarDefinitions) {
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.lore.length).toBeGreaterThan(20);
      expect(a.accent).toMatch(/^#[0-9a-f]{6}$/i);
      expect(existsSync(`public${a.art}`), a.art).toBe(true);
      expect(existsSync(`assets/avatars/${a.source}`), a.source).toBe(true);
    }
  });
});

import { startMatch } from '../apps/web/src/session';
import { parseClientMessage } from '../packages/multiplayer/src/protocol';

describe('match avatars', () => {
  it('gives the opponent a seeded portrait different from yours', () => {
    const a = startMatch(731, undefined, false, undefined, undefined, undefined, 'Sebastian', 'morie');
    const b = startMatch(731, undefined, false, undefined, undefined, undefined, 'Sebastian', 'morie');
    expect(a.players.p1.avatar).toBe('morie');
    expect(a.players.p2.avatar).toBeTruthy();
    expect(a.players.p2.avatar).not.toBe('morie');
    expect(b.players.p2.avatar).toBe(a.players.p2.avatar);
    expect(avatarDefinitions.some(x => x.id === a.players.p2.avatar)).toBe(true);
    const seen = new Set(Array.from({ length: 40 }, (_, i) => startMatch(i + 1, undefined, false, undefined, undefined, undefined, 'S', 'morie').players.p2.avatar));
    expect(seen.size).toBeGreaterThan(4);
  });
  it('leaves avatars off without a player portrait (hotseat)', () => {
    expect(startMatch(731).players.p2.avatar).toBeUndefined();
  });
  it('carries the guest avatar in the hello message', () => {
    const hello = parseClientMessage({ type: 'hello', version: 1, rules: 'r', content: 'c', token: 't', name: 'Guest', avatar: 'morie', deck: { name: 'D', cards: ['x'] } });
    expect(hello.type === 'hello' && hello.avatar).toBe('morie');
  });
});


describe('profile hero defaults', () => {
  it.each([null, 'maro-vell', 'retired-portrait'])('uses the center Wanderer when the saved avatar is %s', async stored => {
    vi.resetModules();
    vi.stubGlobal('localStorage', { getItem: (key: string) => key === 'varhyr-avatar-v1' ? stored : 'Sebastian' });
    try {
      const { getProfile } = await import('../apps/web/src/profile');
      expect(getProfile()).toEqual({ name: 'Sebastian', avatar: defaultAvatarId });
    } finally { vi.unstubAllGlobals(); }
  });
  it('preserves a selected hero when loading the profile', async () => {
    vi.resetModules();
    vi.stubGlobal('localStorage', { getItem: (key: string) => key === 'varhyr-avatar-v1' ? 'morie' : 'Sebastian' });
    try {
      const { getProfile } = await import('../apps/web/src/profile');
      expect(getProfile()).toEqual({ name: 'Sebastian', avatar: 'morie' });
    } finally { vi.unstubAllGlobals(); }
  });
});
