// Sync engine: keeps this device's synced keys in step with the account on the
// sync API (worker/). Push dirty records, pull what changed since the last
// cursor, notify tools. Everything is encrypted with keys derived from the
// account key, which only devices hold. See docs/SYNC.md.

import {
  decodeRecoveryKey,
  decryptRecord,
  deriveKeys,
  encodeRecoveryKey,
  encryptRecord,
  formatCode,
  fromBase64Url,
  lookupIdFor,
  newAccountKey,
  normaliseCode,
  randomCode,
  toBase64Url,
  unwrapAccountKey,
  wrapAccountKey,
  type AccountKeys,
} from './crypto.js';
import { isSyncedKey, type SyncStore } from './db.js';
import { signal, type Signal } from './store.js';

export const DEFAULT_API_URL = 'https://multitool-api.ariilden.com';
export const API_URL_OVERRIDE_KEY = 'multitool.syncApi';
const ACCOUNT_KEY = 'sync/account';
const CURSOR_KEY = 'sync/cursor';
const MAX_PUSH = 50;
const DEBOUNCE_MS = 1500;
const INTERVAL_MS = 60_000;

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncState {
  status: SyncStatus;
  accountId: string | null;
  lastSyncAt: number | null;
  error: string | null;
}

interface StoredAccount {
  key: string; // base64url, 32 bytes
  accountId: string;
}

interface WireRecord {
  rid: string;
  blob: string;
  u: number;
  t: 0 | 1;
  seq?: number;
}

interface SyncResponse {
  seq: number;
  changes: WireRecord[];
  rejected: WireRecord[];
  hasMore: boolean;
}

export class SyncError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** Browsers return a number; Node returns a Timeout that must not keep the process alive. */
function unref(handle: ReturnType<typeof setTimeout>): number {
  (handle as unknown as { unref?: () => void }).unref?.();
  return handle as unknown as number;
}

export function resolveApiUrl(): string {
  try {
    const o = localStorage.getItem(API_URL_OVERRIDE_KEY);
    if (o) return o.replace(/\/+$/, '');
  } catch {
    /* storage may be unavailable */
  }
  return DEFAULT_API_URL;
}

export class SyncEngine {
  readonly state: Signal<SyncState> = signal<SyncState>({ status: 'off', accountId: null, lastSyncAt: null, error: null });

  private keys: AccountKeys | null = null;
  private running = false;
  private pending = false;
  private debounce: number | undefined;
  private interval: number | undefined;
  private started = false;

  constructor(
    private readonly store: SyncStore,
    private readonly apiUrl = resolveApiUrl(),
    private readonly fetchFn: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  /** Load the stored account (if any) and start syncing in the background. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    const stored = await this.store.get<StoredAccount>(ACCOUNT_KEY);
    if (stored) {
      try {
        this.keys = await deriveKeys(fromBase64Url(stored.key));
        this.patch({ status: 'idle', accountId: this.keys.accountId });
      } catch (err) {
        console.error('Stored sync account is unusable', err);
      }
    }
    this.store.onLocalWrite(() => this.scheduleSoon());
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void this.syncNow();
        this.updateInterval();
      });
    }
    if (typeof window !== 'undefined') window.addEventListener('online', () => void this.syncNow());
    this.updateInterval();
    void this.syncNow();
  }

  get enabled(): boolean {
    return this.keys !== null;
  }

  get accountId(): string | null {
    return this.keys?.accountId ?? null;
  }

  /** The account key in human form (for writing down / typing on another device). */
  recoveryKey(): string | null {
    return this.keys ? encodeRecoveryKey(this.keys.key) : null;
  }

  /** Create a brand-new account with a fresh key and push this device's data. */
  async enable(): Promise<void> {
    if (this.keys) return;
    const keys = await deriveKeys(newAccountKey());
    await this.request('POST', '/v1/account', { accountId: keys.accountId, secret: keys.secret });
    await this.adopt(keys);
  }

  /** Show a short-lived code another device can type to join this account. */
  async createLinkCode(): Promise<{ code: string; expiresAt: number }> {
    const keys = this.requireKeys();
    const code = randomCode();
    const wrapped = await wrapAccountKey(code, keys.key);
    const res = await this.request<{ expiresAt: number }>('POST', '/v1/pair', wrapped, keys);
    return { code: formatCode(code), expiresAt: res.expiresAt };
  }

  /** Join the account whose linked device shows `code`. */
  async joinWithCode(input: string): Promise<void> {
    const code = normaliseCode(input);
    if (!code) throw new SyncError('That does not look like a link code (8 letters/digits).');
    const claim = await this.request<{ accountId: string; salt: string; wrapped: string }>('POST', '/v1/pair/claim', {
      lookupId: await lookupIdFor(code),
    });
    let key;
    try {
      key = await unwrapAccountKey(code, claim.salt, claim.wrapped);
    } catch {
      throw new SyncError('The code did not match. Check it and try again.');
    }
    const keys = await deriveKeys(key);
    if (keys.accountId !== claim.accountId) throw new SyncError('The code did not match. Check it and try again.');
    await this.adopt(keys);
  }

  /** Join with a recovery key typed by hand (also re-creates the account if it was deleted). */
  async joinWithRecoveryKey(text: string): Promise<void> {
    const raw = decodeRecoveryKey(text);
    if (!raw) throw new SyncError('That is not a valid recovery key.');
    const keys = await deriveKeys(raw);
    await this.request('POST', '/v1/account', { accountId: keys.accountId, secret: keys.secret });
    await this.adopt(keys);
  }

  /** Stop syncing on this device. Local data stays; the account stays on the server. */
  async disable(): Promise<void> {
    this.keys = null;
    await this.store.delete(ACCOUNT_KEY);
    await this.store.delete(CURSOR_KEY);
    this.patch({ status: 'off', accountId: null, error: null });
    this.updateInterval();
  }

  /** Delete everything on the server, then stop syncing here. */
  async deleteRemote(): Promise<void> {
    const keys = this.requireKeys();
    await this.request('DELETE', '/v1/account', undefined, keys);
    await this.disable();
  }

  /** Run one sync now (or queue one if a run is in progress). */
  async syncNow(): Promise<void> {
    if (!this.keys) return;
    if (this.running) {
      this.pending = true;
      return;
    }
    this.running = true;
    this.patch({ status: 'syncing' });
    try {
      await this.run(this.keys);
      this.patch({ status: 'idle', lastSyncAt: Date.now(), error: null });
    } catch (err) {
      const offline = err instanceof TypeError || (typeof navigator !== 'undefined' && navigator.onLine === false);
      const message = err instanceof Error ? err.message : String(err);
      this.patch({ status: offline ? 'offline' : 'error', error: offline ? null : message });
      if (!offline) console.warn('sync failed', err);
    } finally {
      this.running = false;
      if (this.pending) {
        this.pending = false;
        this.scheduleSoon();
      }
    }
  }

  // ---- internals ------------------------------------------------------------

  private async adopt(keys: AccountKeys): Promise<void> {
    this.keys = keys;
    await this.store.set(ACCOUNT_KEY, { key: toBase64Url(keys.key), accountId: keys.accountId } satisfies StoredAccount);
    await this.store.set(CURSOR_KEY, 0);
    await this.store.markAllDirty();
    this.patch({ status: 'idle', accountId: keys.accountId, error: null, lastSyncAt: null });
    this.updateInterval();
    await this.syncNow();
  }

  private requireKeys(): AccountKeys {
    if (!this.keys) throw new SyncError('Sync is not set up on this device.');
    return this.keys;
  }

  private async run(keys: AccountKeys): Promise<void> {
    let since = (await this.store.get<number>(CURSOR_KEY)) ?? 0;
    for (let round = 0; round < 1000; round++) {
      const dirty = await this.store.dirty(MAX_PUSH);
      const changes: WireRecord[] = [];
      for (const { key, meta } of dirty) {
        const value = meta.t ? undefined : await this.store.get(key);
        if (!meta.t && value === undefined) {
          // Value vanished without a tombstone (should not happen); drop the flag.
          await this.store.markPushed(key, meta.u);
          continue;
        }
        const { rid, blob } = await encryptRecord(keys, key, value);
        changes.push({ rid, blob, u: meta.u, t: meta.t });
      }

      const res = await this.request<SyncResponse>('POST', '/v1/sync', { since, changes }, keys);

      const rejected = new Set(res.rejected.map((r) => r.rid));
      const pushedByRid = new Map<string, { key: string; u: number }>();
      for (let i = 0; i < dirty.length; i++) {
        const d = dirty[i];
        const c = changes[i];
        if (!d || !c) continue;
        pushedByRid.set(c.rid, { key: d.key, u: d.meta.u });
        if (!rejected.has(c.rid)) await this.store.markPushed(d.key, d.meta.u);
      }

      const changed: string[] = [];
      for (const rec of [...res.rejected, ...res.changes]) {
        let k: string;
        let v: unknown;
        try {
          ({ k, v } = await decryptRecord(keys, rec.rid, rec.blob));
        } catch (err) {
          console.warn('Could not decrypt a synced record; skipped', err);
          // Never leave a rejected push dirty, or we would retry it forever.
          const p = pushedByRid.get(rec.rid);
          if (p && rejected.has(rec.rid)) await this.store.markPushed(p.key, p.u);
          continue;
        }
        if (!isSyncedKey(k)) continue;
        const local = await this.store.meta(k);
        if (local?.d === 1 && local.u > rec.u) continue; // our newer edit wins and will be pushed
        if (local && local.d === 0 && local.u === rec.u && local.t === rec.t && !rejected.has(rec.rid)) continue; // echo of what we already have
        await this.store.applyRemote(k, rec.t ? undefined : v, rec.u);
        changed.push(k);
      }

      since = res.seq;
      await this.store.set(CURSOR_KEY, since);
      this.store.emitRemote(changed);

      if (!res.hasMore && dirty.length < MAX_PUSH) return;
    }
  }

  private async request<T = unknown>(method: string, path: string, body?: unknown, auth?: AccountKeys): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth) headers['Authorization'] = `Bearer ${auth.accountId}.${auth.secret}`;
    const res = await this.fetchFn(`${this.apiUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* not JSON */
    }
    if (!res.ok) {
      const msg = (data as { error?: string } | null)?.error ?? `Sync server answered ${res.status}`;
      throw new SyncError(msg, res.status);
    }
    return data as T;
  }

  /** Stop background timers (tests; not needed in the app). */
  stop(): void {
    if (this.debounce !== undefined) clearTimeout(this.debounce);
    if (this.interval !== undefined) clearInterval(this.interval);
    this.debounce = this.interval = undefined;
  }

  private scheduleSoon(): void {
    if (!this.keys) return;
    if (this.debounce !== undefined) clearTimeout(this.debounce);
    this.debounce = unref(
      setTimeout(() => {
        this.debounce = undefined;
        void this.syncNow();
      }, DEBOUNCE_MS),
    );
  }

  private updateInterval(): void {
    const wanted = this.keys !== null && (typeof document === 'undefined' || document.visibilityState === 'visible');
    if (wanted && this.interval === undefined) {
      this.interval = unref(setInterval(() => void this.syncNow(), INTERVAL_MS));
    } else if (!wanted && this.interval !== undefined) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  private patch(p: Partial<SyncState>): void {
    this.state.set({ ...this.state.get(), ...p });
  }
}
