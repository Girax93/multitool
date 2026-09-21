import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLAIMS_PER_WINDOW, MAX_PUSH, PULL_LIMIT, handle, type Env, type WireRecord } from './handler.js';
import { openDatabase } from './node-server.js';

const ORIGIN = 'https://multitool.ariilden.com';
const A = { accountId: 'acc_aaaaaaaaaaaaaaaaaaaa', secret: 's'.repeat(40) };
const B = { accountId: 'acc_bbbbbbbbbbbbbbbbbbbb', secret: 't'.repeat(40) };

function env(): Env {
  return { DB: openDatabase(':memory:') };
}

async function call(e: Env, method: string, path: string, body?: unknown, auth?: { accountId: string; secret: string }, headers: Record<string, string> = {}) {
  const h: Record<string, string> = { Origin: ORIGIN, ...headers };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (auth) h['Authorization'] = `Bearer ${auth.accountId}.${auth.secret}`;
  const res = await handle(new Request(`https://api.test${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), e);
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: text ? (JSON.parse(text) as Record<string, unknown>) : null };
}

const rec = (rid: string, u: number, blob = `blob-${rid}-${u}`, t: 0 | 1 = 0): WireRecord => ({ rid: rid.padEnd(16, '_'), blob, u, t });

test('health and CORS', async () => {
  const e = env();
  const ok = await call(e, 'GET', '/v1/health');
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body, { ok: true });
  assert.equal(ok.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  const other = await call(e, 'GET', '/v1/health', undefined, undefined, { Origin: 'https://evil.example' });
  assert.equal(other.headers.get('Access-Control-Allow-Origin'), null);
  const local = await call(e, 'GET', '/v1/health', undefined, undefined, { Origin: 'http://127.0.0.1:8765' });
  assert.equal(local.headers.get('Access-Control-Allow-Origin'), 'http://127.0.0.1:8765');
  const pre = await handle(new Request('https://api.test/v1/sync', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), e);
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('Access-Control-Allow-Methods'), 'GET, POST, DELETE, OPTIONS');
  assert.equal((await call(e, 'GET', '/nope')).status, 404);
});

test('accounts: create, idempotent, conflict, auth', async () => {
  const e = env();
  assert.equal((await call(e, 'POST', '/v1/account', A)).status, 201);
  assert.equal((await call(e, 'POST', '/v1/account', A)).status, 200);
  assert.equal((await call(e, 'POST', '/v1/account', { accountId: A.accountId, secret: 'x'.repeat(40) })).status, 409);
  assert.equal((await call(e, 'POST', '/v1/account', { accountId: 'bad id', secret: A.secret })).status, 400);
  assert.equal((await call(e, 'POST', '/v1/sync', { since: 0 })).status, 401);
  assert.equal((await call(e, 'POST', '/v1/sync', { since: 0 }, { accountId: A.accountId, secret: 'x'.repeat(40) })).status, 401);
  assert.equal((await call(e, 'POST', '/v1/sync', { since: 0 }, A)).status, 200);
});

test('sync: push, pull, last-writer-wins, tombstones', async () => {
  const e = env();
  await call(e, 'POST', '/v1/account', A);
  await call(e, 'POST', '/v1/account', B);

  // device 1 pushes two records
  let r = await call(e, 'POST', '/v1/sync', { since: 0, changes: [rec('k1', 100), rec('k2', 100)] }, A);
  assert.equal(r.status, 200);
  assert.equal(r.body?.seq, 2);
  assert.deepEqual(r.body?.rejected, []);
  assert.equal((r.body?.changes as WireRecord[]).length, 2); // echoes are included
  assert.equal(r.body?.hasMore, false);

  // device 2 pulls from scratch
  r = await call(e, 'POST', '/v1/sync', { since: 0 }, A);
  const pulled = r.body?.changes as WireRecord[];
  assert.deepEqual(
    pulled.map((c) => [c.rid, c.u, c.seq]),
    [
      [rec('k1', 0).rid, 100, 1],
      [rec('k2', 0).rid, 100, 2],
    ],
  );

  // an older write for k1 is rejected and the server copy comes back
  r = await call(e, 'POST', '/v1/sync', { since: 2, changes: [rec('k1', 50, 'stale')] }, A);
  assert.equal(r.body?.seq, 3); // the sequence number was reserved even though nothing applied
  const rejected = r.body?.rejected as WireRecord[];
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0]?.blob, 'blob-k1-100');
  assert.deepEqual(r.body?.changes, []);

  // a newer write wins; equal timestamps are applied too (later arrival wins)
  r = await call(e, 'POST', '/v1/sync', { since: 3, changes: [rec('k1', 200, 'new')] }, A);
  assert.deepEqual(r.body?.rejected, []);
  assert.equal((r.body?.changes as WireRecord[])[0]?.blob, 'new');
  r = await call(e, 'POST', '/v1/sync', { since: 4, changes: [rec('k1', 200, 'newer-same-ts')] }, A);
  assert.deepEqual(r.body?.rejected, []);

  // tombstone
  r = await call(e, 'POST', '/v1/sync', { since: 5, changes: [rec('k2', 300, 'x', 1)] }, A);
  const tomb = (r.body?.changes as WireRecord[])[0];
  assert.equal(tomb?.t, 1);
  assert.equal(tomb?.seq, 6);

  // accounts are isolated
  r = await call(e, 'POST', '/v1/sync', { since: 0 }, B);
  assert.deepEqual(r.body?.changes, []);
  assert.equal(r.body?.seq, 0);

  // validation
  assert.equal((await call(e, 'POST', '/v1/sync', { since: -1 }, A)).status, 400);
  assert.equal((await call(e, 'POST', '/v1/sync', { changes: [{ rid: 'x', blob: '', u: 1 }] }, A)).status, 400);
  assert.equal((await call(e, 'POST', '/v1/sync', { changes: [rec('k9', 1), rec('k9', 2)] }, A)).status, 400);
  const tooMany = Array.from({ length: MAX_PUSH + 1 }, (_, i) => rec(`m${i}`, 1));
  assert.equal((await call(e, 'POST', '/v1/sync', { changes: tooMany }, A)).status, 400);
});

test('sync: pagination', async () => {
  const e = env();
  await call(e, 'POST', '/v1/account', A);
  const total = PULL_LIMIT + 5;
  for (let i = 0; i < total; i += MAX_PUSH) {
    const chunk = Array.from({ length: Math.min(MAX_PUSH, total - i) }, (_, j) => rec(`p${i + j}`, 1));
    const r = await call(e, 'POST', '/v1/sync', { since: 10_000, changes: chunk }, A);
    assert.equal(r.status, 200);
  }
  let since = 0;
  let got = 0;
  for (let i = 0; i < 5; i++) {
    const r = await call(e, 'POST', '/v1/sync', { since }, A);
    const changes = r.body?.changes as WireRecord[];
    got += changes.length;
    since = r.body?.seq as number;
    if (!r.body?.hasMore) break;
    assert.equal(changes.length, PULL_LIMIT);
  }
  assert.equal(got, total);
  assert.equal(since, total);
});

test('pairing: create, claim once, expiry, rate limit', async () => {
  const e = env();
  await call(e, 'POST', '/v1/account', A);
  const pairing = { lookupId: 'look_1234567890abcdef', salt: 'c2FsdA==', wrapped: 'd3JhcHBlZA==' };
  assert.equal((await call(e, 'POST', '/v1/pair', pairing)).status, 401);
  assert.equal((await call(e, 'POST', '/v1/pair', pairing, A)).status, 201);
  const claim = await call(e, 'POST', '/v1/pair/claim', { lookupId: pairing.lookupId });
  assert.equal(claim.status, 200);
  assert.deepEqual(claim.body, { accountId: A.accountId, salt: pairing.salt, wrapped: pairing.wrapped });
  assert.equal((await call(e, 'POST', '/v1/pair/claim', { lookupId: pairing.lookupId })).status, 404);

  // expired pairing
  await call(e, 'POST', '/v1/pair', { ...pairing, lookupId: 'look_expired00000000' }, A);
  await e.DB.prepare('UPDATE pairings SET expires_at = 1').run();
  assert.equal((await call(e, 'POST', '/v1/pair/claim', { lookupId: 'look_expired00000000' })).status, 404);

  // rate limit per IP
  let last = 0;
  for (let i = 0; i < CLAIMS_PER_WINDOW + 2; i++) {
    last = (await call(e, 'POST', '/v1/pair/claim', { lookupId: 'look_nope00000000000' }, undefined, { 'CF-Connecting-IP': '203.0.113.9' })).status;
  }
  assert.equal(last, 429);
  assert.equal((await call(e, 'POST', '/v1/pair/claim', { lookupId: 'look_nope00000000000' }, undefined, { 'CF-Connecting-IP': '203.0.113.10' })).status, 404);
});

test('delete account removes everything', async () => {
  const e = env();
  await call(e, 'POST', '/v1/account', A);
  await call(e, 'POST', '/v1/sync', { changes: [rec('k1', 1)] }, A);
  assert.equal((await call(e, 'DELETE', '/v1/account', undefined, A)).status, 204);
  assert.equal((await call(e, 'POST', '/v1/sync', { since: 0 }, A)).status, 401);
  assert.equal((await call(e, 'POST', '/v1/account', A)).status, 201);
  const r = await call(e, 'POST', '/v1/sync', { since: 0 }, A);
  assert.deepEqual(r.body?.changes, []);
});
