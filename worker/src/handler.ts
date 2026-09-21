// MultiTool sync API — request handling, independent of the runtime.
// Runs on Cloudflare Workers (src/index.ts) and on Node for tests / local dev
// (src/node-server.ts). See docs/SYNC.md for the protocol.

export interface Env {
  DB: D1Database;
  /** Comma-separated extra origins allowed by CORS (localhost is always allowed). */
  ALLOWED_ORIGINS?: string;
}

export const MAX_PUSH = 50;
export const PULL_LIMIT = 300;
export const MAX_BLOB_CHARS = 256 * 1024;
export const PAIRING_TTL_MS = 10 * 60 * 1000;
export const CLAIMS_PER_WINDOW = 30;
export const CLAIM_WINDOW_MS = 10 * 60 * 1000;

const PRODUCTION_ORIGIN = 'https://multitool.ariilden.com';
const ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
const SECRET_RE = /^[A-Za-z0-9_-]{32,128}$/;
const B64_RE = /^[A-Za-z0-9+/=_-]*$/;

export interface WireRecord {
  rid: string;
  blob: string;
  u: number;
  t: 0 | 1;
  seq?: number;
}

interface RecordRow {
  rid: string;
  blob: string;
  updated_at: number;
  deleted: number;
  seq: number;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// ---- helpers ----------------------------------------------------------------

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin');
  const extra = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const allowed =
    origin !== null &&
    (origin === PRODUCTION_ORIGIN || extra.includes(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
  const h: Record<string, string> = { Vary: 'Origin' };
  if (allowed && origin) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'GET, POST, DELETE, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}

function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  let data: unknown;
  try {
    data = await request.json();
  } catch {
    throw new HttpError(400, 'Body must be JSON');
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new HttpError(400, 'Body must be an object');
  return data as Record<string, unknown>;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function authenticate(request: Request, env: Env): Promise<string> {
  const header = request.headers.get('Authorization') ?? '';
  const m = /^Bearer\s+([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(header);
  if (!m || !m[1] || !m[2]) throw new HttpError(401, 'Missing or malformed Authorization header');
  const [, accountId, secret] = m;
  const row = await env.DB.prepare('SELECT secret_hash FROM accounts WHERE id = ?').bind(accountId).first<{ secret_hash: string }>();
  if (!row || !timingSafeEqual(row.secret_hash, await sha256Hex(secret))) throw new HttpError(401, 'Unknown account or wrong secret');
  return accountId;
}

function rowToWire(r: RecordRow): WireRecord {
  return { rid: r.rid, blob: r.blob, u: Number(r.updated_at), t: Number(r.deleted) ? 1 : 0, seq: Number(r.seq) };
}

function parseChanges(raw: unknown): WireRecord[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new HttpError(400, 'changes must be an array');
  if (raw.length > MAX_PUSH) throw new HttpError(400, `At most ${MAX_PUSH} changes per request`);
  const out: WireRecord[] = [];
  const seen = new Set<string>();
  for (const c of raw as Record<string, unknown>[]) {
    if (typeof c !== 'object' || c === null) throw new HttpError(400, 'Malformed change');
    const { rid, blob, u, t } = c;
    if (typeof rid !== 'string' || !ID_RE.test(rid)) throw new HttpError(400, 'Malformed rid');
    if (typeof blob !== 'string' || blob.length > MAX_BLOB_CHARS || !B64_RE.test(blob)) throw new HttpError(400, `Malformed blob for ${rid}`);
    if (typeof u !== 'number' || !Number.isInteger(u) || u < 0) throw new HttpError(400, `Malformed updatedAt for ${rid}`);
    if (seen.has(rid)) throw new HttpError(400, `Duplicate rid ${rid}`);
    seen.add(rid);
    out.push({ rid, blob, u, t: t === 1 || t === true ? 1 : 0 });
  }
  return out;
}

// ---- routes -----------------------------------------------------------------

async function createAccount(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  const { accountId, secret } = body;
  if (typeof accountId !== 'string' || !ID_RE.test(accountId)) throw new HttpError(400, 'Malformed accountId');
  if (typeof secret !== 'string' || !SECRET_RE.test(secret)) throw new HttpError(400, 'Malformed secret');
  const hash = await sha256Hex(secret);
  const existing = await env.DB.prepare('SELECT secret_hash FROM accounts WHERE id = ?').bind(accountId).first<{ secret_hash: string }>();
  if (existing) {
    if (timingSafeEqual(existing.secret_hash, hash)) return json({ accountId }, 200);
    throw new HttpError(409, 'Account exists');
  }
  await env.DB.prepare('INSERT INTO accounts (id, secret_hash, seq, created_at) VALUES (?, ?, 0, ?)').bind(accountId, hash, Date.now()).run();
  return json({ accountId }, 201);
}

async function deleteAccount(accountId: string, env: Env): Promise<Response> {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM records WHERE account_id = ?').bind(accountId),
    env.DB.prepare('DELETE FROM pairings WHERE account_id = ?').bind(accountId),
    env.DB.prepare('DELETE FROM accounts WHERE id = ?').bind(accountId),
  ]);
  return new Response(null, { status: 204 });
}

/**
 * Push + pull in one atomic batch: reserve `n` sequence numbers, upsert each
 * change (last writer wins by updatedAt), read back the pushed rows to find
 * rejected ones, then pull everything after `since`.
 */
async function sync(accountId: string, request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  const since = body.since === undefined ? 0 : body.since;
  if (typeof since !== 'number' || !Number.isInteger(since) || since < 0) throw new HttpError(400, 'Malformed since');
  const changes = parseChanges(body.changes);
  const n = changes.length;
  const db = env.DB;

  const stmts: D1PreparedStatement[] = [];
  if (n) {
    stmts.push(db.prepare('UPDATE accounts SET seq = seq + ? WHERE id = ?').bind(n, accountId));
    changes.forEach((c, k) => {
      stmts.push(
        db
          .prepare(
            `INSERT INTO records (account_id, rid, blob, updated_at, deleted, seq)
             VALUES (?, ?, ?, ?, ?, (SELECT seq FROM accounts WHERE id = ?) - ?)
             ON CONFLICT (account_id, rid) DO UPDATE SET
               blob = excluded.blob, updated_at = excluded.updated_at, deleted = excluded.deleted, seq = excluded.seq
             WHERE excluded.updated_at >= records.updated_at`,
          )
          .bind(accountId, c.rid, c.blob, c.u, c.t, accountId, n - 1 - k),
      );
    });
    const placeholders = changes.map(() => '?').join(', ');
    stmts.push(
      db
        .prepare(`SELECT rid, blob, updated_at, deleted, seq FROM records WHERE account_id = ? AND rid IN (${placeholders})`)
        .bind(accountId, ...changes.map((c) => c.rid)),
    );
  }
  stmts.push(
    db
      .prepare('SELECT rid, blob, updated_at, deleted, seq FROM records WHERE account_id = ? AND seq > ? ORDER BY seq LIMIT ?')
      .bind(accountId, since, PULL_LIMIT + 1),
  );
  stmts.push(db.prepare('SELECT seq FROM accounts WHERE id = ?').bind(accountId));

  const results = await db.batch<Record<string, unknown>>(stmts);
  const seqRow = results[results.length - 1]?.results[0] as { seq: number } | undefined;
  const accountSeq = Number(seqRow?.seq ?? 0);
  const pulledRows = (results[results.length - 2]?.results ?? []) as unknown as RecordRow[];

  let rejected: WireRecord[] = [];
  if (n) {
    const start = accountSeq - n + 1;
    const pushedRows = (results[results.length - 3]?.results ?? []) as unknown as RecordRow[];
    rejected = pushedRows.filter((r) => Number(r.seq) < start).map(rowToWire);
  }

  const hasMore = pulledRows.length > PULL_LIMIT;
  const pulled = (hasMore ? pulledRows.slice(0, PULL_LIMIT) : pulledRows).map(rowToWire);
  const last = pulled[pulled.length - 1];
  const seq = hasMore && last?.seq !== undefined ? last.seq : accountSeq;
  return json({ seq, changes: pulled, rejected, hasMore });
}

async function createPairing(accountId: string, request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  const { lookupId, salt, wrapped } = body;
  if (typeof lookupId !== 'string' || !ID_RE.test(lookupId)) throw new HttpError(400, 'Malformed lookupId');
  if (typeof salt !== 'string' || salt.length > 64 || !B64_RE.test(salt)) throw new HttpError(400, 'Malformed salt');
  if (typeof wrapped !== 'string' || wrapped.length > 512 || !B64_RE.test(wrapped)) throw new HttpError(400, 'Malformed wrapped key');
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM pairings WHERE expires_at < ?').bind(now),
    env.DB
      .prepare('INSERT OR REPLACE INTO pairings (lookup_id, account_id, salt, wrapped, expires_at) VALUES (?, ?, ?, ?, ?)')
      .bind(lookupId, accountId, salt, wrapped, now + PAIRING_TTL_MS),
  ]);
  return json({ expiresAt: now + PAIRING_TTL_MS }, 201);
}

async function claimPairing(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  const { lookupId } = body;
  if (typeof lookupId !== 'string' || !ID_RE.test(lookupId)) throw new HttpError(400, 'Malformed lookupId');
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  const now = Date.now();
  const db = env.DB;
  const [, , countRes] = await db.batch<{ n: number }>([
    db.prepare('DELETE FROM claims WHERE at < ?').bind(now - CLAIM_WINDOW_MS),
    db.prepare('INSERT INTO claims (ip, at) VALUES (?, ?)').bind(ip, now),
    db.prepare('SELECT COUNT(*) AS n FROM claims WHERE ip = ? AND at >= ?').bind(ip, now - CLAIM_WINDOW_MS),
  ]);
  if (Number(countRes?.results[0]?.n ?? 0) > CLAIMS_PER_WINDOW) throw new HttpError(429, 'Too many attempts, try again later');

  const row = await db
    .prepare('SELECT account_id, salt, wrapped, expires_at FROM pairings WHERE lookup_id = ?')
    .bind(lookupId)
    .first<{ account_id: string; salt: string; wrapped: string; expires_at: number }>();
  if (!row || Number(row.expires_at) < now) throw new HttpError(404, 'Code not found or expired');
  await db.prepare('DELETE FROM pairings WHERE lookup_id = ?').bind(lookupId).run();
  return json({ accountId: row.account_id, salt: row.salt, wrapped: row.wrapped });
}

// ---- entry ------------------------------------------------------------------

export async function handle(request: Request, env: Env): Promise<Response> {
  const cors = corsHeaders(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const withCors = (res: Response): Response => {
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  };
  try {
    const route = `${request.method} ${path}`;
    switch (route) {
      case 'GET /v1/health':
        return withCors(json({ ok: true }));
      case 'POST /v1/account':
        return withCors(await createAccount(request, env));
      case 'DELETE /v1/account':
        return withCors(await deleteAccount(await authenticate(request, env), env));
      case 'POST /v1/sync':
        return withCors(await sync(await authenticate(request, env), request, env));
      case 'POST /v1/pair':
        return withCors(await createPairing(await authenticate(request, env), request, env));
      case 'POST /v1/pair/claim':
        return withCors(await claimPairing(request, env));
      default:
        throw new HttpError(404, 'Not found');
    }
  } catch (err) {
    if (err instanceof HttpError) return withCors(json({ error: err.message }, err.status));
    console.error(err);
    return withCors(json({ error: 'Internal error' }, 500));
  }
}
