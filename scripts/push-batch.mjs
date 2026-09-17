#!/usr/bin/env node
// Emits the `upserts`/`deletes` JSON for GITHUB_COMMIT_MULTIPLE_FILES from the
// local git diff against origin/main, optionally filtered by path prefixes.
//   node scripts/push-batch.mjs [prefix ...]      → JSON on stdout
// Binary files are base64-encoded; text files are sent as UTF-8.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const prefixes = process.argv.slice(2);
const match = (p) => prefixes.length === 0 || prefixes.some((pre) => p.startsWith(pre));
const isBinary = (buf) => buf.subarray(0, 8000).includes(0);

const lines = execSync('git diff --name-status origin/main HEAD', { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
const upserts = [];
const deletes = [];
for (const line of lines) {
  const [status, ...rest] = line.split('\t');
  const path = rest[rest.length - 1];
  if (!match(path)) continue;
  if (status.startsWith('D')) {
    deletes.push(path);
    continue;
  }
  const buf = readFileSync(path);
  upserts.push(
    isBinary(buf)
      ? { path, content: buf.toString('base64'), encoding: 'base64' }
      : { path, content: buf.toString('utf8'), encoding: 'utf-8' },
  );
}
const out = { upserts };
if (deletes.length) out.deletes = deletes;
process.stdout.write(JSON.stringify(out));
process.stderr.write(`${upserts.length} upserts, ${deletes.length} deletes, ${JSON.stringify(out).length} bytes\n`);
