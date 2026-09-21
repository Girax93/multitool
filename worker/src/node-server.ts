// Local stand-in for the deployed Worker: same handler, SQLite on disk or in
// memory. Used by web/tests/smoke.py (two "devices" pairing) and for poking at
// the API by hand:  node worker/dist/node-server.js [port] [db-path]
import { createServer, type IncomingMessage } from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle, type Env } from './handler.js';
import { NodeD1 } from './node-d1.js';

export function openDatabase(path = ':memory:'): NodeD1 {
  const db = new NodeD1(path);
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
  db.db.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY)');
  const applied = new Set(db.db.prepare('SELECT name FROM _migrations').all().map((r) => String(r['name'])));
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (applied.has(name)) continue;
    db.db.exec(readFileSync(join(dir, name), 'utf8'));
    db.db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(name);
  }
  return db;
}

function readBody(req: IncomingMessage): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const out = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) {
        out.set(c, off);
        off += c.length;
      }
      resolve(out);
    });
    req.on('error', reject);
  });
}

export function serve(port: number, env: Env, host = '127.0.0.1'): void {
  const server = createServer((req, res) => {
    void (async () => {
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (typeof v === 'string') headers.set(k, v);
        else if (Array.isArray(v)) headers.set(k, v.join(', '));
      }
      const method = req.method ?? 'GET';
      const raw = method === 'GET' || method === 'HEAD' ? undefined : await readBody(req);
      const body = raw ? new Uint8Array(raw).buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) : undefined;
      const request = new Request(`http://${host}:${port}${req.url ?? '/'}`, { method, headers, body });
      const response = await handle(request, env);
      const out: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        out[key] = value;
      });
      res.writeHead(response.status, out);
      res.end(new Uint8Array(await response.arrayBuffer()));
    })().catch((err) => {
      console.error(err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal error' }));
    });
  });
  server.listen(port, host, () => console.log(`sync API listening on http://${host}:${port}`));
}

if (process.argv[1] && /node-server\.js$/.test(process.argv[1])) {
  const port = Number(process.argv[2] ?? 8787);
  const db = openDatabase(process.argv[3] ?? ':memory:');
  serve(port, { DB: db });
}
