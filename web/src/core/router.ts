// Hash-based routing (#/, #/t/<toolId>[/sub], #/settings). Hash routes work on
// static hosting and give the Android WebView a real back-stack for free.

import type { Unsubscribe } from './store.js';

export type Route =
  | { name: 'home' }
  | { name: 'settings' }
  | { name: 'tool'; toolId: string; sub: string };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '').replace(/^\/+/, '');
  if (path === '' || path === 'home') return { name: 'home' };
  if (path === 'settings') return { name: 'settings' };
  const m = /^t\/([a-z0-9-]+)(?:\/(.*))?$/i.exec(path);
  if (m && m[1]) return { name: 'tool', toolId: m[1], sub: m[2] ?? '' };
  return { name: 'home' };
}

export function currentRoute(): Route {
  return parseHash(location.hash);
}

export function toolPath(toolId: string, sub = ''): string {
  return sub ? `#/t/${toolId}/${sub}` : `#/t/${toolId}`;
}

export function navigate(path: string): void {
  const target = path.startsWith('#') ? path : `#${path.startsWith('/') ? '' : '/'}${path}`;
  if (location.hash === target) return;
  location.hash = target;
}

export function back(): void {
  if (history.length > 1) history.back();
  else navigate('#/');
}

export function onRouteChange(fn: (route: Route) => void): Unsubscribe {
  const handler = (): void => fn(currentRoute());
  window.addEventListener('hashchange', handler);
  handler();
  return () => window.removeEventListener('hashchange', handler);
}
