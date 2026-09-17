// Replaced at build time by scripts/build-web.mjs (see APP_VERSION there).
export const APP_VERSION: string = '__APP_VERSION__';

export function displayVersion(): string {
  return APP_VERSION.startsWith('__') ? 'dev' : APP_VERSION;
}

/** Compare dotted numeric versions ("1.0.12" vs "1.0.9"). Returns -1, 0 or 1. */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^[^0-9]*/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^[^0-9]*/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}
