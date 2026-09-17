import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS,
  addDay,
  addExercise,
  addFootnote,
  formatSet,
  getSet,
  isoWeek,
  mondayOf,
  moveExercise,
  newWeek,
  nextFootnoteNumber,
  parseLegacyCell,
  parseWorkoutExport,
  removeExercise,
  removeFootnote,
  sortWeeks,
  toggleRef,
  updateDay,
  updateExercise,
  updateExerciseDayStyle,
  updateSet,
  weekSummary,
  weekdayOfDate,
  type Week,
} from './model.js';

const NOW = Date.UTC(2026, 8, 17, 12); // 2026-09-17
const ids = ['d1', 'd2', 'd3'];

function baseWeek(): Week {
  let w = newWeek({ id: 'w1', dayIds: ids, now: NOW, settings: DEFAULT_SETTINGS, startDate: '2026-05-25' });
  w = addExercise(w, { id: 'squat', name: 'Pistol Squats', weight: '', sets: 3 });
  w = addExercise(w, { id: 'rows', name: 'Dumbbell Rows', weight: '24kg', sets: 3 });
  return w;
}

test('dates: monday, iso week, weekday', () => {
  assert.equal(mondayOf(new Date(2026, 8, 17)), '2026-09-14'); // Thu → Mon
  assert.equal(mondayOf(new Date(2026, 8, 14)), '2026-09-14');
  assert.equal(mondayOf(new Date(2026, 8, 20)), '2026-09-14'); // Sun → previous Mon
  assert.deepEqual(isoWeek('2026-05-25'), { year: 2026, week: 22 });
  assert.deepEqual(isoWeek('2026-01-01'), { year: 2026, week: 1 });
  assert.equal(weekdayOfDate('2026-05-27'), 'Wed');
});

test('newWeek uses default days with dates and copies exercises from the previous week', () => {
  const w = baseWeek();
  assert.equal(w.label, 'Week 22');
  assert.deepEqual(
    w.days.map((d) => [d.weekday, d.date]),
    [
      ['Mon', '2026-05-25'],
      ['Wed', '2026-05-27'],
      ['Fri', '2026-05-29'],
    ],
  );
  const next = newWeek({ id: 'w2', dayIds: ['e1', 'e2', 'e3'], now: NOW, settings: DEFAULT_SETTINGS, previous: w });
  assert.equal(next.startDate, '2026-06-01');
  assert.equal(next.label, 'Week 23');
  assert.deepEqual(
    next.exercises.map((e) => e.id),
    ['squat', 'rows'],
  );
  assert.equal(next.days[0]?.cells['rows']?.sets.length, 3);
  assert.deepEqual(next.footnotes, {});
});

test('set updates, styles and cleaning', () => {
  let w = baseWeek();
  w = updateSet(w, 'd1', 'squat', 1, { v: '8', c: 'green' });
  assert.deepEqual(getSet(w, 'd1', 'squat', 1), { v: '8', c: 'green' });
  w = updateSet(w, 'd1', 'squat', 1, { c: undefined, star: true });
  assert.deepEqual(getSet(w, 'd1', 'squat', 1), { v: '8', star: true });
  w = updateSet(w, 'd1', 'squat', 1, { star: false });
  assert.deepEqual(getSet(w, 'd1', 'squat', 1), { v: '8' });
  // index beyond current sets grows the array
  w = updateSet(w, 'd1', 'squat', 4, { v: '5' });
  assert.equal(w.days[0]?.cells['squat']?.sets.length, 5);
  w = updateExerciseDayStyle(w, 'd2', 'rows', { c: 'red' });
  assert.equal(w.days[1]?.cells['rows']?.c, 'red');
  w = updateDay(w, 'd3', { bodyweight: 95.8, marks: '*', notes: 'tired' });
  assert.equal(w.days[2]?.bodyweight, 95.8);
  assert.equal(w.days[2]?.marks, '*');
});

test('exercise add / update sets / move / remove', () => {
  let w = baseWeek();
  w = updateSet(w, 'd1', 'rows', 2, { v: '10', fn: [1] });
  w = updateExercise(w, 'rows', { sets: 2, weight: '26kg' });
  assert.equal(w.exercises[1]?.weight, '26kg');
  assert.equal(w.days[0]?.cells['rows']?.sets.length, 2);
  w = updateExercise(w, 'rows', { sets: 4 });
  assert.equal(w.days[0]?.cells['rows']?.sets.length, 4);
  w = moveExercise(w, 'rows', -1);
  assert.deepEqual(
    w.exercises.map((e) => e.id),
    ['rows', 'squat'],
  );
  assert.equal(moveExercise(w, 'rows', -1), w); // already first
  w = addFootnote(w, 'squat', 'note').week;
  w = removeExercise(w, 'squat');
  assert.deepEqual(
    w.exercises.map((e) => e.id),
    ['rows'],
  );
  assert.equal(w.days[0]?.cells['squat'], undefined);
  assert.equal(w.footnotes['squat'], undefined);
});

test('footnotes are numbered per exercise and references follow removal', () => {
  let w = baseWeek();
  assert.equal(nextFootnoteNumber(w, 'squat'), 1);
  const a = addFootnote(w, 'squat', '4 on ground, 4 on bench');
  w = a.week;
  const b = addFootnote(w, 'squat', '5 "", 3 ""');
  w = b.week;
  assert.deepEqual([a.n, b.n], [1, 2]);
  assert.equal(nextFootnoteNumber(w, 'rows'), 1); // independent per exercise
  w = updateSet(w, 'd1', 'squat', 0, toggleRef(getSet(w, 'd1', 'squat', 0), 2));
  w = updateSet(w, 'd1', 'squat', 0, toggleRef(getSet(w, 'd1', 'squat', 0), 1));
  assert.deepEqual(getSet(w, 'd1', 'squat', 0).fn, [1, 2]);
  assert.equal(formatSet({ v: '8', fn: [1, 2] }), '8¹²');
  w = removeFootnote(w, 'squat', 1);
  assert.deepEqual(getSet(w, 'd1', 'squat', 0).fn, [2]);
  assert.deepEqual(w.footnotes['squat'], [{ n: 2, text: '5 "", 3 ""' }]);
  assert.equal(nextFootnoteNumber(w, 'squat'), 3); // numbers never reused
  w = updateSet(w, 'd1', 'squat', 0, toggleRef(getSet(w, 'd1', 'squat', 0), 2));
  assert.equal(getSet(w, 'd1', 'squat', 0).fn, undefined);
});

test('legacy dot notation', () => {
  assert.deepEqual(parseLegacyCell('16..'), { v: '16', fn: [2] });
  assert.deepEqual(parseLegacyCell('6+4.'), { v: '6+4', fn: [1] });
  assert.deepEqual(parseLegacyCell('12'), { v: '12' });
  assert.deepEqual(parseLegacyCell(' 8 '), { v: '8' });
  assert.deepEqual(parseLegacyCell('12.!'), { v: '12.!' }); // only trailing dots are refs
});

test('days, sorting and summary', () => {
  let w = baseWeek();
  w = addDay(w, 'd4', 'Tue');
  assert.deepEqual(
    w.days.map((d) => d.weekday),
    ['Mon', 'Tue', 'Wed', 'Fri'],
  );
  assert.equal(w.days[1]?.date, '2026-05-26');
  assert.equal(weekSummary(w), '0/4 days · 2 exercises');
  w = updateSet(w, 'd1', 'squat', 0, { v: '8' });
  assert.equal(weekSummary(w), '1/4 days · 2 exercises');

  const later = newWeek({ id: 'w9', dayIds: [], now: NOW + 1, settings: DEFAULT_SETTINGS, startDate: '2026-06-01' });
  const undated = { ...baseWeek(), id: 'u', startDate: undefined, createdAt: 5 };
  assert.deepEqual(
    sortWeeks([later, w, undated]).map((x) => x.id),
    ['u', 'w1', 'w9'],
  );
});

test('import validation', () => {
  assert.throws(() => parseWorkoutExport({ format: 'nope' }), /Not a MultiTool workout file/);
  assert.throws(() => parseWorkoutExport({ format: 'multitool-workout', weeks: [{ id: 'x' }] }), /Malformed week/);
  const ok = parseWorkoutExport({ format: 'multitool-workout', weeks: [{ id: 'x', exercises: [], days: [], startDate: '2026-05-25' }] });
  assert.equal(ok.weeks[0]?.label, 'Week 22');
  assert.deepEqual(ok.weeks[0]?.footnotes, {});
});
