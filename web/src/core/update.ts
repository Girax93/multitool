// Checks GitHub Releases for a newer Android shell. The repo is public, so this
// needs no token. Web-app updates are handled separately by the service worker.

import { compareVersions } from './version.js';

export const GITHUB_REPO = 'Girax93/multitool';
export const RELEASES_URL = `https://github.com/${GITHUB_REPO}/releases`;
const LATEST_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

export interface ShellRelease {
  version: string;
  tag: string;
  apkUrl: string | null;
  htmlUrl: string;
  publishedAt: string;
}

interface GhAsset {
  name: string;
  browser_download_url: string;
}
interface GhRelease {
  tag_name: string;
  html_url: string;
  published_at: string;
  assets?: GhAsset[];
}

export async function fetchLatestShellRelease(): Promise<ShellRelease | null> {
  const res = await fetch(LATEST_API, { headers: { Accept: 'application/vnd.github+json' } });
  if (res.status === 404) return null; // no releases yet
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const data = (await res.json()) as GhRelease;
  const apk = data.assets?.find((a) => a.name.endsWith('.apk'));
  return {
    version: data.tag_name.replace(/^shell-v/, ''),
    tag: data.tag_name,
    apkUrl: apk?.browser_download_url ?? null,
    htmlUrl: data.html_url,
    publishedAt: data.published_at,
  };
}

export function isNewerShell(latest: ShellRelease, installedVersion: string | undefined): boolean {
  if (!installedVersion) return false;
  return compareVersions(latest.version, installedVersion) > 0;
}
