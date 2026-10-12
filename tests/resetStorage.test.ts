import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearGameStorage, resetStoredGameData } from '../apps/web/src/resetStorage';
function storage(entries: Record<string, string>) {
  const data = new Map(Object.entries(entries));
  return {
    get length() { return data.size; }, key: (index: number) => [...data.keys()][index] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: vi.fn((key: string) => { data.delete(key); }), clear: () => data.clear(), data,
  };
}
afterEach(() => vi.unstubAllGlobals());
describe('full game reset', () => {
  it('removes all current and legacy game keys, including future keys, from both stores', () => {
    const local = storage(Object.fromEntries(['varhir-session-v1','varhir-setup-v1','varhir-decks-v1','varhir-deck-draft-v1','varhir-tutorial-v1','varhir-booster-rewards-v1','varhyr-collection-v1','varhyr-player-name','varhyr-avatar-v1','varhyr-preferences-v1','varhyr-future-feature'].map(key => [key, 'saved'])));
    local.setItem('another-app-preferences', 'keep');
    const session = storage({ 'varhyr-room-seat-ABCD': 'seat', 'varhir-legacy-token': 'old seat', 'another-app-session': 'keep' });
    vi.stubGlobal('window', { localStorage: local, sessionStorage: session });
    resetStoredGameData();
    expect([...local.data]).toEqual([['another-app-preferences', 'keep']]);
    expect([...session.data]).toEqual([['another-app-session', 'keep']]);
  });
  it('does not skip adjacent entries as removal shifts storage indexes', () => {
    const local = storage({ 'varhyr-one': '1', 'varhir-two': '2', 'varhyr-three': '3' });
    clearGameStorage(local as unknown as Storage);
    expect(local.length).toBe(0);
    expect(() => clearGameStorage(local as unknown as Storage)).not.toThrow();
  });
  it('still clears session tokens and reports failure when local storage is inaccessible', () => {
    const session = storage({ 'varhyr-room-seat-ABCD': 'seat' });
    vi.stubGlobal('window', { get localStorage() { throw Error('blocked'); }, sessionStorage: session });
    expect(() => resetStoredGameData()).toThrow('Some saved data could not be deleted');
    expect(session.length).toBe(0);
  });
  it('reports a removal failure instead of pretending reset succeeded', () => {
    const local = storage({ 'varhyr-one': 'saved' }), session = storage({});
    local.removeItem.mockImplementation(() => { throw Error('read only'); });
    vi.stubGlobal('window', { localStorage: local, sessionStorage: session });
    expect(() => resetStoredGameData()).toThrow('Some saved data could not be deleted');
    expect(local.getItem('varhyr-one')).toBe('saved');
  });
});
