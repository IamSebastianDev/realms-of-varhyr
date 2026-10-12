/** Include the original spelling as well as the current game's namespace, including room-seat tokens. */
export const isGameStorageKey = (key: string) => /^(varhir|varhyr)-/.test(key);
export function clearGameStorage(storage: Storage) {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key && isGameStorageKey(key)) keys.push(key);
  }
  // Take a snapshot first: removing keys shifts Storage's numeric indexes.
  for (const key of keys) storage.removeItem(key);
}
export function resetStoredGameData() {
  let failed = false;
  // Still attempt both stores if one is unavailable. Never reload while a failed reset is hidden.
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    try { clearGameStorage(window[name]); } catch { failed = true; }
  }
  if (failed) throw new Error('Some saved data could not be deleted. Allow browser storage and try again.');
}
