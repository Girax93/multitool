// A short human-readable name for this device, shown in the linked-devices
// list on every device of the account ("Chrome on Windows", "Android app").

import type { NativeInfo } from './native.js';

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
