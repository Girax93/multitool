// Persistent key/value storage on top of IndexedDB. Every tool gets a scoped
// view (`scoped(kv, 'timer')`) so keys never collide. Values are structured
// clones (plain objects/arrays), which is what IndexedDB stores natively.

export interface KVEntry<T = unknown> {
  key: string;
  value: T;
}

export interface KV {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  /** All entries whose key starts with `prefix`, in key order. */
  list<T>(prefix: string): Promise<KVEntry<T>[]>;
  /** Delete all entries whose key starts with `prefix`. */
  clear(prefix: string): Promise<void>;
}

const DB_NAME = 'multitool';
const DB_VERSION = 1;
const STORE = 'kv';
const KEY_END = '￿';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

export class IndexedDbKV implements KV {
  private dbPromise: Promise<IDBDatabase> | null = null;

  static isSupported(): boolean {
    return typeof indexedDB !== 'undefined';
  }

  private open(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        };
        req.onsuccess = () => {
          const db = req.result;
          db.onversionchange = () => db.close();
          resolve(db);
        };
        req.onerror = () => reject(req.error ?? new Error('Could not open IndexedDB'));
        req.onblocked = () => reject(new Error('IndexedDB open blocked'));
      });
    }
    return this.dbPromise;
  }

  private async store(mode: IDBTransactionMode): Promise<{ store: IDBObjectStore; tx: IDBTransaction }> {
    const db = await this.open();
    const tx = db.transaction(STORE, mode);
    return { store: tx.objectStore(STORE), tx };
  }

  async get<T>(key: string): Promise<T | undefined> {
    const { store } = await this.store('readonly');
    return (await request(store.get(key))) as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    const { store, tx } = await this.store('readwrite');
    store.put(value, key);
    await done(tx);
  }

  async delete(key: string): Promise<void> {
    const { store, tx } = await this.store('readwrite');
    store.delete(key);
    await done(tx);
  }

  async list<T>(prefix: string): Promise<KVEntry<T>[]> {
    const { store } = await this.store('readonly');
    const range = IDBKeyRange.bound(prefix, prefix + KEY_END);
    const [keys, values] = await Promise.all([request(store.getAllKeys(range)), request(store.getAll(range))]);
    return keys.map((key, i) => ({ key: String(key), value: values[i] as T }));
  }

  async clear(prefix: string): Promise<void> {
    const { store, tx } = await this.store('readwrite');
    if (prefix === '') store.clear();
    else store.delete(IDBKeyRange.bound(prefix, prefix + KEY_END));
    await done(tx);
  }
}

/** In-memory implementation for tests and as a last-resort fallback. */
export class MemoryKV implements KV {
  private map = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.map.get(key) as T | undefined;
  }
  async set<T>(key: string, value: T): Promise<void> {
    this.map.set(key, structuredClone(value));
  }
  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }
  async list<T>(prefix: string): Promise<KVEntry<T>[]> {
    return [...this.map.entries()]
      .filter(([k]) => k.startsWith(prefix))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, value]) => ({ key, value: structuredClone(value) as T }));
  }
  async clear(prefix: string): Promise<void> {
    for (const k of [...this.map.keys()]) if (k.startsWith(prefix)) this.map.delete(k);
  }
}

/** A KV whose keys are all prefixed with `<scope>/`. */
export function scoped(kv: KV, scope: string): KV {
  const p = `${scope}/`;
  return {
    get: (key) => kv.get(p + key),
    set: (key, value) => kv.set(p + key, value),
    delete: (key) => kv.delete(p + key),
    list: async (prefix) => (await kv.list(p + prefix)).map((e) => ({ key: e.key.slice(p.length), value: e.value })),
    clear: (prefix) => kv.clear(p + prefix),
  } as KV;
}

export function createKV(): KV {
  if (IndexedDbKV.isSupported()) return new IndexedDbKV();
  console.warn('IndexedDB unavailable — data will not persist');
  return new MemoryKV();
}

// ---- Backup / restore -------------------------------------------------------

export interface Backup {
  format: 'multitool-backup';
  version: 1;
  exportedAt: string;
  entries: KVEntry[];
}

export async function exportBackup(kv: KV): Promise<Backup> {
  return {
    format: 'multitool-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    entries: await kv.list(''),
  };
}

export function isBackup(data: unknown): data is Backup {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as Backup).format === 'multitool-backup' &&
    Array.isArray((data as Backup).entries)
  );
}

/** Restore a backup. With `replace`, existing data is wiped first. */
export async function importBackup(kv: KV, backup: Backup, replace: boolean): Promise<number> {
  if (replace) await kv.clear('');
  for (const e of backup.entries) await kv.set(e.key, e.value);
  return backup.entries.length;
}
