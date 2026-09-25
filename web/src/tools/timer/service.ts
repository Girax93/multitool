// The timer service owns the list of timers, persists it, keeps native alarms in
// sync, and reacts to shell events (alarm fired / stopped / restarted from a
// notification). It runs from app start, whether or not the timer view is open.

import type { ToolContext } from '../../core/registry.js';
import { signal, type Signal } from '../../core/store.js';
import { uid } from '../../core/dom.js';
import { describeDevice, installationId } from '../../core/device.js';
import {
  alarmId,
  createTimer,
  extendTimer,
  finishTimer,
  ownedBy,
  pauseTimer,
  reconcile,
  restartTimer,
  resumeTimer,
  startTimer,
  stopTimer,
  timerIdFromAlarm,
  type DeviceTag,
  type Timer,
} from './model.js';

/** Pre-sync builds kept all timers in one array under this key; migrated on first start. */
const LEGACY_KEY = 'timers';
/** One record per timer, so devices can change different timers without clobbering each other. */
const PREFIX = 'timers/';
const TICK_MS = 250;

export class TimerService {
  readonly timers: Signal<Timer[]> = signal<Timer[]>([]);
  /** Bumped every tick while something is running, so views can re-render countdowns. */
  readonly tick: Signal<number> = signal(0);
  readonly status: Signal<string | null> = signal<string | null>(null);

  private ticker: number | undefined;
  private ringer: Ringer | null = null;
  private loaded = false;
  /** What is on disk, by id, so persist() only writes what changed. */
  private persisted = new Map<string, Timer>();
  /**
   * Runs are stamped with the device that started them: timers sync to every
   * linked device, but only the starting device schedules the alarm and rings
   * (Ari: "All alarms/rings should only ring on the device it was started on").
   */
  private readonly device: DeviceTag;

  constructor(private readonly ctx: ToolContext) {
    this.device = { id: installationId(), name: describeDevice(ctx.native.info()) };
  }

  /** Does this run belong to this device (and so ring here)? */
  mine(t: Timer): boolean {
    return ownedBy(t, this.device.id);
  }

  async init(): Promise<void> {
    const stored = await this.load();
    const now = Date.now();
    this.setTimers(stored.map((t) => reconcile(t, now)), false);
    this.loaded = true;
    this.persist();
    this.ctx.kv.watch(PREFIX, (keys) => void this.applyRemote(keys));

    this.ctx.native.onEvent((e) => {
      switch (e.type) {
        case 'alarm-fired': {
          const id = timerIdFromAlarm(e.id);
          if (id) this.mutate(id, (t) => finishTimer(t, e.at));
          break;
        }
        case 'alarm-stopped': {
          const id = timerIdFromAlarm(e.id);
          if (id) this.dismiss(id, false);
          break;
        }
        case 'alarm-restarted': {
          const id = timerIdFromAlarm(e.id);
          if (id) this.mutate(id, (t) => ({ ...restartTimer(t, e.at - t.durationMs, this.device), endsAt: e.at }), false);
          break;
        }
        case 'resume':
          this.checkFinished();
          break;
      }
    });
    this.checkFinished();
  }

  get(id: string): Timer | undefined {
    return this.timers.get().find((t) => t.id === id);
  }

  add(input: { name: string; durationMs: number; saved: boolean; start: boolean }): Timer {
    const now = Date.now();
    let t = createTimer({ id: uid('t'), name: input.name, durationMs: input.durationMs, saved: input.saved, now });
    if (input.start) t = startTimer(t, now, this.device);
    this.setTimers([...this.timers.get(), t]);
    if (input.start) this.scheduleAlarm(t);
    return t;
  }

  update(id: string, patch: { name?: string; durationMs?: number; saved?: boolean }): void {
    this.mutate(id, (t) => {
      const next = { ...t, ...patch };
      if (patch.durationMs !== undefined && t.state !== 'idle') return stopTimer(next);
      return next;
    });
  }

  start(id: string): void {
    this.mutate(id, (t) => startTimer(t, Date.now(), this.device));
  }

  pause(id: string): void {
    this.mutate(id, (t) => pauseTimer(t, Date.now()));
  }

  resume(id: string): void {
    this.mutate(id, (t) => resumeTimer(t, Date.now(), this.device));
  }

  /** Stop a running/paused timer. One-off timers are removed; saved ones go idle. */
  stop(id: string): void {
    const t = this.get(id);
    if (!t) return;
    if (t.saved) this.mutate(id, (x) => stopTimer(x));
    else this.remove(id);
  }

  restart(id: string): void {
    this.mutate(id, (t) => restartTimer(t, Date.now(), this.device));
  }

  /** Add or remove time while a timer runs (+30 s / −30 s); the alarm is rescheduled. */
  extend(id: string, deltaMs: number): void {
    this.mutate(id, (t) => extendTimer(t, deltaMs, Date.now()));
  }

  /** Run a timer again with a given length (a rest timer's "Repeat" uses the configured rest, not an adjusted one). */
  restartWith(id: string, durationMs: number): void {
    const now = Date.now();
    this.ctx.native.cancelNotification(alarmId(id));
    this.mutate(id, (t) => startTimer({ ...t, durationMs }, now, this.device));
  }

  /** "Off" after ringing. One-off timers disappear; saved ones return to idle. */
  dismiss(id: string, cancelNative = true): void {
    const t = this.get(id);
    if (!t) return;
    if (cancelNative) this.ctx.native.cancelNotification(alarmId(id));
    if (t.saved) this.mutate(id, (x) => stopTimer(x), cancelNative);
    else this.remove(id, cancelNative);
  }

  remove(id: string, cancelNative = true): void {
    if (cancelNative) {
      this.ctx.native.cancelAlarm(alarmId(id));
      this.ctx.native.cancelNotification(alarmId(id));
    }
    this.setTimers(this.timers.get().filter((t) => t.id !== id));
  }

  toggleSaved(id: string): void {
    this.mutate(id, (t) => ({ ...t, saved: !t.saved }));
  }

  // ---- internals ----------------------------------------------------------

  private mutate(id: string, fn: (t: Timer) => Timer, syncNative = true): void {
    const before = this.get(id);
    if (!before) return;
    const after = fn(before);
    if (after === before) return;
    this.setTimers(this.timers.get().map((t) => (t.id === id ? after : t)));
    if (!syncNative) return;
    if (after.state === 'running' && (before.state !== 'running' || before.endsAt !== after.endsAt)) {
      this.scheduleAlarm(after);
    } else if (after.state !== 'running' && before.state === 'running') {
      this.ctx.native.cancelAlarm(alarmId(id));
    }
  }

  private scheduleAlarm(t: Timer): void {
    if (t.state !== 'running' || t.endsAt === undefined || !this.mine(t)) return;
    this.ctx.native.scheduleAlarm({
      id: alarmId(t.id),
      at: t.endsAt,
      title: t.name,
      body: 'Timer finished',
      toolId: 'timer',
      durationMs: t.durationMs,
      route: '#/t/timer',
      actions: ['stop', 'restart'],
    });
  }

  /** Read every timer record; migrate the old single-array layout on the way. */
  private async load(): Promise<Timer[]> {
    const entries = await this.ctx.kv.list<Timer>(PREFIX);
    let list = entries.map((e) => e.value);
    const legacy = await this.ctx.kv.get<Timer[]>(LEGACY_KEY);
    if (legacy) {
      const known = new Set(list.map((t) => t.id));
      for (const t of legacy) if (!known.has(t.id)) list.push(t);
      await this.ctx.kv.delete(LEGACY_KEY);
      // persist() below writes the migrated records because `persisted` is still empty
    } else {
      for (const t of list) this.persisted.set(t.id, t);
    }
    list = list.sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
    return list;
  }

  /** Timers changed by another device: reload them and mirror alarms on this device. */
  private async applyRemote(keys: string[]): Promise<void> {
    const now = Date.now();
    let list = [...this.timers.get()];
    for (const key of keys) {
      const id = key.slice(PREFIX.length);
      const incoming = await this.ctx.kv.get<Timer>(key);
      const before = list.find((t) => t.id === id);
      if (!incoming) {
        if (before) {
          list = list.filter((t) => t.id !== id);
          this.persisted.delete(id);
          this.ctx.native.cancelAlarm(alarmId(id));
          this.ctx.native.cancelNotification(alarmId(id));
        }
        continue;
      }
      const after = reconcile(incoming, now);
      this.persisted.set(id, incoming);
      list = before ? list.map((t) => (t.id === id ? after : t)) : [...list, after];
      if (after.state === 'running' && this.mine(after) && (before?.state !== 'running' || before.endsAt !== after.endsAt)) {
        this.scheduleAlarm(after);
      } else if (before?.state === 'running' && (after.state !== 'running' || !this.mine(after))) {
        // stopped, or taken over by another device (it resumed / restarted the timer there)
        this.ctx.native.cancelAlarm(alarmId(id));
      }
      if (after.state !== 'finished' && before?.state === 'finished') this.ctx.native.cancelNotification(alarmId(id));
    }
    list.sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
    this.setTimers(list, false);
  }

  /** Write changed timers and remove deleted ones (one record each). */
  private persist(): void {
    const list = this.timers.get();
    const ids = new Set<string>();
    for (const t of list) {
      ids.add(t.id);
      if (this.persisted.get(t.id) !== t) {
        this.persisted.set(t.id, t);
        void this.ctx.kv.set(PREFIX + t.id, t);
      }
    }
    for (const id of [...this.persisted.keys()]) {
      if (!ids.has(id)) {
        this.persisted.delete(id);
        void this.ctx.kv.delete(PREFIX + id);
      }
    }
  }

  private setTimers(list: Timer[], persist = true): void {
    this.timers.set(list);
    if (persist && this.loaded) this.persist();
    this.updateStatus();
    this.updateTicker();
    this.updateRinger();
    this.ctx.native.publishWidgetState(
      'timer',
      list
        .filter((t) => t.state !== 'idle')
        .map((t) => ({ id: t.id, name: t.name, state: t.state, endsAt: t.endsAt ?? null })),
    );
  }

  private updateStatus(): void {
    const list = this.timers.get();
    const ringing = list.filter((t) => t.state === 'finished').length;
    const running = list.filter((t) => t.state === 'running').length;
    const paused = list.filter((t) => t.state === 'paused').length;
    const parts: string[] = [];
    if (ringing) parts.push(`${ringing} done`);
    if (running) parts.push(`${running} running`);
    if (paused) parts.push(`${paused} paused`);
    this.status.set(parts.length ? parts.join(' · ') : null);
  }

  private updateTicker(): void {
    const needed = this.timers.get().some((t) => t.state === 'running');
    if (needed && this.ticker === undefined) {
      this.ticker = window.setInterval(() => {
        this.tick.update((n) => n + 1);
        this.checkFinished();
      }, TICK_MS);
    } else if (!needed && this.ticker !== undefined) {
      clearInterval(this.ticker);
      this.ticker = undefined;
    }
  }

  private checkFinished(): void {
    const now = Date.now();
    const list = this.timers.get();
    const next = list.map((t) => reconcile(t, now));
    if (next.some((t, i) => t !== list[i])) {
      this.setTimers(next);
      // On the web the bridge already fired a notification via setTimeout; on
      // Android the shell's alarm does. Either way, make sure the user notices
      // — unless the timer belongs to another device, which rings there.
      if (next.some((t, i) => t !== list[i] && this.mine(t))) this.ctx.native.vibrate([200, 100, 200]);
    }
  }

  private updateRinger(): void {
    const ringing = this.timers.get().some((t) => t.state === 'finished' && this.mine(t));
    // The Android shell plays the alarm sound itself; in a browser we beep.
    const shouldRing = ringing && this.ctx.native.info().platform === 'web';
    if (shouldRing && !this.ringer) {
      this.ringer = new Ringer();
      this.ringer.start();
    } else if (!shouldRing && this.ringer) {
      this.ringer.stop();
      this.ringer = null;
    }
  }
}

/** A polite looping beep using WebAudio (browser only). */
class Ringer {
  private ctx: AudioContext | null = null;
  private interval: number | undefined;

  start(): void {
    try {
      this.ctx = new AudioContext();
    } catch {
      return;
    }
    const beep = (): void => {
      const ctx = this.ctx;
      if (!ctx) return;
      for (let i = 0; i < 3; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.value = 0.0001;
        osc.connect(gain).connect(ctx.destination);
        const t = ctx.currentTime + i * 0.25;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        osc.start(t);
        osc.stop(t + 0.2);
      }
    };
    beep();
    this.interval = window.setInterval(beep, 2000);
  }

  stop(): void {
    if (this.interval !== undefined) clearInterval(this.interval);
    void this.ctx?.close();
    this.ctx = null;
  }
}
