import { useSyncExternalStore } from 'react';
export type Language = 'en' | 'de';
export type Motion = 'system' | 'full' | 'reduced';
export type Preferences = { language: Language; motion: Motion; sound: boolean; music: boolean; musicVolume: number; soundVolume: number; skipEmptyWindows: boolean };
export type PreferenceSnapshot = Preferences & { reduced: boolean };
export const preferencesKey = 'varhyr-preferences-v1';
export const defaultPreferences: Preferences = { language: 'en', motion: 'system', sound: true, music: true, musicVolume: .35, soundVolume: .65, skipEmptyWindows: true };
const volume = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
export function parsePreferences(value: unknown): Preferences {
  const input = value && typeof value === 'object' ? value as Partial<Preferences> : {};
  return { language: input.language === 'de' ? 'de' : 'en',
    motion: input.motion === 'full' || input.motion === 'reduced' ? input.motion : 'system', sound: typeof input.sound === 'boolean' ? input.sound : defaultPreferences.sound,
    music: typeof input.music === 'boolean' ? input.music : defaultPreferences.music,
    musicVolume: volume(input.musicVolume, defaultPreferences.musicVolume), soundVolume: volume(input.soundVolume, defaultPreferences.soundVolume),
    skipEmptyWindows: typeof input.skipEmptyWindows === 'boolean' ? input.skipEmptyWindows : defaultPreferences.skipEmptyWindows };
}
let snapshot: PreferenceSnapshot | undefined;
const listeners = new Set<() => void>();
let motionQuery: MediaQueryList | undefined;
const systemMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const derive = (preferences: Preferences): PreferenceSnapshot => ({ ...preferences, reduced: preferences.motion === 'reduced' || preferences.motion === 'system' && systemMotion() });
export function getPreferences(): PreferenceSnapshot {
  if (snapshot) return snapshot;
  let input: unknown;
  try { if(typeof window!=='undefined')input = JSON.parse(localStorage.getItem(preferencesKey) ?? 'null'); } catch { /* Defaults also work without storage. */ }
  return snapshot = derive(parsePreferences(input));
}
function emit() { for (const listener of listeners) listener(); }
export function updatePreferences(patch: Partial<Preferences>) {
  const next = parsePreferences({ ...getPreferences(), ...patch });
  snapshot = derive(next);
  try { if(typeof window!=='undefined')localStorage.setItem(preferencesKey, JSON.stringify(next)); } catch { /* Keep preferences for this session. */ }
  emit();
}
function storageChanged(event: StorageEvent) {
  if (event.key !== preferencesKey && event.key !== null) return;
  snapshot = undefined; emit();
}
function motionChanged() { if (getPreferences().motion === 'system') { snapshot = derive(getPreferences()); emit(); } }
export function subscribePreferences(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1 && typeof window !== 'undefined') {
    window.addEventListener('storage', storageChanged);
    motionQuery=window.matchMedia?.('(prefers-reduced-motion: reduce)');
    motionQuery?.addEventListener('change', motionChanged);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && typeof window !== 'undefined') {
      window.removeEventListener('storage', storageChanged);
      motionQuery?.removeEventListener('change', motionChanged);motionQuery=undefined;
    }
  };
}
export const usePreferences = () => useSyncExternalStore(subscribePreferences, getPreferences, getPreferences);
