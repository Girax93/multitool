import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, addExercise, newWeek, sessionMinutes, touchSession, updateDay, updateSet, type Week } from './model.js';
import { DEFAULT_LIBRARY } from './library.js';
import {
  bodyweightOn,
  bodyweightSeries,
  calendarMonth,
  exerciseTotals,
  muscleTotals,
  muscleWeekly,
  volumeWeekly,
  dayActivities,
  durationSeries,
  exerciseCatalogue,
  exerciseProgress,
  heatLevel,
  metricValue,
  parseSetValue,
  parseWeight,
  setsLogged,
  statsRange,
  summarize,
  weekSlots,
  weeklyActivity,
} from './stats.js';

const NOW = Date.UTC(2026, 8, 17, 12);

function week(id: string, startDate: string, label = ''): Week {
  let w = newWeek({ id, dayIds: [`${id}-m`, `${id}-w`, `${id}-f`], now: NOW, settings: DEFAULT_SETTINGS, startDate, label: label || undefined });
  w = addExercise(w, { id: 'pistol-squats', name: 'Pistol Squats', weight: '', sets: 3 });
  w = addExercise(w, { id: 'dumbbell-rows', name: 'Dumbbell Rows', weight: '24kg', sets: 3 });
  return w;
}

test('set notation: reps, sums, weights, marks and not-done cells', () => {
  assert.deepEqual(parseSetValue('12'), { logged: true, reps: 12 });
  assert.deepEqual(parseSetValue('12!!'), { logged: true, reps: 12 });
  assert.deepEqual(parseSetValue('!! 16'), { logged: true, reps: 16 });
  assert.deepEqual(parseSetValue('6+4'), { logged: true, reps: 10 });
  assert.deepEqual(parseSetValue('30+30'), { logged: true, reps: 60 });
  assert.deepEqual(parseSetValue('50+'), { logged: true, reps: 50 });
  assert.deepEqual(parseSetValue('9,3'), { logged: true, reps: 9 });
  assert.deepEqual(parseSetValue('12(20)'), { logged: true, reps: 12, weight: 20 });
  assert.deepEqual(parseSetValue('12(20)!'), { logged: true, reps: 12, weight: 20 });
  assert.deepEqual(parseSetValue('6 (2kg)'), { logged: true, reps: 6, weight: 2 });
  assert.deepEqual(parseSetValue('7.5(1.5)'), { logged: true, reps: 7.5, weight: 1.5 });
  assert.deepEqual(parseSetValue('6(on b)'), { logged: true, reps: 6 });
  assert.deepEqual(parseSetValue('Ok+'), { logged: true });
  assert.deepEqual(parseSetValue('Gr8!!'), { logged: true, reps: 8 }); // the 8 in Gr8 — harmless for a qualitative exercise
  assert.deepEqual(parseSetValue('-'), { logged: false });
  assert.deepEqual(parseSetValue('✗'), { logged: false });
  assert.deepEqual(parseSetValue('Skip'), { logged: false });
  assert.deepEqual(parseSetValue('N/A'), { logged: false });
  assert.deepEqual(parseSetValue(''), { logged: false });
  assert.equal(parseWeight('24kg'), 24);
  assert.equal(parseWeight('12 kg'), 12);
  assert.equal(parseWeight('26kg → 18kg'), 18);
  assert.equal(parseWeight('14kg pure,assisted (8-10 aim)'), 14);
  assert.equal(parseWeight('14(10) kg'), 14);
  assert.equal(parseWeight('x = wall, y = bench'), undefined);
  assert.equal(parseWeight(''), undefined);
});

test('day activities: tracked / other / off, sets, bodyweight, session minutes', () => {
  let w = week('a', '2026-08-31', 'Week 83');
  w = updateSet(w, 'a-m', 'pistol-squats', 0, { v: '8' });
  w = updateSet(w, 'a-m', 'pistol-squats', 1, { v: '-' });
  w = updateSet(w, 'a-m', 'dumbbell-rows', 0, { v: '12(26)' });
  w = updateDay(w, 'a-m', { bodyweight: 86.5 });
  w = updateDay(w, 'a-w', { alt: 'Run' });
  w = updateDay(w, 'a-f', { c: 'red' });
  w = touchSession(w, 'a-m', NOW);
  w = touchSession(w, 'a-m', NOW + 40 * 60_000, 90);
  w = touchSession(w, 'a-m', NOW + 52 * 60_000, 600);
  assert.equal(sessionMinutes(w.days[0]!), 52);
  assert.equal(w.days[0]?.session?.restSec, 690);
  // a much later touch starts a new session
  const later = touchSession(w, 'a-m', NOW + 6 * 3_600_000);
  assert.deepEqual(later.days[0]?.session, { start: NOW + 6 * 3_600_000, end: NOW + 6 * 3_600_000, restSec: 0 });

  assert.equal(setsLogged(w.days[0]!), 2);
  const days = dayActivities([w]);
  assert.equal(days.size, 3);
  const mon = days.get('2026-08-31')!;
  assert.equal(mon.kind, 'tracked');
  assert.equal(mon.sets, 2);
  assert.equal(mon.bodyweight, 86.5);
  assert.equal(mon.minutes, 52);
  assert.equal(mon.restMinutes, 12);
  assert.equal(mon.weekLabel, 'Week 83');
  assert.deepEqual([days.get('2026-09-02')?.kind, days.get('2026-09-02')?.alt], ['other', 'Run']);
  assert.deepEqual([days.get('2026-09-04')?.kind, days.get('2026-09-04')?.marked], ['off', true]);
});

test('ranges and calendar-week slots keep skipped weeks and number them', () => {
  const weeks = [week('a', '2026-08-10', 'Week 80'), week('c', '2026-08-31', 'Week 83')]; // 17 and 24 Aug skipped
  const today = '2026-09-17'; // Thu, week of 14 Sep
  assert.deepEqual(statsRange(weeks, 'last', 4, today), { from: '2026-08-24', to: '2026-09-14' });
  assert.deepEqual(statsRange(weeks, 'all', 4, today), { from: '2026-08-10', to: '2026-09-14' });
  assert.deepEqual(statsRange([], 'all', 4, today), { from: '2026-09-14', to: '2026-09-14' });
  const slots = weekSlots(weeks, statsRange(weeks, 'all', 0, today));
  assert.deepEqual(
    slots.map((s) => [s.start, s.n, s.weeks.length]),
    [
      ['2026-08-10', 80, 1],
      ['2026-08-17', 81, 0],
      ['2026-08-24', 82, 0],
      ['2026-08-31', 83, 1],
      ['2026-09-07', 84, 0],
      ['2026-09-14', 85, 0],
    ],
  );
});

test('weekly activity and the summary count empty weeks', () => {
  let a = week('a', '2026-08-10', 'Week 80');
  a = updateSet(a, 'a-m', 'pistol-squats', 0, { v: '8' });
  a = updateSet(a, 'a-w', 'pistol-squats', 0, { v: '9' });
  a = updateDay(a, 'a-m', { bodyweight: 87 });
  a = updateDay(a, 'a-f', { alt: 'Football' });
  let c = week('c', '2026-08-31', 'Week 83');
  c = updateSet(c, 'c-m', 'dumbbell-rows', 2, { v: '10' });
  c = updateDay(c, 'c-m', { bodyweight: 86 });
  c = touchSession(c, 'c-m', NOW);
  c = touchSession(c, 'c-m', NOW + 30 * 60_000);
  const weeks = [a, c];
  const range = statsRange(weeks, 'all', 0, '2026-09-17');
  const weekly = weeklyActivity(weeks, range);
  assert.deepEqual(
    weekly.map((w) => [w.n, w.tracked, w.other, w.off, w.empty, w.sets, w.minutes ?? null]),
    [
      [80, 2, 1, 0, false, 2, null],
      [81, 0, 0, 0, true, 0, null],
      [82, 0, 0, 0, true, 0, null],
      [83, 1, 0, 2, false, 1, 30],
      [84, 0, 0, 0, true, 0, null],
      [85, 0, 0, 0, true, 0, null],
    ],
  );
  const weights = bodyweightSeries(weeks, range);
  assert.deepEqual(weights, [
    { date: '2026-08-10', kg: 87 },
    { date: '2026-08-31', kg: 86 },
  ]);
  const durations = durationSeries(weeks, range);
  assert.deepEqual(durations.map((d) => [d.date, d.minutes]), [['2026-08-31', 30]]);
  const s = summarize(weekly, weights, durations);
  assert.deepEqual(s, { weeks: 6, emptyWeeks: 4, trained: 3, other: 1, sets: 3, perWeek: 0.7, weightDelta: -1, avgMinutes: 30 });
  // a narrower range leaves the earlier weigh-in out
  assert.deepEqual(bodyweightSeries(weeks, statsRange(weeks, 'last', 3, '2026-09-17')), [{ date: '2026-08-31', kg: 86 }]);
});

test('exercise catalogue and progression per calendar week', () => {
  let a = week('a', '2026-08-10', 'Week 80');
  a = updateSet(a, 'a-m', 'dumbbell-rows', 0, { v: '12' });
  a = updateSet(a, 'a-m', 'dumbbell-rows', 1, { v: '10(20)' });
  a = updateSet(a, 'a-w', 'dumbbell-rows', 0, { v: '11!' });
  a = updateSet(a, 'a-w', 'dumbbell-rows', 1, { v: '-' });
  let c = week('c', '2026-08-31', 'Week 83');
  c = { ...c, exercises: c.exercises.map((e) => (e.id === 'dumbbell-rows' ? { ...e, name: 'Rows', weight: '26kg' } : e)) };
  c = updateSet(c, 'c-f', 'dumbbell-rows', 0, { v: '8' });
  c = updateSet(c, 'c-f', 'dumbbell-rows', 1, { v: 'Ok' });
  const weeks = [a, c];
  const cat = exerciseCatalogue(weeks);
  assert.deepEqual(
    cat.map((e) => [e.id, e.name, e.weeks]),
    [
      ['pistol-squats', 'Pistol Squats', 2],
      ['dumbbell-rows', 'Rows', 2],
    ],
  );
  const range = statsRange(weeks, 'all', 0, '2026-09-17');
  const rows = exerciseProgress(weeks, 'dumbbell-rows', range);
  assert.deepEqual(
    rows.map((r) => [r.n, r.planned, r.sets, r.best ?? null, r.total ?? null, r.volume ?? null, r.weight ?? null]),
    [
      [80, true, 3, 12, 33, 12 * 24 + 10 * 20 + 11 * 24, 24],
      [81, false, 0, null, null, null, null],
      [82, false, 0, null, null, null, null],
      [83, true, 2, 8, 8, 8 * 26, 26],
      [84, false, 0, null, null, null, null],
      [85, false, 0, null, null, null, null],
    ],
  );
  assert.equal(rows[0]?.name, 'Dumbbell Rows');
  assert.equal(rows[3]?.name, 'Rows');
  assert.equal(metricValue(rows[0]!, 'best'), 12);
  assert.equal(metricValue(rows[3]!, 'sets'), 2);
  assert.equal(metricValue(rows[1]!, 'sets'), undefined);
  // a planned week with nothing logged stays planned, without values
  const empty = exerciseProgress([week('e', '2026-09-07', 'Week 84')], 'pistol-squats', { from: '2026-09-07', to: '2026-09-07' })[0]!;
  assert.deepEqual([empty.planned, empty.sets, empty.best], [true, 0, undefined]);
});

test('heat levels and the month grid', () => {
  assert.deepEqual([heatLevel(1, 18), heatLevel(6, 18), heatLevel(12, 18), heatLevel(18, 18), heatLevel(0, 18), heatLevel(3, 0)], [1, 2, 3, 4, 1, 1]);
  let a = week('a', '2026-08-31', 'Week 83');
  a = updateSet(a, 'a-m', 'pistol-squats', 0, { v: '8' });
  const m = calendarMonth(2026, 8, dayActivities([a])); // September 2026 starts on a Tuesday
  assert.equal(m.rows.length, 5);
  assert.equal(m.rows[0]?.start, '2026-08-31');
  assert.deepEqual(m.rows[0]?.days.map((d) => [d.d, d.inMonth]).slice(0, 3), [[31, false], [1, true], [2, true]]);
  assert.equal(m.rows[0]?.days[0]?.activity?.kind, 'tracked');
  assert.equal(m.rows[4]?.days[6]?.date, '2026-10-04');
  assert.equal(calendarMonth(2026, 1, new Map()).rows.length, 5); // Feb 2026 starts on a Sunday → five Monday-first rows
  assert.equal(calendarMonth(2027, 1, new Map()).rows.length, 4); // Feb 2027 starts on a Monday → four
});

test('muscle groups and volume come from the library and the day\'s bodyweight', () => {
  let a = week('a', '2026-08-10', 'Week 80');
  a = { ...a, exercises: [{ id: 'pistol-squats', name: 'Pistol Squats', weight: '', sets: 3 }, { id: '1-step-chest-press', name: '+1 step Chest Press', weight: '24kg', sets: 3 }] };
  a = updateDay(a, 'a-m', { bodyweight: 84 });
  a = updateSet(a, 'a-m', 'pistol-squats', 0, { v: '8' }); // 8 × 71.4 = 571
  a = updateSet(a, 'a-m', 'pistol-squats', 1, { v: '6' }); // 6 × 71.4 = 428
  a = updateSet(a, 'a-m', '1-step-chest-press', 0, { v: '12' }); // 12 × 48 = 576
  a = updateSet(a, 'a-w', '1-step-chest-press', 0, { v: '10(20)' }); // 10 × 40 = 400, bodyweight carried from Monday
  const range = statsRange([a], 'all', 0, '2026-08-20');
  const mw = muscleWeekly([a], range, DEFAULT_LIBRARY);
  assert.equal(mw.length, 2);
  const w80 = mw[0]!;
  assert.equal(w80.sets.quads, 2);
  assert.equal(w80.sets.glutes, 2);
  assert.equal(w80.sets.hamstrings, 1); // helper: half a set each
  assert.equal(w80.sets.chest, 2);
  assert.equal(w80.sets.triceps, 1);
  assert.equal(w80.sets.back, 0);
  assert.equal(w80.load.quads, 571 + 428);
  assert.equal(w80.load.chest, 576 + 400);
  assert.equal(w80.load.triceps, Math.round((576 + 400) / 2));
  assert.deepEqual(mw[1]!.sets.quads, 0);
  const totals = muscleTotals(mw);
  assert.deepEqual(totals.slice(0, 2).map((m) => [m.group, m.sets]), [['quads', 2], ['glutes', 2]]);
  assert.equal(totals.some((m) => m.group === 'back'), false);
  const ex = exerciseTotals([a], range, DEFAULT_LIBRARY);
  assert.deepEqual(ex.map((e) => [e.key, e.name, e.sets, e.reps, e.load]), [
    ['pistol-squats', 'Pistol Squats', 2, 14, 571 + 428],
    ['chest-press', 'Chest Press', 2, 22, 976],
  ]);
  const vol = volumeWeekly([a], range, DEFAULT_LIBRARY);
  assert.deepEqual(vol.map((v) => [v.n, v.sets, v.reps, v.load, v.empty]), [
    [80, 4, 36, 571 + 428 + 976, false],
    [81, 0, 0, 0, true],
  ]);
  assert.equal(bodyweightOn([{ date: '2026-08-10', kg: 84 }, { date: '2026-08-20', kg: 83 }], '2026-08-15'), 84);
  assert.equal(bodyweightOn([{ date: '2026-08-10', kg: 84 }], '2026-08-01'), undefined);
  // progression volume of a bodyweight exercise uses the library share
  const rows = exerciseProgress([a], 'pistol-squats', range, DEFAULT_LIBRARY);
  assert.equal(rows[0]?.volume, 571 + 428);
  // catalogue folds the renamed chest press into the library entry
  assert.deepEqual(exerciseCatalogue([a], DEFAULT_LIBRARY).map((e) => [e.id, e.name]), [['pistol-squats', 'Pistol Squats'], ['chest-press', 'Chest Press']]);
});
