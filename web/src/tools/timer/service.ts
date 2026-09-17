// The timer service owns the list of timers, persists it, keeps native alarms in
// sync, and reacts to shell events (alarm fired / stopped / restarted from a
// notification). It runs from app start, whether or not the timer view is open.

import type { ToolContext } from '../../core/registry.js';
import { signal, type Signal } from '../../core/store.js';
import { uid } from '../../core/dom.js';
import {
  alarmId,
  createTimer,
  finishTimer,
  pauseTimer,
  reconcile,
  restartTimer,
  resumeTimer,
  startTimer,
  stopTimer,
  timerIdFromAlarm,
  type Timer,
} from './model.js';

const STORAGE_KEY = 'timers';
const TICK_MS = 250;

export class TimerService {
  readonly timers: Signal<Timer[]> = signal<Timer[]>([]);
  /** Bumped every tick while something is running, so views can re-render countdowns. */
  readonly tick: Signal<number> = signal(0);
  readonly status: Signal<string | null> = signal<string | null>(null);

  private ticker: number | undefined;
  private ringer: Ringer | null = null;
  private loaded = false;

  constructor(private readonly ctx: ToolContext) {}

  async init(): Promise<void> {
    const stored = (await this.ctx.kv.get<Timer[]>(STORAGE_KEY)) ?? [];
    const now = Date.now();
    this.setTimers(stored.map((t) => reconcile(t, now)), false);
    this.loaded = true;

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
          if (id) this.mutate(id, (t) => ({ ...restartTimer(t, e.at - t.durationMs), endsAt: e.at }), false);
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
    if (input.start) t = startTimer(t, now);
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
    this.mutate(id, (t) => startTimer(t, Date.now()));
  }

  pause(id: string): void {
    this.mutate(id, (t) => pauseTimer(t, Date.now()));
  }

  resume(id: string): void {
    this.mutate(id, (t) => resumeTimer(t, Date.now()));
  }

  /** Stop a running/paused timer. One-off timers are removed; saved ones go idle. */
  stop(id: string): void {
    const t = this.get(id);
    if (!t) return;
    if (t.saved) this.mutate(id, (x) => stopTimer(x));
    else this.remove(id);
  }

  restart(id: string): void {
    this.mutate(id, (t) => restartTimer(t, Date.now()));
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
    if (t.state !== 'running' || t.endsAt === undefined) return;
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

  private setTimers(list: Timer[], persist = true): void {
    this.timers.set(list);
    if (persist && this.loaded) void this.ctx.kv.set(STORAGE_KEY, list);
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
      // Android the shell's alarm does. Either way, make sure the user notices.
      this.ctx.native.vibrate([200, 100, 200]);
    }
  }

  private updateRinger(): void {
    const ringing = this.timers.get().some((t) => t.state === 'finished');
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
