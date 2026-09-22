// Pure timer logic — no DOM, no storage — so it can be unit-tested with node.
// A Timer is immutable; every transition returns a new object.

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const MIN_DURATION_MS = SECOND;
export const MAX_DURATION_MS = 7 * DAY;

export type TimerState = 'idle' | 'running' | 'paused' | 'finished';

export interface Timer {
  id: string;
  name: string;
  durationMs: number;
  /** Saved timers stay in the list after finishing; one-offs are removed on "Off". */
  saved: boolean;
  createdAt: number;
  state: TimerState;
  /** Epoch ms when the current run started (running/paused/finished). */
  startedAt?: number;
  /** Epoch ms when the run ends / ended (running/finished). */
  endsAt?: number;
  /** Remaining ms captured when paused. */
  remainingMs?: number;
  /** Epoch ms when the timer was noticed to be finished. */
  finishedAt?: number;
}

export interface DurationParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function partsToMs(p: Partial<DurationParts>): number {
  return (p.days ?? 0) * DAY + (p.hours ?? 0) * HOUR + (p.minutes ?? 0) * MINUTE + (p.seconds ?? 0) * SECOND;
}

export function msToParts(ms: number): DurationParts {
  const total = Math.max(0, Math.round(ms / SECOND));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

/** Human-readable validation error, or null when the duration is acceptable. */
export function validateDuration(ms: number): string | null {
  if (!Number.isFinite(ms)) return 'Enter a duration.';
  if (ms < MIN_DURATION_MS) return 'Minimum is 1 second.';
  if (ms > MAX_DURATION_MS) return 'Maximum is 7 days.';
  return null;
}

/**
 * Parse free text like "1h 30m", "90s", "2d 4h", "10:30" (m:ss) or "1:02:03" (h:mm:ss).
 * Returns milliseconds or null when nothing parseable was found.
 */
export function parseDurationText(text: string): number | null {
  const s = text.trim().toLowerCase();
  if (!s) return null;
  if (/^\d+(:\d{1,2}){1,3}$/.test(s)) {
    const nums = s.split(':').map((n) => parseInt(n, 10));
    const parts: Partial<DurationParts> = {};
    const keys: (keyof DurationParts)[] = ['seconds', 'minutes', 'hours', 'days'];
    nums.reverse().forEach((n, i) => {
      const k = keys[i];
      if (k) parts[k] = n;
    });
    return partsToMs(parts);
  }
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(parseFloat(s) * MINUTE); // bare number = minutes
  const re = /(\d+(?:\.\d+)?)\s*(d|days?|h|hrs?|hours?|m|mins?|minutes?|s|secs?|seconds?)\b/g;
  let total = 0;
  let matched = false;
  for (const m of s.matchAll(re)) {
    matched = true;
    const n = parseFloat(m[1] ?? '0');
    const unit = (m[2] ?? '')[0];
    total += n * (unit === 'd' ? DAY : unit === 'h' ? HOUR : unit === 'm' ? MINUTE : SECOND);
  }
  return matched ? Math.round(total) : null;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Countdown display (whole seconds, floored): "3d 04:05:06", "1:02:03", "12:34", "0:05". */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / SECOND));
  const p: DurationParts = {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
  if (p.days > 0) return `${p.days}d ${pad2(p.hours)}:${pad2(p.minutes)}:${pad2(p.seconds)}`;
  if (p.hours > 0) return `${p.hours}:${pad2(p.minutes)}:${pad2(p.seconds)}`;
  return `${p.minutes}:${pad2(p.seconds)}`;
}

/** Compact duration label: "1h 30m", "45s", "2d 3h". */
export function formatDuration(ms: number): string {
  const p = msToParts(ms);
  const out: string[] = [];
  if (p.days) out.push(`${p.days}d`);
  if (p.hours) out.push(`${p.hours}h`);
  if (p.minutes) out.push(`${p.minutes}m`);
  if (p.seconds || out.length === 0) out.push(`${p.seconds}s`);
  return out.slice(0, 3).join(' ');
}

export function createTimer(input: { id: string; name: string; durationMs: number; saved: boolean; now: number }): Timer {
  return {
    id: input.id,
    name: input.name.trim() || formatDuration(input.durationMs),
    durationMs: input.durationMs,
    saved: input.saved,
    createdAt: input.now,
    state: 'idle',
  };
}

function reset(t: Timer): Timer {
  const { startedAt: _s, endsAt: _e, remainingMs: _r, finishedAt: _f, ...rest } = t;
  return { ...rest, state: 'idle' };
}

export function startTimer(t: Timer, now: number): Timer {
  return { ...reset(t), state: 'running', startedAt: now, endsAt: now + t.durationMs };
}

export function pauseTimer(t: Timer, now: number): Timer {
  if (t.state !== 'running' || t.endsAt === undefined) return t;
  const { endsAt: _e, ...rest } = t;
  return { ...rest, state: 'paused', remainingMs: Math.max(0, t.endsAt - now) };
}

export function resumeTimer(t: Timer, now: number): Timer {
  if (t.state !== 'paused') return t;
  const remaining = t.remainingMs ?? t.durationMs;
  const { remainingMs: _r, ...rest } = t;
  return { ...rest, state: 'running', startedAt: now - (t.durationMs - remaining), endsAt: now + remaining };
}

export function stopTimer(t: Timer): Timer {
  return reset(t);
}

export function restartTimer(t: Timer, now: number): Timer {
  return startTimer(t, now);
}

/**
 * Lengthen or shorten a run in flight (workout rest: "+30 s" / "−30 s").
 * Running: the end moves and the duration follows, so progress and a later
 * restart use the adjusted length; shortening past the end finishes the timer
 * now. Paused: the remaining time changes. Idle / finished: the duration.
 */
export function extendTimer(t: Timer, deltaMs: number, now: number): Timer {
  if (!Number.isFinite(deltaMs) || deltaMs === 0) return t;
  const duration = Math.max(MIN_DURATION_MS, Math.min(MAX_DURATION_MS, t.durationMs + deltaMs));
  switch (t.state) {
    case 'running': {
      const endsAt = (t.endsAt ?? now) + deltaMs;
      if (endsAt <= now) return finishTimer({ ...t, durationMs: duration, endsAt: now }, now);
      return { ...t, durationMs: duration, endsAt };
    }
    case 'paused':
      return { ...t, durationMs: duration, remainingMs: Math.max(0, (t.remainingMs ?? t.durationMs) + deltaMs) };
    default:
      return { ...t, durationMs: duration };
  }
}

export function finishTimer(t: Timer, now: number): Timer {
  if (t.state === 'finished') return t;
  return { ...t, state: 'finished', finishedAt: now, endsAt: t.endsAt ?? now };
}

/** Bring a stored timer up to date: a running timer past its end is finished. */
export function reconcile(t: Timer, now: number): Timer {
  if (t.state === 'running' && t.endsAt !== undefined && t.endsAt <= now) return finishTimer(t, t.endsAt);
  return t;
}

export function remainingMs(t: Timer, now: number): number {
  switch (t.state) {
    case 'running':
      return Math.max(0, (t.endsAt ?? now) - now);
    case 'paused':
      return t.remainingMs ?? t.durationMs;
    case 'finished':
      return 0;
    default:
      return t.durationMs;
  }
}

/** 0 → 1 as the timer runs. */
export function progress(t: Timer, now: number): number {
  if (t.state === 'idle') return 0;
  if (t.state === 'finished') return 1;
  return Math.min(1, Math.max(0, 1 - remainingMs(t, now) / t.durationMs));
}

const stateRank: Record<TimerState, number> = { finished: 0, running: 1, paused: 2, idle: 3 };

/** Ringing first, then running (soonest end first), paused, then idle in creation order. */
export function sortTimers(list: Timer[], now: number): Timer[] {
  return [...list].sort((a, b) => {
    const r = stateRank[a.state] - stateRank[b.state];
    if (r !== 0) return r;
    if (a.state === 'running') return remainingMs(a, now) - remainingMs(b, now);
    return a.createdAt - b.createdAt;
  });
}

/** Id of the alarm registered with the native shell for a timer. */
export function alarmId(timerId: string): string {
  return `timer:${timerId}`;
}

export function timerIdFromAlarm(alarm: string): string | null {
  return alarm.startsWith('timer:') ? alarm.slice('timer:'.length) : null;
}
