import { useSyncExternalStore } from 'react';
import { avatarDefinitions, defaultAvatarId, type AvatarDefinition } from '../../../packages/content/src';

/** The player's identity. Avatars are authored in packages/content/src/avatars.json; new profiles and retired portrait ids fall back to the Wanderer. */
export type AvatarChoice = AvatarDefinition;
export { defaultAvatarId };
export const avatars: AvatarChoice[] = [...avatarDefinitions];
export type Profile = { name: string; avatar: string };

// The name keeps the key online play already used, so an existing name carries over.
export const nameKey = 'varhyr-player-name';
export const avatarKey = 'varhyr-avatar-v1';
export const defaultName = 'Wanderer';
export const maxNameLength = 24;

let current: Profile | undefined;
const listeners = new Set<() => void>();
const cleanName = (value: string) => value.trim().slice(0, maxNameLength) || defaultName;

function read(): Profile {
  if (current) return current;
  let name = defaultName, avatar = defaultAvatarId;
  try {
    name = cleanName(localStorage.getItem(nameKey) ?? '');
    const stored = localStorage.getItem(avatarKey);
    if (stored && avatars.some(a => a.id === stored)) avatar = stored;
  } catch { /* Storage is optional; the profile lives for this session. */ }
  return current = { name, avatar };
}
function refresh(event: StorageEvent) {
  if (event.key !== nameKey && event.key !== avatarKey && event.key !== null) return;
  current = undefined;
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
  if (!listeners.size) window.addEventListener('storage', refresh);
  listeners.add(listener);
  return () => { listeners.delete(listener); if (!listeners.size) window.removeEventListener('storage', refresh); };
}

export function getProfile(): Profile { return read(); }
export function updateProfile(patch: Partial<Profile>) {
  const before = read();
  const next: Profile = { name: patch.name === undefined ? before.name : cleanName(patch.name), avatar: patch.avatar && avatars.some(a => a.id === patch.avatar) ? patch.avatar : before.avatar };
  if (next.name === before.name && next.avatar === before.avatar) return;
  current = next;
  try { localStorage.setItem(nameKey, next.name); localStorage.setItem(avatarKey, next.avatar); } catch { /* Best effort. */ }
  for (const listener of listeners) listener();
}
export function useProfile(): Profile { return useSyncExternalStore(subscribe, read, read); }
