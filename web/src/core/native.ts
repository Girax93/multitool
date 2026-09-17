// The native bridge is the one seam between the web app and whatever shell it
// runs in. On Android the shell injects `window.MultiToolAndroid` (see
// android/…/NativeBridge.kt); in a plain browser we fall back to web APIs with
// best-effort behaviour. Tools only ever talk to the `NativeBridge` interface.

import { Emitter, type Unsubscribe } from './store.js';

export type Platform = 'android' | 'web';

export interface NativeInfo {
  platform: Platform;
  /** Shell (APK) version, e.g. "1.0.12". Undefined on web. */
  shellVersion?: string;
  shellVersionCode?: number;
  sdkInt?: number;
  packageName?: string;
  appUrl?: string;
  canScheduleExactAlarms?: boolean;
  notificationsGranted?: boolean;
  canUseFullScreenIntent?: boolean;
  canInstallPackages?: boolean;
}

export type AlarmAction = 'stop' | 'restart';

export interface AlarmRequest {
  /** Globally unique, e.g. "timer:<timerId>". */
  id: string;
  /** Epoch milliseconds at which the alarm fires. */
  at: number;
  title: string;
  body: string;
  toolId: string;
  /** Lets the shell implement "restart" without asking the web app. */
  durationMs?: number;
  /** Hash route to open when the notification is tapped, e.g. "#/t/timer". */
  route?: string;
  actions?: AlarmAction[];
}

export interface NotificationRequest {
  id: string;
  title: string;
  body: string;
  route?: string;
  ongoing?: boolean;
}

/** Events flowing from the shell to the web app. */
export type NativeEvent =
  | { type: 'alarm-fired'; id: string; at: number }
  | { type: 'alarm-stopped'; id: string }
  | { type: 'alarm-restarted'; id: string; at: number }
  | { type: 'notification-tap'; id: string; route?: string }
  | { type: 'resume' }
  | { type: 'permissions-changed' };

export interface NativeBridge {
  info(): NativeInfo;
  scheduleAlarm(req: AlarmRequest): void;
  cancelAlarm(id: string): void;
  notify(req: NotificationRequest): void;
  cancelNotification(id: string): void;
  requestPermissions(): void;
  openUrl(url: string): void;
  vibrate(pattern: number[]): void;
  /** Hand the shell a JSON-serialisable snapshot for home-screen widgets (future). */
  publishWidgetState(toolId: string, state: unknown): void;
  /** Download and install a new shell APK (Android only). */
  installUpdate(apkUrl: string): void;
  /** Events queued by the shell while the page wasn't listening. */
  drainEvents(): NativeEvent[];
  onEvent(fn: (e: NativeEvent) => void): Unsubscribe;
}

// ---- Android --------------------------------------------------------------

interface AndroidInterface {
  getInfo(): string;
  scheduleAlarm(json: string): string;
  cancelAlarm(id: string): void;
  notify(json: string): void;
  cancelNotification(id: string): void;
  requestPermissions(): void;
  openUrl(url: string): void;
  vibrate(patternCsv: string): void;
  publishWidgetState(toolId: string, json: string): void;
  installUpdate(url: string): void;
  drainEvents(): string;
}

declare global {
  interface Window {
    MultiToolAndroid?: AndroidInterface;
    /** Called by the shell when new events are queued. */
    __multitoolNativeEvent?: () => void;
  }
}

class AndroidBridge implements NativeBridge {
  private events = new Emitter<NativeEvent>();

  constructor(private readonly android: AndroidInterface) {
    window.__multitoolNativeEvent = () => {
      for (const e of this.drainEvents()) this.events.emit(e);
    };
  }

  info(): NativeInfo {
    try {
      return { platform: 'android', ...(JSON.parse(this.android.getInfo()) as Partial<NativeInfo>) };
    } catch (err) {
      console.error('getInfo failed', err);
      return { platform: 'android' };
    }
  }
  scheduleAlarm(req: AlarmRequest): void {
    const result = this.android.scheduleAlarm(JSON.stringify(req));
    if (result && result !== 'ok') console.warn('scheduleAlarm:', result);
  }
  cancelAlarm(id: string): void {
    this.android.cancelAlarm(id);
  }
  notify(req: NotificationRequest): void {
    this.android.notify(JSON.stringify(req));
  }
  cancelNotification(id: string): void {
    this.android.cancelNotification(id);
  }
  requestPermissions(): void {
    this.android.requestPermissions();
  }
  openUrl(url: string): void {
    this.android.openUrl(url);
  }
  vibrate(pattern: number[]): void {
    this.android.vibrate(pattern.join(','));
  }
  publishWidgetState(toolId: string, state: unknown): void {
    this.android.publishWidgetState(toolId, JSON.stringify(state ?? null));
  }
  installUpdate(apkUrl: string): void {
    this.android.installUpdate(apkUrl);
  }
  drainEvents(): NativeEvent[] {
    try {
      const raw = this.android.drainEvents();
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? (parsed as NativeEvent[]) : [];
    } catch (err) {
      console.error('drainEvents failed', err);
      return [];
    }
  }
  onEvent(fn: (e: NativeEvent) => void): Unsubscribe {
    return this.events.on(fn);
  }
}

// ---- Plain web fallback ---------------------------------------------------

const MAX_TIMEOUT = 2_147_483_647; // setTimeout's 32-bit limit

class WebBridge implements NativeBridge {
  private events = new Emitter<NativeEvent>();
  private timeouts = new Map<string, number>();
  private notifications = new Map<string, Notification>();

  info(): NativeInfo {
    return {
      platform: 'web',
      notificationsGranted: typeof Notification !== 'undefined' && Notification.permission === 'granted',
    };
  }

  scheduleAlarm(req: AlarmRequest): void {
    this.cancelAlarm(req.id);
    const arm = (): void => {
      const delay = req.at - Date.now();
      if (delay > MAX_TIMEOUT) {
        this.timeouts.set(req.id, window.setTimeout(arm, MAX_TIMEOUT));
        return;
      }
      this.timeouts.set(
        req.id,
        window.setTimeout(() => {
          this.timeouts.delete(req.id);
          this.notify({ id: req.id, title: req.title, body: req.body, route: req.route });
          this.events.emit({ type: 'alarm-fired', id: req.id, at: req.at });
        }, Math.max(0, delay)),
      );
    };
    arm();
  }

  cancelAlarm(id: string): void {
    const t = this.timeouts.get(id);
    if (t !== undefined) {
      clearTimeout(t);
      this.timeouts.delete(id);
    }
  }

  notify(req: NotificationRequest): void {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    try {
      const n = new Notification(req.title, { body: req.body, tag: req.id });
      n.onclick = () => {
        window.focus();
        if (req.route) location.hash = req.route;
        this.events.emit({ type: 'notification-tap', id: req.id, route: req.route });
        n.close();
      };
      this.notifications.set(req.id, n);
    } catch (err) {
      console.warn('Notification failed', err);
    }
  }

  cancelNotification(id: string): void {
    this.notifications.get(id)?.close();
    this.notifications.delete(id);
  }

  requestPermissions(): void {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission().then(() => this.events.emit({ type: 'permissions-changed' }));
    }
  }

  openUrl(url: string): void {
    window.open(url, '_blank', 'noopener');
  }

  vibrate(pattern: number[]): void {
    try {
      navigator.vibrate?.(pattern);
    } catch {
      /* unsupported */
    }
  }

  publishWidgetState(): void {
    /* no widgets on the web */
  }

  installUpdate(apkUrl: string): void {
    this.openUrl(apkUrl);
  }

  drainEvents(): NativeEvent[] {
    return [];
  }

  onEvent(fn: (e: NativeEvent) => void): Unsubscribe {
    return this.events.on(fn);
  }
}

export function createNativeBridge(): NativeBridge {
  if (typeof window !== 'undefined' && window.MultiToolAndroid) return new AndroidBridge(window.MultiToolAndroid);
  return new WebBridge();
}
