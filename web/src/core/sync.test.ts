// End-to-end sync tests: two in-memory "devices" talking to the real Worker
// handler (worker/dist, built by scripts/build-worker.mjs) over node:sqlite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryKV } from './db.js';
import { SyncEngine } from './sync.js';

interface WorkerModule {
  handle(request: Request, env: { DB: unknown }): Promise<Response>;
}
interface ServerModule {
  openDatabase(path?: string): unknown;
}

const workerUrl = new URL('../../../../worker/dist/handler.js', import.meta.url).href;
const serverUrl = new URL('../../../../worker/dist/node-server.js', import.meta.url).href;

async function backend(): Promise<typeof fetch> {
  let worker: WorkerModule;
  let server: ServerModule;
  try {
    worker = (await import(workerUrl)) as WorkerModule;
    server = (await import(serverUrl)) as ServerModule;
  } catch (err) {
    throw new Error(`worker/dist is missing — run "node scripts/build-worker.mjs" first (${String(err)})`);
  }
  const env = { DB: server.openDatabase(':memory:') };
  return (input, init) => worker.handle(new Request(input, init), env);
}

const API = 'http://sync.test';
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function device(fetchFn: typeof fetch): { kv: MemoryKV; sync: SyncEngine } {
  const kv = new MemoryKV();
  return { kv, sync: new SyncEngine(kv, API, fetchFn) };
}

test('two devices: link with a code, push, pull, edit, delete, local-only keys', async () => {
  const fetchFn = await backend();
  const a = device(fetchFn);
  const b = device(fetchFn);

  await a.kv.set('tool/workout/weeks/w1', { label: 'Week 1' });
  await a.kv.set('tool/workout/ui/currentWeek', 'w1'); // per-device, never synced
  await a.kv.set('core/settings', { theme: 'dark' }); // never synced
  await a.sync.start();
  assert.equal(a.sync.state.get().status, 'off');
  await a.sync.enable();
  assert.equal(a.sync.state.get().status, 'idle');
  assert.equal((await a.kv.meta('tool/workout/weeks/w1'))?.d, 0); // pushed

  // device B joins with the code A shows
  const { code } = await a.sync.createLinkCode();
  assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  const seen: string[][] = [];
  b.kv.watch('tool/workout/', (keys) => seen.push(keys));
  await b.sync.start();
  await b.sync.joinWithCode(code.toLowerCase());
  assert.equal(b.sync.accountId, a.sync.accountId);
  assert.deepEqual(await b.kv.get('tool/workout/weeks/w1'), { label: 'Week 1' });
  assert.equal(await b.kv.get('tool/workout/ui/currentWeek'), undefined);
  assert.equal(await b.kv.get('core/settings'), undefined);
  assert.deepEqual(seen, [['tool/workout/weeks/w1']]);
  await assert.rejects(b.sync.joinWithCode(code), /not found|did not match|Sync is not/); // single use

  // B edits, A receives
  await b.kv.set('tool/workout/weeks/w1', { label: 'Week 1 (edited on B)' });
  await b.sync.syncNow();
  await a.sync.syncNow();
  assert.deepEqual(await a.kv.get('tool/workout/weeks/w1'), { label: 'Week 1 (edited on B)' });

  // conflict: A writes first, B writes later, A syncs first → B's newer version wins everywhere
  await a.kv.set('tool/workout/weeks/w1', { label: 'A first' });
  await sleep(3);
  await b.kv.set('tool/workout/weeks/w1', { label: 'B later' });
  await a.sync.syncNow();
  await b.sync.syncNow();
  await a.sync.syncNow();
  assert.deepEqual(await a.kv.get('tool/workout/weeks/w1'), { label: 'B later' });
  assert.deepEqual(await b.kv.get('tool/workout/weeks/w1'), { label: 'B later' });

  // conflict the other way: the older write arrives second and is rejected → server copy wins
  await b.kv.set('tool/workout/weeks/w1', { label: 'B old' });
  await sleep(3);
  await a.kv.set('tool/workout/weeks/w1', { label: 'A new' });
  await a.sync.syncNow();
  await b.sync.syncNow();
  assert.deepEqual(await b.kv.get('tool/workout/weeks/w1'), { label: 'A new' });
  assert.equal((await b.kv.meta('tool/workout/weeks/w1'))?.d, 0);

  // delete on A → gone on B, and a re-sync does not resurrect it
  await a.kv.delete('tool/workout/weeks/w1');
  await a.sync.syncNow();
  await b.sync.syncNow();
  assert.equal(await b.kv.get('tool/workout/weeks/w1'), undefined);
  assert.equal((await b.kv.meta('tool/workout/weeks/w1'))?.t, 1);
  await b.sync.syncNow();
  await a.sync.syncNow();
  assert.equal(await a.kv.get('tool/workout/weeks/w1'), undefined);

  // many records paginate through the 50-per-push limit
  for (let i = 0; i < 120; i++) await a.kv.set(`tool/timer/timers/t${i}`, { i });
  await a.sync.syncNow();
  await b.sync.syncNow();
  assert.equal((await b.kv.list('tool/timer/timers/')).length, 120);
  assert.equal((await a.kv.dirty(1000)).length, 0);

  // recovery key on a third device (its own local data is merged in)
  const c = device(fetchFn);
  await c.kv.set('tool/workout/weeks/w9', { label: 'made on C before linking' });
  await c.sync.start();
  const recovery = a.sync.recoveryKey();
  assert.ok(recovery);
  await c.sync.joinWithRecoveryKey(recovery.toLowerCase());
  assert.equal((await c.kv.list('tool/timer/timers/')).length, 120);
  await a.sync.syncNow();
  assert.deepEqual(await a.kv.get('tool/workout/weeks/w9'), { label: 'made on C before linking' });

  // turning sync off keeps data; deleting the account removes it for everyone
  await c.sync.disable();
  assert.equal(c.sync.state.get().status, 'off');
  assert.equal((await c.kv.list('tool/timer/timers/')).length, 120);
  await a.sync.deleteRemote();
  await b.sync.syncNow();
  assert.equal(b.sync.state.get().status, 'error');
  assert.match(b.sync.state.get().error ?? '', /Unknown account/);
  for (const d of [a, b, c]) d.sync.stop();
});

test('offline is reported, not fatal, and the work is retried', async () => {
  let online = false;
  const real = await backend();
  const flaky: typeof fetch = async (input, init) => {
    if (!online) throw new TypeError('Failed to fetch');
    return real(input, init);
  };
  const a = device(flaky);
  await a.kv.set('tool/workout/weeks/w1', { label: 'Week 1' });
  await a.sync.start();
  await assert.rejects(a.sync.enable(), TypeError);
  online = true;
  await a.sync.enable();
  online = false;
  await a.kv.set('tool/workout/weeks/w2', { label: 'Week 2' });
  await a.sync.syncNow();
  assert.equal(a.sync.state.get().status, 'offline');
  assert.equal((await a.kv.meta('tool/workout/weeks/w2'))?.d, 1);
  online = true;
  await a.sync.syncNow();
  assert.equal(a.sync.state.get().status, 'idle');
  assert.equal((await a.kv.meta('tool/workout/weeks/w2'))?.d, 0);
  a.sync.stop();
});
