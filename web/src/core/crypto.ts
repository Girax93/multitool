// Crypto for sync: key derivation, record encryption, device-linking codes and
// the recovery key. WebCrypto only (works in browsers, the Android WebView and
// Node ≥ 20 for tests). See docs/SYNC.md for the scheme.

export type Bytes = Uint8Array<ArrayBuffer>;

/** Unambiguous alphabet (no 0/O/1/I) for codes and the recovery key. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 8;
export const ACCOUNT_KEY_BYTES = 32;
const PBKDF2_ITERATIONS = 200_000;
const enc = new TextEncoder();
const dec = new TextDecoder();

// ---- encoding ---------------------------------------------------------------

export function utf8(s: string): Bytes {
  return enc.encode(s);
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromBase64(s: string): Bytes {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(s: string): Bytes {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return fromBase64(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
}

export function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

export function randomBytes(n: number): Bytes {
  return crypto.getRandomValues(new Uint8Array(n));
}

// ---- primitives -------------------------------------------------------------

export async function sha256(data: Uint8Array): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data as Bytes));
}

export async function hkdf(ikm: Uint8Array, info: string, length = 32): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', ikm as Bytes, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: utf8(info) }, key, length * 8);
  return new Uint8Array(bits);
}

async function aesKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw as Bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function hmacKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw as Bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

/** iv (12 bytes) ‖ ciphertext, AES-256-GCM. */
export async function encrypt(key: CryptoKey, plaintext: Uint8Array, aad: Uint8Array): Promise<Bytes> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad as Bytes }, key, plaintext as Bytes);
  return concat(iv, new Uint8Array(ct));
}

export async function decrypt(key: CryptoKey, data: Uint8Array, aad: Uint8Array): Promise<Bytes> {
  if (data.length < 13) throw new Error('Ciphertext too short');
  const iv = data.slice(0, 12) as Bytes;
  const ct = data.slice(12) as Bytes;
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad as Bytes }, key, ct));
}

// ---- account keys -----------------------------------------------------------

export interface AccountKeys {
  /** The 32-byte account key: the only secret; everything else is derived. */
  key: Bytes;
  accountId: string;
  secret: string;
  enc: CryptoKey;
  mac: CryptoKey;
}

export function newAccountKey(): Bytes {
  return randomBytes(ACCOUNT_KEY_BYTES);
}

export async function deriveKeys(key: Uint8Array): Promise<AccountKeys> {
  if (key.length !== ACCOUNT_KEY_BYTES) throw new Error('Account key must be 32 bytes');
  const [id, auth, encRaw, macRaw] = await Promise.all([
    hkdf(key, 'multitool/id'),
    hkdf(key, 'multitool/auth'),
    hkdf(key, 'multitool/enc'),
    hkdf(key, 'multitool/rid'),
  ]);
  return {
    key: key as Bytes,
    accountId: toBase64Url(id).slice(0, 22),
    secret: toBase64Url(auth),
    enc: await aesKey(encRaw),
    mac: await hmacKey(macRaw),
  };
}

/** Opaque, deterministic server id for a local key. */
export async function recordId(keys: AccountKeys, k: string): Promise<string> {
  return toBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', keys.mac, utf8(k))));
}

export interface EncryptedRecord {
  rid: string;
  blob: string;
}

/** Encrypt `{k, v}` (v omitted for tombstones); the rid is bound as AAD. */
export async function encryptRecord(keys: AccountKeys, k: string, v: unknown | undefined): Promise<EncryptedRecord> {
  const rid = await recordId(keys, k);
  const payload = v === undefined ? { k } : { k, v };
  const blob = toBase64(await encrypt(keys.enc, utf8(JSON.stringify(payload)), utf8(rid)));
  return { rid, blob };
}

export async function decryptRecord(keys: AccountKeys, rid: string, blob: string): Promise<{ k: string; v?: unknown }> {
  const plain = await decrypt(keys.enc, fromBase64(blob), utf8(rid));
  const data = JSON.parse(dec.decode(plain)) as { k?: unknown; v?: unknown };
  if (typeof data.k !== 'string') throw new Error('Malformed record');
  return 'v' in data ? { k: data.k, v: data.v } : { k: data.k };
}

// ---- recovery key (base32 over the unambiguous alphabet) --------------------

export function encodeRecoveryKey(key: Uint8Array): string {
  let bits = 0;
  let acc = 0;
  let out = '';
  for (const b of key) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += CODE_ALPHABET[(acc >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += CODE_ALPHABET[(acc << (5 - bits)) & 31];
  return out.replace(/(.{4})(?=.)/g, '$1-');
}

export function decodeRecoveryKey(text: string): Bytes | null {
  const clean = text.toUpperCase().replace(/[^A-Z2-9]/g, '');
  if (clean.length !== Math.ceil((ACCOUNT_KEY_BYTES * 8) / 5)) return null;
  const out = new Uint8Array(ACCOUNT_KEY_BYTES);
  let bits = 0;
  let acc = 0;
  let n = 0;
  for (const ch of clean) {
    const v = CODE_ALPHABET.indexOf(ch);
    if (v < 0) return null;
    acc = ((acc << 5) | v) & 0x1fff;
    bits += 5;
    if (bits >= 8 && n < ACCOUNT_KEY_BYTES) {
      out[n++] = (acc >>> (bits - 8)) & 0xff;
      bits -= 8;
    }
  }
  if (n !== ACCOUNT_KEY_BYTES) return null;
  return out;
}

// ---- device-linking codes -----------------------------------------------------

export function randomCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let s = '';
  for (const b of bytes) s += CODE_ALPHABET[b & 31];
  return s;
}

export function formatCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** Uppercase, strip separators; null unless it is a valid 8-character code. */
export function normaliseCode(input: string): string | null {
  const s = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length !== CODE_LENGTH) return null;
  for (const ch of s) if (!CODE_ALPHABET.includes(ch)) return null;
  return s;
}

export async function lookupIdFor(code: string): Promise<string> {
  return toBase64Url(await sha256(utf8(`multitool/pair${code}`)));
}

async function codeWrapKey(code: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', utf8(code), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as Bytes, iterations: PBKDF2_ITERATIONS },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export interface WrappedKey {
  lookupId: string;
  salt: string;
  wrapped: string;
}

export async function wrapAccountKey(code: string, key: Uint8Array): Promise<WrappedKey> {
  const salt = randomBytes(16);
  const wrapKey = await codeWrapKey(code, salt);
  const lookupId = await lookupIdFor(code);
  const wrapped = await encrypt(wrapKey, key, utf8(lookupId));
  return { lookupId, salt: toBase64(salt), wrapped: toBase64(wrapped) };
}

export async function unwrapAccountKey(code: string, salt: string, wrapped: string): Promise<Bytes> {
  const wrapKey = await codeWrapKey(code, fromBase64(salt));
  return decrypt(wrapKey, fromBase64(wrapped), utf8(await lookupIdFor(code)));
}
