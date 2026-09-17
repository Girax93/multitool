#!/usr/bin/env node
// Builds the web app into web/dist with zero dependencies beyond `tsc`:
//   1. tsc → web/dist/js
//   2. copy static files (index.html, manifest, styles, icons)
//   3. stamp the version into js/core/version.js
//   4. run unit tests (*.test.js) with node's test runner, then remove them
//   5. generate sw.js with the precache list
//   6. add CNAME + .nojekyll for GitHub Pages
//
// Usage: node scripts/build-web.mjs [--skip-tests]
// Env:   APP_VERSION (default: YYYY.MM.DD-<git sha>), TSC (default: "tsc"),
//        SITE_DOMAIN (default: multitool.ariilden.com)

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const web = join(root, 'web');
const dist = join(web, 'dist');
const skipTests = process.argv.includes('--skip-tests');
const domain = process.env.SITE_DOMAIN || 'multitool.ariilden.com';

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    console.error(`\n✖ ${cmd} ${args.join(' ')} exited with ${r.status}`);
    process.exit(r.status ?? 1);
  }
}

function gitSha() {
  const r = spawnSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: root, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : 'local';
}

function version() {
  if (process.env.APP_VERSION) return process.env.APP_VERSION;
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}.${p(d.getUTCMonth() + 1)}.${p(d.getUTCDate())}-${gitSha()}`;
}

function walk(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, base));
    else out.push(relative(base, p).split('\\').join('/'));
  }
  return out.sort();
}

// 0. icons (PNGs are build outputs; only icon.svg is committed)
run(process.execPath, [join(root, 'scripts', 'make-icons.mjs')]);

// 1. compile
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
console.log('▸ tsc');
run(process.env.TSC || 'tsc', ['-p', join(web, 'tsconfig.json')]);

// 2. static files
console.log('▸ copy static');
for (const f of ['index.html', 'manifest.webmanifest']) cpSync(join(web, f), join(dist, f));
for (const d of ['styles', 'icons']) cpSync(join(web, d), join(dist, d), { recursive: true });

// 3. version stamp
const ver = version();
const versionFile = join(dist, 'js', 'core', 'version.js');
writeFileSync(versionFile, readFileSync(versionFile, 'utf8').replace('__APP_VERSION__', ver));
console.log(`▸ version ${ver}`);

// 4. unit tests (compiled alongside the app), then strip them from the bundle
const testFiles = walk(join(dist, 'js')).filter((f) => f.endsWith('.test.js'));
writeFileSync(join(dist, 'js', 'package.json'), JSON.stringify({ type: 'module' }));
if (!skipTests && testFiles.length) {
  console.log(`▸ node --test (${testFiles.length} files)`);
  run(process.execPath, ['--test', ...testFiles.map((f) => join(dist, 'js', f))]);
}
for (const f of testFiles) rmSync(join(dist, 'js', f));
rmSync(join(dist, 'js', 'package.json'));
if (existsSync(join(dist, 'js', 'types'))) rmSync(join(dist, 'js', 'types'), { recursive: true });

// 5. service worker with precache manifest
const assets = walk(dist).filter((f) => !['sw.js', 'CNAME', '.nojekyll'].includes(f));
const sw = readFileSync(join(web, 'sw.js'), 'utf8')
  .replace('__VERSION__', ver)
  .replace('__ASSETS__', JSON.stringify(['./', ...assets.map((a) => `./${a}`)], null, 0));
writeFileSync(join(dist, 'sw.js'), sw);

// 6. GitHub Pages bits
writeFileSync(join(dist, 'CNAME'), `${domain}\n`);
writeFileSync(join(dist, '.nojekyll'), '');

console.log(`✔ built ${assets.length} assets → ${relative(root, dist)}`);
