// Persistent key/value storage on top of IndexedDB. Every tool gets a scoped
// view (`scoped(kv, 'tool/timer')`) so keys never collide. Values are structured
// clones (plain objects/arrays), which is what IndexedDB stores natively.
//
// Sync bookkeeping lives here too: a second object store `meta` records, per
// synced key, when it was last written locally (`u`), whether that write still
// has to be pushed (`d`) and whether the key was deleted (`t`, a tombstone).
// The sync engine (core/sync.ts) reads and clears those flags; tools only ever
// see the plain KV interface plus `watch()` for changes that arrived from
// other devices.

import { Emitter, type Unsubscribe } from './store.js';

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
  /** Called with the keys (under `prefix`) that were changed by sync from another device. */
  watch(prefix: string, fn: (keys: string[]) => void): Unsubscribe;
}

/** Per-key sync state. */
export interface Meta {
  /** Epoch ms of the last local write (or of the remote version applied). */
  u: number;
  /** 1 while the local version still has to be pushed. */
  d: 0 | 1;
  /** 1 when the key was deleted (tombstone). */
  t: 0 | 1;
}

export interface DirtyEntry {
  key: string;
  meta: Meta;
}

/** The full store the sync engine works with. */
export interface SyncStore extends KV {
  meta(key: string): Promise<Meta | undefined>;
  /** Up to `limit` keys waiting to be pushed. */
  dirty(limit: number): Promise<DirtyEntry[]>;
  /** Write a version that came from the server (value `undefined` = deleted). Does not mark dirty. */
  applyRemote(key: string, value: unknown, u: number): Promise<void>;
  /** Clear the dirty flag, unless the key was written again since (`u` changed). */
  markPushed(key: string, u: number): Promise<void>;
  /** Mark every synced key as dirty (first sync / joining an account). Returns the count. */
  markAllDirty(): Promise<number>;
  /** Fire `watch` callbacks for keys changed by sync. */
  emitRemote(keys: string[]): void;
  /** Called after every local write of a synced key (so sync can be scheduled). */
  onLocalWrite(fn: (key: string) => void): Unsubscribe;
}

/**
 * Which keys leave the device. Tool data (`tool/<id>/…`) does, except paths
 * with a `ui` segment (per-device UI state such as the selected week);
 * `core/…` (theme, enabled tools) and `sync/…` never do.
 */
export function isSyncedKey(key: string): boolean {
  return key.startsWith('tool/') && !key.split('/').includes('ui');
}

const DB_NAME = 'multitool';
const DB_VERSION = 2;
const STORE = 'kv';
const META = 'meta';
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

/** Shared watcher / local-write plumbing for both implementations. */
class Watchers {
  private readonly watchers = new Set<{ prefix: string; fn: (keys: string[]) => void }>();
  readonly localWrites = new Emitter<string>();

  watch(prefix: string, fn: (keys: string[]) => void): Unsubscribe {
    const w = { prefix, fn };
    this.watchers.add(w);
    return () => {
      this.watchers.delete(w);
    };
  }

  emitRemote(keys: string[]): void {
    if (!keys.length) return;
    for (const w of [...this.watchers]) {
      const hit = keys.filter((k) => k.startsWith(w.prefix));
      if (hit.length) {
        try {
          w.fn(hit);
        } catch (err) {
          console.error('watcher failed', err);
        }
      }
    }
  }
}

export class IndexedDbKV implements SyncStore {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private readonly hooks = new Watchers();

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
          if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
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

  private async tx(mode: IDBTransactionMode): Promise<{ kv: IDBObjectStore; meta: IDBObjectStore; tx: IDBTransaction }> {
    const db = await this.open();
    const tx = db.transaction([STORE, META], mode);
    return { kv: tx.objectStore(STORE), meta: tx.objectStore(META), tx };
  }

  async get<T>(key: string): Promise<T | undefined> {
    const { kv } = await this.tx('readonly');
    return (await request(kv.get(key))) as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    const { kv, meta, tx } = await this.tx('readwrite');
    kv.put(value, key);
    const synced = isSyncedKey(key);
    if (synced) meta.put({ u: Date.now(), d: 1, t: 0 } satisfies Meta, key);
    await done(tx);
    if (synced) this.hooks.localWrites.emit(key);
  }

  async delete(key: string): Promise<void> {
    const { kv, meta, tx } = await this.tx('readwrite');
    const synced = isSyncedKey(key);
    let tombstone = false;
    if (synced) {
      // Only leave a tombstone when there was something to delete.
      const [had, m] = await Promise.all([request(kv.getKey(key)), request(meta.get(key))]);
      tombstone = had !== undefined || (m !== undefined && (m as Meta).t === 0);
    }
    kv.delete(key);
    if (tombstone) meta.put({ u: Date.now(), d: 1, t: 1 } satisfies Meta, key);
    await done(tx);
    if (tombstone) this.hooks.localWrites.emit(key);
  }

  async list<T>(prefix: string): Promise<KVEntry<T>[]> {
    const { kv } = await this.tx('readonly');
    const range = IDBKeyRange.bound(prefix, prefix + KEY_END);
    const [keys, values] = await Promise.all([request(kv.getAllKeys(range)), request(kv.getAll(range))]);
    return keys.map((key, i) => ({ key: String(key), value: values[i] as T }));
  }

  async clear(prefix: string): Promise<void> {
    const { kv, meta, tx } = await this.tx('readwrite');
    const range = IDBKeyRange.bound(prefix, prefix + KEY_END);
    const keys = (await request(kv.getAllKeys(range))).map(String);
    const now = Date.now();
    const synced = keys.filter(isSyncedKey);
    kv.delete(range);
    for (const k of synced) meta.put({ u: now, d: 1, t: 1 } satisfies Meta, k);
    await done(tx);
    for (const k of synced) this.hooks.localWrites.emit(k);
  }

  watch(prefix: string, fn: (keys: string[]) => void): Unsubscribe {
    return this.hooks.watch(prefix, fn);
  }

  // ---- sync bookkeeping ----

  async meta(key: string): Promise<Meta | undefined> {
    const { meta } = await this.tx('readonly');
    return (await request(meta.get(key))) as Meta | undefined;
  }

  async dirty(limit: number): Promise<DirtyEntry[]> {
    const { meta } = await this.tx('readonly');
    const [keys, values] = await Promise.all([request(meta.getAllKeys()), request(meta.getAll())]);
    const out: DirtyEntry[] = [];
    for (let i = 0; i < keys.length && out.length < limit; i++) {
      const m = values[i] as Meta;
      if (m.d === 1) out.push({ key: String(keys[i]), meta: m });
    }
    return out;
  }

  async applyRemote(key: string, value: unknown, u: number): Promise<void> {
    const { kv, meta, tx } = await this.tx('readwrite');
    if (value === undefined) {
      kv.delete(key);
      meta.put({ u, d: 0, t: 1 } satisfies Meta, key);
    } else {
      kv.put(value, key);
      meta.put({ u, d: 0, t: 0 } satisfies Meta, key);
    }
    await done(tx);
  }

  async markPushed(key: string, u: number): Promise<void> {
    const { meta, tx } = await this.tx('readwrite');
    const m = (await request(meta.get(key))) as Meta | undefined;
    if (m && m.u === u && m.d === 1) meta.put({ ...m, d: 0 } satisfies Meta, key);
    await done(tx);
  }

  async markAllDirty(): Promise<number> {
    const { kv, meta, tx } = await this.tx('readwrite');
    const [keys, metaKeys, metas] = await Promise.all([request(kv.getAllKeys()), request(meta.getAllKeys()), request(meta.getAll())]);
    const existing = new Map<string, Meta>();
    metaKeys.forEach((k, i) => existing.set(String(k), metas[i] as Meta));
    const now = Date.now();
    let n = 0;
    for (const raw of keys) {
      const k = String(raw);
      if (!isSyncedKey(k)) continue;
      const m = existing.get(k);
      meta.put({ u: m?.u ?? now, d: 1, t: 0 } satisfies Meta, k);
      n++;
    }
    await done(tx);
    return n;
  }

  emitRemote(keys: string[]): void {
    this.hooks.emitRemote(keys);
  }

  onLocalWrite(fn: (key: string) => void): Unsubscribe {
    return this.hooks.localWrites.on(fn);
  }
}

/** In-memory implementation for tests and as a last-resort fallback. */
export class MemoryKV implements SyncStore {
  private readonly map = new Map<string, unknown>();
  private readonly metas = new Map<string, Meta>();
  private readonly hooks = new Watchers();

  async get<T>(key: string): Promise<T | undefined> {
    return this.map.get(key) as T | undefined;
  }
  async set<T>(key: string, value: T): Promise<void> {
    this.map.set(key, structuredClone(value));
    if (isSyncedKey(key)) {
      this.metas.set(key, { u: Date.now(), d: 1, t: 0 });
      this.hooks.localWrites.emit(key);
    }
  }
  async delete(key: string): Promise<void> {
    const had = this.map.delete(key) || this.metas.get(key)?.t === 0;
    if (had && isSyncedKey(key)) {
      this.metas.set(key, { u: Date.now(), d: 1, t: 1 });
      this.hooks.localWrites.emit(key);
    }
  }
  async list<T>(prefix: string): Promise<KVEntry<T>[]> {
    return [...this.map.entries()]
      .filter(([k]) => k.startsWith(prefix))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, value]) => ({ key, value: structuredClone(value) as T }));
  }
  async clear(prefix: string): Promise<void> {
    for (const k of [...this.map.keys()]) if (k.startsWith(prefix)) await this.delete(k);
  }
  watch(prefix: string, fn: (keys: string[]) => void): Unsubscribe {
    return this.hooks.watch(prefix, fn);
  }
  async meta(key: string): Promise<Meta | undefined> {
    return this.metas.get(key);
  }
  async dirty(limit: number): Promise<DirtyEntry[]> {
    return [...this.metas.entries()]
      .filter(([, m]) => m.d === 1)
      .slice(0, limit)
      .map(([key, meta]) => ({ key, meta }));
  }
  async applyRemote(key: string, value: unknown, u: number): Promise<void> {
    if (value === undefined) {
      this.map.delete(key);
      this.metas.set(key, { u, d: 0, t: 1 });
    } else {
      this.map.set(key, structuredClone(value));
      this.metas.set(key, { u, d: 0, t: 0 });
    }
  }
  async markPushed(key: string, u: number): Promise<void> {
    const m = this.metas.get(key);
    if (m && m.u === u && m.d === 1) this.metas.set(key, { ...m, d: 0 });
  }
  async markAllDirty(): Promise<number> {
    let n = 0;
    const now = Date.now();
    for (const k of this.map.keys()) {
      if (!isSyncedKey(k)) continue;
      this.metas.set(k, { u: this.metas.get(k)?.u ?? now, d: 1, t: 0 });
      n++;
    }
    return n;
  }
  emitRemote(keys: string[]): void {
    this.hooks.emitRemote(keys);
  }
  onLocalWrite(fn: (key: string) => void): Unsubscribe {
    return this.hooks.localWrites.on(fn);
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
    watch: (prefix, fn) => kv.watch(p + prefix, (keys) => fn(keys.map((k) => k.slice(p.length)))),
  } as KV;
}

export function createKV(): SyncStore {
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
    // Sync identity and cursor are per device and must not travel in a backup.
    entries: (await kv.list('')).filter((e) => !e.key.startsWith('sync/')),
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

/** Restore a backup. With `replace`, existing data (except the sync identity) is wiped first. */
export async function importBackup(kv: KV, backup: Backup, replace: boolean): Promise<number> {
  if (replace) {
    await kv.clear('tool/');
    await kv.clear('core/');
  }
  let n = 0;
  for (const e of backup.entries) {
    if (e.key.startsWith('sync/')) continue;
    await kv.set(e.key, e.value);
    n++;
  }
  return n;
}
