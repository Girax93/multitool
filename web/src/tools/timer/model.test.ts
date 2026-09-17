import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY,
  HOUR,
  MAX_DURATION_MS,
  MINUTE,
  SECOND,
  alarmId,
  createTimer,
  finishTimer,
  formatCountdown,
  formatDuration,
  msToParts,
  parseDurationText,
  partsToMs,
  pauseTimer,
  progress,
  reconcile,
  remainingMs,
  restartTimer,
  resumeTimer,
  sortTimers,
  startTimer,
  stopTimer,
  timerIdFromAlarm,
  validateDuration,
} from './model.js';

const T0 = 1_700_000_000_000;
const make = (durationMs = 10 * MINUTE, saved = false) =>
  createTimer({ id: 'a', name: 'Tea', durationMs, saved, now: T0 });

test('duration parts round-trip', () => {
  const ms = partsToMs({ days: 1, hours: 2, minutes: 3, seconds: 4 });
  assert.equal(ms, DAY + 2 * HOUR + 3 * MINUTE + 4 * SECOND);
  assert.deepEqual(msToParts(ms), { days: 1, hours: 2, minutes: 3, seconds: 4 });
});

test('validateDuration enforces 1s..7d', () => {
  assert.equal(validateDuration(999), 'Minimum is 1 second.');
  assert.equal(validateDuration(1000), null);
  assert.equal(validateDuration(MAX_DURATION_MS), null);
  assert.equal(validateDuration(MAX_DURATION_MS + 1), 'Maximum is 7 days.');
  assert.equal(validateDuration(NaN), 'Enter a duration.');
});

test('parseDurationText understands common forms', () => {
  assert.equal(parseDurationText('1h 30m'), 90 * MINUTE);
  assert.equal(parseDurationText('90s'), 90 * SECOND);
  assert.equal(parseDurationText('2d 4h'), 2 * DAY + 4 * HOUR);
  assert.equal(parseDurationText('10:30'), 10 * MINUTE + 30 * SECOND);
  assert.equal(parseDurationText('1:02:03'), HOUR + 2 * MINUTE + 3 * SECOND);
  assert.equal(parseDurationText('5'), 5 * MINUTE);
  assert.equal(parseDurationText('1.5h'), 90 * MINUTE);
  assert.equal(parseDurationText('nonsense'), null);
  assert.equal(parseDurationText(''), null);
});

test('formatting', () => {
  assert.equal(formatCountdown(5 * SECOND), '0:05');
  assert.equal(formatCountdown(5 * SECOND - 1), '0:04'); // floors
  assert.equal(formatCountdown(5 * SECOND - 1 + 999), '0:05'); // views add 999ms to show a ceiling
  assert.equal(formatCountdown(12 * MINUTE + 34 * SECOND), '12:34');
  assert.equal(formatCountdown(HOUR + 2 * MINUTE + 3 * SECOND), '1:02:03');
  assert.equal(formatCountdown(3 * DAY + 4 * HOUR + 5 * MINUTE + 6 * SECOND), '3d 04:05:06');
  assert.equal(formatDuration(90 * MINUTE), '1h 30m');
  assert.equal(formatDuration(45 * SECOND), '45s');
  assert.equal(formatDuration(0), '0s');
});

test('start → pause → resume → finish lifecycle', () => {
  let t = make();
  assert.equal(t.state, 'idle');
  assert.equal(remainingMs(t, T0), 10 * MINUTE);

  t = startTimer(t, T0);
  assert.equal(t.state, 'running');
  assert.equal(t.endsAt, T0 + 10 * MINUTE);
  assert.equal(remainingMs(t, T0 + MINUTE), 9 * MINUTE);
  assert.equal(progress(t, T0 + 5 * MINUTE), 0.5);

  t = pauseTimer(t, T0 + 4 * MINUTE);
  assert.equal(t.state, 'paused');
  assert.equal(t.remainingMs, 6 * MINUTE);
  assert.equal(remainingMs(t, T0 + HOUR), 6 * MINUTE); // frozen while paused

  t = resumeTimer(t, T0 + HOUR);
  assert.equal(t.state, 'running');
  assert.equal(t.endsAt, T0 + HOUR + 6 * MINUTE);

  assert.equal(reconcile(t, T0 + HOUR + 5 * MINUTE).state, 'running');
  const done = reconcile(t, T0 + 2 * HOUR);
  assert.equal(done.state, 'finished');
  assert.equal(done.finishedAt, t.endsAt);
  assert.equal(remainingMs(done, T0 + 2 * HOUR), 0);
  assert.equal(progress(done, T0), 1);
});

test('stop resets, restart starts fresh', () => {
  const running = startTimer(make(), T0);
  const stopped = stopTimer(running);
  assert.equal(stopped.state, 'idle');
  assert.equal(stopped.endsAt, undefined);
  const finished = finishTimer(running, T0 + 10 * MINUTE);
  const restarted = restartTimer(finished, T0 + HOUR);
  assert.equal(restarted.state, 'running');
  assert.equal(restarted.endsAt, T0 + HOUR + 10 * MINUTE);
  assert.equal(restarted.finishedAt, undefined);
});

test('pause/resume are no-ops in the wrong state', () => {
  const idle = make();
  assert.equal(pauseTimer(idle, T0), idle);
  assert.equal(resumeTimer(idle, T0), idle);
});

test('sortTimers: ringing, then running by remaining, paused, idle', () => {
  const now = T0 + MINUTE;
  const idle = { ...make(), id: 'idle', createdAt: T0 - 5 };
  const runningLate = startTimer({ ...make(20 * MINUTE), id: 'late' }, T0);
  const runningSoon = startTimer({ ...make(2 * MINUTE), id: 'soon' }, T0);
  const paused = pauseTimer(startTimer({ ...make(), id: 'paused' }, T0), T0 + 10);
  const ringing = finishTimer(startTimer({ ...make(), id: 'ring' }, T0), now);
  const sorted = sortTimers([idle, runningLate, paused, ringing, runningSoon], now).map((t) => t.id);
  assert.deepEqual(sorted, ['ring', 'soon', 'late', 'paused', 'idle']);
});

test('alarm ids', () => {
  assert.equal(alarmId('abc'), 'timer:abc');
  assert.equal(timerIdFromAlarm('timer:abc'), 'abc');
  assert.equal(timerIdFromAlarm('other:abc'), null);
});

test('createTimer falls back to a duration name', () => {
  const t = createTimer({ id: 'x', name: '   ', durationMs: 5 * MINUTE, saved: true, now: T0 });
  assert.equal(t.name, '5m');
  assert.equal(t.saved, true);
});
