/** The studio reads and writes the repository directly through the browser's File System Access API (Chrome and Edge). */
type Perm = { mode: 'readwrite' };
type Dir = FileSystemDirectoryHandle & { queryPermission(o: Perm): Promise<PermissionState>; requestPermission(o: Perm): Promise<PermissionState>; values(): AsyncIterable<FileSystemHandle> };
export type Repo = Dir;
export type StoredCard = { folder: string; data: Record<string, any>; de?: Record<string, any>; art?: Blob };

export const supported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

// The folder handle outlives reloads in IndexedDB, so the folder is picked once.
const open = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open('varhyr-studio', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('handles');
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
async function store<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => { const request = run(db.transaction('handles', mode).objectStore('handles')); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
export const rememberRepo = (repo: Repo) => store('readwrite', s => s.put(repo, 'repo'));
export const recallRepo = async () => { try { return (await store('readonly', s => s.get('repo'))) as Repo | undefined; } catch { return undefined; } };
export const forgetRepo = () => store('readwrite', s => s.delete('repo'));

export async function hasAccess(repo: Repo, ask: boolean) {
  const options: Perm = { mode: 'readwrite' };
  if (await repo.queryPermission(options) === 'granted') return true;
  return ask && await repo.requestPermission(options) === 'granted';
}
async function dir(root: Dir, path: string, create = false) {
  let current = root as FileSystemDirectoryHandle;
  for (const part of path.split('/').filter(Boolean)) current = await current.getDirectoryHandle(part, { create });
  return current as Dir;
}
export async function pickRepo(): Promise<Repo> {
  const repo = await (window as unknown as { showDirectoryPicker(o: object): Promise<Repo> }).showDirectoryPicker({ id: 'varhyr-repo', mode: 'readwrite' });
  try { await dir(repo, 'assets/cards'); } catch { throw new Error('That folder has no assets/cards directory. Pick the repository root (the folder that contains assets and packages).'); }
  await rememberRepo(repo);
  return repo;
}
/** A throwaway folder inside the browser, for trying the studio without touching the repository. */
export async function sandboxRepo(): Promise<Repo> {
  const root = await navigator.storage.getDirectory();
  const repo = await root.getDirectoryHandle('varhyr-sandbox', { create: true });
  await repo.getDirectoryHandle('assets', { create: true }).then(assets => assets.getDirectoryHandle('cards', { create: true }));
  return repo as Repo;
}

const readText = async (folder: FileSystemDirectoryHandle, name: string) => { try { return await (await (await folder.getFileHandle(name)).getFile()).text(); } catch { return null; } };
export async function readCards(repo: Repo): Promise<StoredCard[]> {
  const cards = await dir(repo, 'assets/cards'), out: StoredCard[] = [];
  for await (const entry of cards.values()) {
    if (entry.kind !== 'directory') continue;
    const folder = entry as FileSystemDirectoryHandle, raw = await readText(folder, 'data.json');
    if (!raw) continue;
    try {
      const de = await readText(folder, 'data.de.json');
      let art: Blob | undefined;
      try { art = await (await folder.getFileHandle('data.png')).getFile(); } catch { /* No art yet. */ }
      out.push({ folder: entry.name, data: JSON.parse(raw), de: de ? JSON.parse(de) : undefined, art });
    } catch { /* A file that does not parse is reported by the importer; skip it here. */ }
  }
  return out;
}
async function write(folder: FileSystemDirectoryHandle, name: string, content: string | Blob) {
  const file = await folder.getFileHandle(name, { create: true }), stream = await file.createWritable();
  await stream.write(content); await stream.close();
}
export async function writeCard(repo: Repo, folder: string, files: { data: string; de: string | null; png?: Blob }) {
  const target = await dir(repo, `assets/cards/${folder}`, true);
  await write(target, 'data.json', files.data);
  if (files.de) await write(target, 'data.de.json', files.de);
  else try { await target.removeEntry('data.de.json'); } catch { /* Nothing to remove. */ }
  if (files.png) await write(target, 'data.png', files.png);
}

/** Any image becomes the PNG the importer requires. */
export async function toPng(file: Blob): Promise<Blob> {
  if (file.type === 'image/png') return file;
  const bitmap = await createImageBitmap(file), canvas = document.createElement('canvas');
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not convert the image to PNG.')), 'image/png'));
}
