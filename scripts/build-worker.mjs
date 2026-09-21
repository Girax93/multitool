#!/usr/bin/env node
// Type-checks the sync Worker with tsc (no npm packages needed) and runs its
// unit tests on Node over node:sqlite. The deploy itself is done by wrangler in
// CI (.github/workflows/worker.yml), which bundles worker/src/index.ts directly.
//
// Usage: node scripts/build-worker.mjs [--skip-tests]

import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const worker = join(root, 'worker');
const dist = join(worker, 'dist');
const skipTests = process.argv.includes('--skip-tests');

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    console.error(`\n✖ ${cmd} ${args.join(' ')} exited with ${r.status}`);
    process.exit(r.status ?? 1);
  }
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out.sort();
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
console.log('▸ tsc (worker)');
run(process.env.TSC || 'tsc', ['-p', join(worker, 'tsconfig.json')]);
writeFileSync(join(dist, 'package.json'), JSON.stringify({ type: 'module' }));

const tests = walk(dist).filter((f) => f.endsWith('.test.js'));
if (!skipTests && tests.length) {
  console.log(`▸ node --test (${tests.length} files)`);
  run(process.execPath, ['--no-warnings=ExperimentalWarning', '--test', ...tests]);
}
console.log('✔ worker ok');
