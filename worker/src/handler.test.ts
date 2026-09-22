import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLAIMS_PER_WINDOW, MAX_PUSH, PULL_LIMIT, handle, type Env, type WireRecord } from './handler.js';
import { openDatabase } from './node-server.js';

const ORIGIN = 'https://multitool.ariilden.com';
const A = { accountId: 'acc_aaaaaaaaaaaaaaaaaaaa', secret: 's'.repeat(40) };
const B = { accountId: 'acc_bbbbbbbbbbbbbbbbbbbb', secret: 't'.repeat(40) };

interface Auth {
  accountId: string;
  token: string;
}

function env(): Env {
  return { DB: openDatabase(':memory:') };
}

async function call(e: Env, method: string, path: string, body?: unknown, auth?: Auth, headers: Record<string, string> = {}) {
  const h: Record<string, string> = { Origin: ORIGIN, ...headers };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (auth) h['Authorization'] = `Bearer ${auth.accountId}.${auth.token}`;
  const res = await handle(new Request(`https://api.test${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), e);
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: text ? (JSON.parse(text) as Record<string, unknown>) : null };
}

/** Create (or re-register a device on) an account; returns that device's auth. */
async function register(e: Env, acc: { accountId: string; secret: string }, name = 'Test device'): Promise<Auth & { deviceId: string; status: number }> {
  const r = await call(e, 'POST', '/v1/account', { ...acc, device: { name } });
  const device = r.body?.device as { id: string; token: string } | undefined;
  assert.ok(device?.token, `registration failed: ${r.status} ${JSON.stringify(r.body)}`);
  return { accountId: acc.accountId, token: device.token, deviceId: device.id, status: r.status };
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
  assert.equal(pre.headers.get('Access-Control-Allow-Methods'), 'GET, POST, PATCH, DELETE, OPTIONS');
  assert.equal((await call(e, 'GET', '/nope')).status, 404);
});

test('accounts: create, re-register, conflict, device-token auth', async () => {
  const e = env();
  const first = await register(e, A, 'Laptop');
  assert.equal(first.status, 201);
  const second = await register(e, A, 'Phone');
  assert.equal(second.status, 200); // same secret → one more device
  assert.notEqual(first.token, second.token);
  assert.equal((await call(e, 'POST', '/v1/account', { accountId: A.accountId, secret: 'x'.repeat(40) })).status, 409);
  assert.equal((await call(e, 'POST', '/v1/account', { accountId: 'bad id', secret: A.secret })).status, 400);
  assert.equal((await call(e, 'POST', '/v1/sync', { since: 0 })).status, 401);
  // the account secret itself is not a data credential
  assert.equal((await call(e, 'POST', '/v1/sync', { since: 0 }, { accountId: A.accountId, token: A.secret })).status, 401);
  assert.equal((await call(e, 'POST', '/v1/sync', { since: 0 }, { accountId: A.accountId, token: 'x'.repeat(43) })).status, 401);
  assert.equal((await call(e, 'POST', '/v1/sync', { since: 0 }, first)).status, 200);
  assert.equal((await call(e, 'POST', '/v1/sync', { since: 0 }, second)).status, 200);
});

test('devices: list, rename, remove locks the device out', async () => {
  const e = env();
  const laptop = await register(e, A, 'Laptop');
  const phone = await register(e, A, '  My   phone  ');
  const other = await register(e, B, 'Someone else');
  let r = await call(e, 'GET', '/v1/devices', undefined, laptop);
  assert.equal(r.status, 200);
  const devices = r.body?.devices as { id: string; name: string; createdAt: number; lastSeenAt: number }[];
  assert.deepEqual(
    devices.map((d) => d.name),
    ['Laptop', 'My phone'],
  );
  assert.equal(r.body?.current, laptop.deviceId);
  assert.ok(devices.every((d) => d.createdAt > 0 && d.lastSeenAt > 0));

  // rename
  r = await call(e, 'PATCH', `/v1/devices/${phone.deviceId}`, { name: 'Pixel' }, laptop);
  assert.equal(r.status, 200);
  assert.equal((r.body as { name: string }).name, 'Pixel');
  // other accounts cannot see or touch these devices
  assert.equal((await call(e, 'PATCH', `/v1/devices/${phone.deviceId}`, { name: 'x' }, other)).status, 404);
  assert.equal((await call(e, 'DELETE', `/v1/devices/${phone.deviceId}`, undefined, other)).status, 404);
  assert.equal(((await call(e, 'GET', '/v1/devices', undefined, other)).body?.devices as unknown[]).length, 1);

  // cannot remove yourself through this endpoint
  assert.equal((await call(e, 'DELETE', `/v1/devices/${laptop.deviceId}`, undefined, laptop)).status, 400);
  // removing the phone: it is gone from the list and its token stops working
  assert.equal((await call(e, 'DELETE', `/v1/devices/${phone.deviceId}`, undefined, laptop)).status, 204);
  assert.equal((await call(e, 'DELETE', `/v1/devices/${phone.deviceId}`, undefined, laptop)).status, 404);
  r = await call(e, 'POST', '/v1/sync', { since: 0 }, phone);
  assert.equal(r.status, 401);
  assert.match(String(r.body?.error), /not linked/);
  assert.equal((await call(e, 'GET', '/v1/devices', undefined, phone)).status, 401);
  assert.equal(((await call(e, 'GET', '/v1/devices', undefined, laptop)).body?.devices as unknown[]).length, 1);
});

test('sync: push, pull, last-writer-wins, tombstones', async () => {
  const e = env();
  const A = await register(e, { accountId: 'acc_aaaaaaaaaaaaaaaaaaaa', secret: 's'.repeat(40) });
  const B = await register(e, { accountId: 'acc_bbbbbbbbbbbbbbbbbbbb', secret: 't'.repeat(40) });

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
  const A = await register(e, { accountId: 'acc_aaaaaaaaaaaaaaaaaaaa', secret: 's'.repeat(40) });
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

test('pairing: create, claim once (registers the device), expiry, rate limit', async () => {
  const e = env();
  const A = await register(e, { accountId: 'acc_aaaaaaaaaaaaaaaaaaaa', secret: 's'.repeat(40) });
  const pairing = { lookupId: 'look_1234567890abcdef', salt: 'c2FsdA==', wrapped: 'd3JhcHBlZA==' };
  assert.equal((await call(e, 'POST', '/v1/pair', pairing)).status, 401);
  assert.equal((await call(e, 'POST', '/v1/pair', pairing, A)).status, 201);
  const claim = await call(e, 'POST', '/v1/pair/claim', { lookupId: pairing.lookupId, device: { name: 'Tablet' } });
  assert.equal(claim.status, 200);
  assert.equal(claim.body?.accountId, A.accountId);
  assert.equal(claim.body?.salt, pairing.salt);
  assert.equal(claim.body?.wrapped, pairing.wrapped);
  const joined = claim.body?.device as { id: string; token: string };
  assert.ok(joined.token);
  assert.equal((await call(e, 'POST', '/v1/sync', { since: 0 }, { accountId: A.accountId, token: joined.token })).status, 200);
  const names = ((await call(e, 'GET', '/v1/devices', undefined, A)).body?.devices as { name: string }[]).map((d) => d.name);
  assert.deepEqual(names, ['Test device', 'Tablet']);
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
  const acc = { accountId: 'acc_aaaaaaaaaaaaaaaaaaaa', secret: 's'.repeat(40) };
  const A = await register(e, acc);
  await call(e, 'POST', '/v1/sync', { changes: [rec('k1', 1)] }, A);
  assert.equal((await call(e, 'DELETE', '/v1/account', undefined, A)).status, 204);
  const gone = await call(e, 'POST', '/v1/sync', { since: 0 }, A);
  assert.equal(gone.status, 401);
  assert.match(String(gone.body?.error), /Unknown account/);
  const again = await register(e, acc);
  assert.equal(again.status, 201);
  const r = await call(e, 'POST', '/v1/sync', { since: 0 }, again);
  assert.deepEqual(r.body?.changes, []);
  assert.equal(((await call(e, 'GET', '/v1/devices', undefined, again)).body?.devices as unknown[]).length, 1);
});
