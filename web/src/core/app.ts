// App-level wiring: storage, native bridge, settings, tool lifecycle, and the
// single stream of native events that tools subscribe to.

import { createKV, scoped, type SyncStore } from './db.js';
import {
  createNativeBridge,
  type AlarmRequest,
  type NativeBridge,
  type NativeEvent,
  type NativeInfo,
  type NotificationRequest,
} from './native.js';
import { allTools, type ToolContext, type ToolDefinition } from './registry.js';
import { navigate } from './router.js';
import { SettingsStore, applyTheme } from './settings.js';
import { SyncEngine } from './sync.js';
import { describeDevice } from './device.js';
import { Emitter, type Unsubscribe } from './store.js';
import { showToast, type ToastOptions } from '../ui/toast.js';

/** The bridge handed to tools: same as the real one, but events come from the app stream. */
class ToolNative implements NativeBridge {
  constructor(
    private readonly inner: NativeBridge,
    private readonly events: Emitter<NativeEvent>,
  ) {}
  info(): NativeInfo {
    return this.inner.info();
  }
  scheduleAlarm(req: AlarmRequest): void {
    this.inner.scheduleAlarm(req);
  }
  cancelAlarm(id: string): void {
    this.inner.cancelAlarm(id);
  }
  notify(req: NotificationRequest): void {
    this.inner.notify(req);
  }
  cancelNotification(id: string): void {
    this.inner.cancelNotification(id);
  }
  requestPermissions(): void {
    this.inner.requestPermissions();
  }
  openUrl(url: string): void {
    this.inner.openUrl(url);
  }
  vibrate(pattern: number[]): void {
    this.inner.vibrate(pattern);
  }
  publishWidgetState(toolId: string, state: unknown): void {
    this.inner.publishWidgetState(toolId, state);
  }
  installUpdate(apkUrl: string): void {
    this.inner.installUpdate(apkUrl);
  }
  drainEvents(): NativeEvent[] {
    return [];
  }
  onEvent(fn: (e: NativeEvent) => void): Unsubscribe {
    return this.events.on(fn);
  }
}

export class App {
  readonly kv: SyncStore = createKV();
  readonly native: NativeBridge = createNativeBridge();
  readonly settings = new SettingsStore(scoped(this.kv, 'core'));
  readonly sync = new SyncEngine(this.kv, undefined, undefined, () => describeDevice(this.info));
  readonly nativeEvents = new Emitter<NativeEvent>();
  readonly info: NativeInfo = this.native.info();

  private readonly contexts = new Map<string, ToolContext>();
  private readonly initialized = new Set<string>();

  async start(): Promise<void> {
    await this.settings.load();
    this.settings.value.subscribe((s) => applyTheme(s.theme));
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () =>
      applyTheme(this.settings.value.get().theme),
    );

    this.native.onEvent((e) => this.nativeEvents.emit(e));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.nativeEvents.emit({ type: 'resume' });
        this.drainNativeEvents();
      }
    });

    for (const tool of this.enabledTools()) await this.initTool(tool);
    // Events queued while the app was closed are delivered once tools listen.
    this.drainNativeEvents();
    // Tools are listening for remote changes now; start syncing in the background.
    await this.sync.start();
  }

  private drainNativeEvents(): void {
    for (const e of this.native.drainEvents()) this.nativeEvents.emit(e);
  }

  contextFor(tool: ToolDefinition): ToolContext {
    let ctx = this.contexts.get(tool.id);
    if (!ctx) {
      ctx = {
        kv: scoped(this.kv, `tool/${tool.id}`),
        native: new ToolNative(this.native, this.nativeEvents),
        navigate,
        toast: (message: string, opts?: ToastOptions) => showToast(message, opts),
      };
      this.contexts.set(tool.id, ctx);
    }
    return ctx;
  }

  async initTool(tool: ToolDefinition): Promise<void> {
    if (this.initialized.has(tool.id)) return;
    this.initialized.add(tool.id);
    try {
      await tool.init?.(this.contextFor(tool));
    } catch (err) {
      console.error(`Tool "${tool.id}" failed to initialise`, err);
      showToast(`${tool.name} failed to start`);
    }
  }

  enabledTools(): ToolDefinition[] {
    return allTools().filter((t) => this.settings.isEnabled(t.id));
  }
}
