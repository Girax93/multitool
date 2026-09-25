// A short human-readable name for this device, shown in the linked-devices
// list on every device of the account ("Chrome on Windows", "Android app"),
// and a stable id for this installation so synced records can say which
// device they belong to (a timer rings only where it was started).

import type { NativeInfo } from './native.js';

const INSTALL_KEY = 'multitool.device';
let memoryId: string | null = null;

/** Random id created on first use and kept in localStorage; per browser profile / app install. */
export function installationId(): string {
  if (memoryId) return memoryId;
  let id: string | null = null;
  try {
    id = localStorage.getItem(INSTALL_KEY);
  } catch {
    id = null;
  }
  if (!id) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    id = 'd' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    try {
      localStorage.setItem(INSTALL_KEY, id);
    } catch {
      // private mode / storage blocked: the id lives for this page load only
    }
  }
  memoryId = id;
  return id;
}

export function describeDevice(info: NativeInfo, ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): string {
  if (info.platform === 'android') return 'Android app';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Browser';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /iPhone/.test(ua)
      ? 'iPhone'
      : /iPad/.test(ua)
        ? 'iPad'
        : /Android/.test(ua)
          ? 'Android'
          : /Mac OS X/.test(ua)
            ? 'Mac'
            : /CrOS/.test(ua)
              ? 'ChromeOS'
              : /Linux/.test(ua)
                ? 'Linux'
                : '';
  return os ? `${browser} on ${os}` : browser;
}
