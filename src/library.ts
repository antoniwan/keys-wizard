/**
 * Two shelves of songs:
 *  - bundled: files in public/songs that we are allowed to share (see AGENTS.md)
 *  - yours:   files you dropped in. They stay in this browser (IndexedDB) and
 *             are never uploaded anywhere.
 */
export interface BundledSong {
  file: string;
  title: string;
  composer: string;
  level: string;
  license: string;
  provenance: string;
}

export interface SavedSong {
  name: string;
  title: string;
  added: number;
  bytes: Uint8Array;
}

export async function listBundled(): Promise<BundledSong[]> {
  try {
    const res = await fetch('./songs/index.json');
    return res.ok ? ((await res.json()) as BundledSong[]) : [];
  } catch {
    return [];
  }
}

export async function fetchBundled(file: string): Promise<Uint8Array> {
  const res = await fetch(`./songs/${file}`);
  if (!res.ok) throw new Error(`Could not load ${file}`);
  return new Uint8Array(await res.arrayBuffer());
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('keys-wizard', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('songs', { keyPath: 'name' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction('songs', mode).objectStore('songs'));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function listSaved(): Promise<SavedSong[]> {
  try {
    const all = await run<SavedSong[]>('readonly', (s) => s.getAll());
    return all.sort((a, b) => b.added - a.added);
  } catch {
    return [];
  }
}

export async function saveSong(song: SavedSong): Promise<void> {
  try {
    await run('readwrite', (s) => s.put(song));
  } catch {
    // Private windows can refuse storage. The song still plays; it just is not remembered.
  }
}

export async function removeSaved(name: string): Promise<void> {
  try {
    await run('readwrite', (s) => s.delete(name));
  } catch {
    // Nothing to do.
  }
}
