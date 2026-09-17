#!/usr/bin/env node
// Rasterizes web/icons/icon.svg into the PNG sizes the manifest needs.
// Uses `sharp` if it can be resolved (globally installed is fine when NODE_PATH
// points at the global node_modules); otherwise the existing PNGs are kept.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const icons = join(root, 'web', 'icons');
const require = createRequire(import.meta.url);

let sharp;
try {
  sharp = require('sharp');
} catch {
  const have = ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png'].every((f) => existsSync(join(icons, f)));
  console.log(have ? '▸ icons: sharp not found, keeping existing PNGs' : '▸ icons: sharp not found and PNGs missing!');
  process.exit(have ? 0 : 1);
}

const svg = readFileSync(join(icons, 'icon.svg'));
for (const size of [192, 512]) {
  writeFileSync(join(icons, `icon-${size}.png`), await sharp(svg).resize(size, size).png().toBuffer());
}
// Maskable: same tiles, padded so they sit inside the 80% safe zone.
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="#0f1216"/>
  <g transform="translate(64 64) scale(0.75)">
    <rect x="96" y="96" width="144" height="144" rx="28" fill="#f5a524"/>
    <rect x="272" y="96" width="144" height="144" rx="28" fill="#2dd4bf"/>
    <rect x="96" y="272" width="144" height="144" rx="28" fill="#3a4250"/>
    <rect x="272" y="272" width="144" height="144" rx="28" fill="#3a4250"/>
  </g></svg>`;
writeFileSync(join(icons, 'icon-maskable-512.png'), await sharp(Buffer.from(maskable)).resize(512, 512).png().toBuffer());
console.log('▸ icons: generated 192/512/maskable PNGs');
