import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS,
  SESSION_IDLE_MS,
  completeSession,
  dayComplete,
  staleSessions,
  addDay,
  addExercise,
  addFootnote,
  clearDay,
  clearWeek,
  dayHasHappened,
  displayFootnotes,
  emptyDuplicateWeeks,
  emptySetIndexes,
  exerciseDone,
  formatSeconds,
  mergeSettings,
  nextTimedExercise,
  parseSeconds,
  sessionDay,
  sessionMinutes,
  weekForDate,
  workForExercise,
  formatSet,
  getSet,
  hasLink,
  isoWeek,
  mondayOf,
  moveExercise,
  newDay,
  newWeek,
  nextFootnoteNumber,
  nextWeekLabelFrom,
  noteSuggestions,
  prepForExercise,
  previousExercise,
  restForSet,
  setExerciseWeight,
  splitNotePieces,
  numberedFootnotes,
  pageTabLabel,
  parseLegacyCell,
  parseWorkoutExport,
  removeExercise,
  removeFootnote,
  setDayDate,
  setDayWeekday,
  sortWeeks,
  splitLinks,
  toTypedCell,
  toggleRef,
  touchSession,
  typeSet,
  updateDay,
  updateExercise,
  updateExerciseDayStyle,
  updateFootnote,
  updateSet,
  weekHasBegun,
  weekHasContent,
  weekNumbers,
  weekSummary,
  weekdayOfDate,
  type Exercise,
  type SetCell,
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
  assert.equal(next.label, 'Week 23'); // previous label "Week 22" + 1
  const custom = newWeek({ id: 'w3', dayIds: [], now: NOW, settings: DEFAULT_SETTINGS, previous: { ...w, label: 'Block 79' } });
  assert.equal(custom.label, 'Block 80');
  const named = newWeek({ id: 'w4', dayIds: [], now: NOW, settings: DEFAULT_SETTINGS, previous: { ...w, label: 'Deload' } });
  assert.equal(named.label, 'Week 23'); // falls back to the ISO week
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

test('plain notes have no number, keep unique keys and never disturb the numbering', () => {
  let w = baseWeek();
  const p1 = addFootnote(w, 'squat', 'felt great all week', false);
  w = p1.week;
  const n1 = addFootnote(w, 'squat', 'left knee');
  w = n1.week;
  const p2 = addFootnote(w, 'squat', 'try 5 sets next week', false);
  w = p2.week;
  assert.deepEqual([p1.n, n1.n, p2.n], [-1, 1, -2]);
  assert.equal(nextFootnoteNumber(w, 'squat'), 2);
  assert.deepEqual(
    numberedFootnotes(w, 'squat').map((f) => f.n),
    [1],
  );
  assert.deepEqual(
    displayFootnotes(w, 'squat').map((f) => f.text),
    ['left knee', 'felt great all week', 'try 5 sets next week'],
  );
  w = updateFootnote(w, 'squat', -1, 'felt great');
  w = removeFootnote(w, 'squat', -2);
  assert.deepEqual(w.footnotes['squat'], [
    { n: -1, text: 'felt great' },
    { n: 1, text: 'left knee' },
  ]);
});

test('moving a day to another weekday keeps its sets and the date follows', () => {
  let w = baseWeek();
  w = updateSet(w, 'd1', 'squat', 0, { v: '12' });
  w = setDayWeekday(w, 'd1', 'Tue');
  assert.deepEqual(
    w.days.map((d) => [d.id, d.weekday, d.date]),
    [
      ['d1', 'Tue', '2026-05-26'],
      ['d2', 'Wed', '2026-05-27'],
      ['d3', 'Fri', '2026-05-29'],
    ],
  );
  assert.equal(getSet(w, 'd1', 'squat', 0).v, '12');
  // Thursday sorts after Wednesday
  w = setDayWeekday(w, 'd1', 'Thu');
  assert.deepEqual(
    w.days.map((d) => d.id),
    ['d2', 'd1', 'd3'],
  );
  // a date picks its weekday
  w = setDayDate(w, 'd3', '2026-05-30');
  assert.deepEqual(w.days.find((d) => d.id === 'd3')?.weekday, 'Sat');
  w = setDayDate(w, 'd3', undefined);
  assert.equal(w.days.find((d) => d.id === 'd3')?.date, undefined);
  assert.equal(w.days.find((d) => d.id === 'd3')?.weekday, 'Sat');
  // without a week start date the day's own date shifts along
  const undated = setDayWeekday({ ...baseWeek(), startDate: undefined }, 'd1', 'Sun');
  assert.equal(undated.days[undated.days.length - 1]?.weekday, 'Sun');
  assert.equal(undated.days[undated.days.length - 1]?.date, '2026-05-31');
});

test('legacy dot notation', () => {
  assert.deepEqual(parseLegacyCell('16..'), { v: '16', fn: [2] });
  assert.deepEqual(parseLegacyCell('6+4.'), { v: '6+4', fn: [1] });
  assert.deepEqual(parseLegacyCell('12'), { v: '12' });
  assert.deepEqual(parseLegacyCell(' 8 '), { v: '8' });
  assert.deepEqual(parseLegacyCell('12.!'), { v: '12!', fn: [1] });
  assert.deepEqual(parseLegacyCell('12!!.'), { v: '12!!', fn: [1] });
  assert.deepEqual(parseLegacyCell('12.***'), { v: '12***', fn: [1] });
  assert.deepEqual(parseLegacyCell('8..***'), { v: '8***', fn: [2] });
  assert.deepEqual(parseLegacyCell('12.. …'), { v: '12', fn: [2, 3] });
  assert.deepEqual(parseLegacyCell('12 …'), { v: '12', fn: [3] });
  assert.deepEqual(parseLegacyCell('***.'), { v: '***', fn: [1] });
  assert.deepEqual(parseLegacyCell('8(10)!!.'), { v: '8(10)!!', fn: [1] });
  assert.deepEqual(parseLegacyCell('10.5'), { v: '10.5' }); // decimal, not a ref
  assert.deepEqual(parseLegacyCell('13⭐'), { v: '13', star: true });
  assert.deepEqual(parseLegacyCell('N/A'), { v: 'N/A' });
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
  // another workout instead of the tracked exercises still counts as trained
  w = updateDay(w, 'd2', { alt: '40 min full body (YouTube)' });
  assert.equal(weekSummary(w), '2/4 days · 2 exercises');
  w = updateDay(w, 'd2', { alt: '' });
  assert.equal(weekSummary(w), '1/4 days · 2 exercises');
  assert.equal(w.days.find((d) => d.id === 'd2')?.alt, undefined); // clean() drops the empty string

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

test('typing into a set cell: value, marks, dot references; missing notes are created empty', () => {
  let w = baseWeek();
  w = updateSet(w, 'd1', 'squat', 0, { c: 'green' });
  w = typeSet(w, 'd1', 'squat', 0, '12!..');
  assert.deepEqual(getSet(w, 'd1', 'squat', 0), { v: '12!', fn: [2], c: 'green' }); // colour kept
  assert.deepEqual(w.footnotes['squat'], [{ n: 2, text: '' }]); // note 2 created, empty
  w = typeSet(w, 'd1', 'squat', 1, '8 . ..');
  assert.deepEqual(getSet(w, 'd1', 'squat', 1).fn, [1, 2]);
  assert.deepEqual(
    w.footnotes['squat']?.map((f) => f.n),
    [2, 1],
  );
  assert.equal(nextFootnoteNumber(w, 'squat'), 3);
  // the typed form round-trips
  assert.equal(toTypedCell({ v: '12!', fn: [2] }), '12!..');
  assert.equal(toTypedCell({ v: '8', fn: [1, 2] }), '8 . ..');
  assert.equal(toTypedCell({ v: '10.5' }), '10.5');
  assert.equal(toTypedCell({ v: '', fn: [3] }), '...');
  for (const cell of [{ v: '12!', fn: [2] }, { v: '8', fn: [1, 2] }, { v: '10.5', fn: [1] }, { v: '6+4' }, { v: '', fn: [3] }]) {
    const back = parseLegacyCell(toTypedCell(cell));
    assert.deepEqual({ v: back.v, fn: back.fn ?? [] }, { v: cell.v, fn: cell.fn ?? [] });
  }
  // clearing the text clears the references too, notes stay
  w = typeSet(w, 'd1', 'squat', 0, '');
  assert.deepEqual(getSet(w, 'd1', 'squat', 0), { v: '', c: 'green' }); // the cell keeps an empty v (it used to be cleaned away, which showed "undefined" in the editor)
  assert.equal(w.footnotes['squat']?.length, 2);
});

test('links in text: [label](url) and bare urls', () => {
  assert.deepEqual(splitLinks('plain text'), [{ text: 'plain text' }]);
  assert.deepEqual(splitLinks('see [the video](https://youtu.be/abc) later'), [
    { text: 'see ' },
    { label: 'the video', url: 'https://youtu.be/abc' },
    { text: ' later' },
  ]);
  assert.deepEqual(splitLinks('https://example.com/a?b=1.'), [{ label: 'example.com/a?b=1', url: 'https://example.com/a?b=1' }, { text: '.' }]);
  assert.deepEqual(splitLinks('(https://x.io)'), [{ text: '(' }, { label: 'x.io', url: 'https://x.io' }, { text: ')' }]);
  assert.equal(hasLink('nothing here'), false);
  assert.equal(hasLink('go https://a.b'), true);
  const long = `https://example.com/${'x'.repeat(60)}`;
  const part = splitLinks(long)[0];
  assert.ok(part && 'label' in part && part.label.length <= 48 && part.url === long);
});

test('empty duplicate weeks are found; anything logged keeps a week', () => {
  const real = { ...baseWeek(), id: 'import-week38', label: 'Week 38' };
  const rogue1 = { ...newWeek({ id: 'wk_a', dayIds: [], now: NOW, settings: DEFAULT_SETTINGS, startDate: '2025-10-20' }), label: 'Week 38' };
  const rogue2 = { ...rogue1, id: 'wk_b', label: 'week 38 ' };
  const other = { ...rogue1, id: 'wk_c', label: 'Week 39' };
  assert.equal(weekHasContent(rogue1), false);
  assert.deepEqual(
    emptyDuplicateWeeks([real, rogue1, rogue2, other], [real]).map((w) => w.id),
    ['wk_a', 'wk_b'],
  );
  // a set, a note, a bodyweight or a week note → not empty
  let typed = { ...rogue1, id: 'wk_t', days: [newDay('t1', 'Mon', '2025-10-20', [])] };
  assert.equal(weekHasContent(typed), false);
  typed = { ...typed, days: [{ ...typed.days[0]!, notes: 'hi' }] };
  assert.equal(weekHasContent(typed), true);
  typed = { ...typed, days: [{ ...typed.days[0]!, notes: undefined, bodyweight: 90 }] };
  assert.equal(weekHasContent(typed), true);
  assert.equal(weekHasContent({ ...rogue1, notes: 'plan' }), true);
  assert.equal(weekHasContent({ ...rogue1, footnotes: { squat: [{ n: 1, text: 'x' }] } }), true);
  assert.equal(weekHasContent({ ...rogue1, footnotes: { squat: [{ n: 1, text: '' }] } }), false);
  assert.deepEqual(emptyDuplicateWeeks([real, typed], [real]), []);
});

test('the next week label counts calendar weeks on from the highest number', () => {
  const w80 = { ...baseWeek(), id: 'a', label: 'Week 80', startDate: '2026-08-10' };
  const gap = { ...baseWeek(), id: 'b', label: 'No workout', startDate: '2026-08-17' };
  const w79 = { ...baseWeek(), id: 'c', label: 'Week 79', startDate: '2026-08-03' };
  assert.equal(nextWeekLabelFrom([w79, w80, gap]), 'Week 81');
  assert.equal(nextWeekLabelFrom([w79, w80, gap], '2026-08-17'), 'Week 81');
  assert.equal(nextWeekLabelFrom([w79, w80, gap], '2026-09-21'), 'Week 86'); // skipped weeks still count
  assert.equal(nextWeekLabelFrom([w79, w80, gap], '2026-08-10'), 'Week 81'); // never the same or lower
  assert.equal(nextWeekLabelFrom([gap]), undefined);
  assert.equal(nextWeekLabelFrom([]), undefined);
});

test('workout mode helpers: today\'s week and day, timed exercises, seconds', () => {
  let w = baseWeek(); // starts 2026-05-25, Mon/Wed/Fri
  w = updateExercise(w, 'rows', { timedSec: 90 });
  const other = { ...baseWeek(), id: 'w2', startDate: '2026-06-01' };
  assert.equal(weekForDate([w, other], '2026-05-27')?.id, 'w1');
  assert.equal(weekForDate([w, other], '2026-06-01')?.id, 'w2');
  assert.equal(weekForDate([w, other], '2026-06-08'), undefined);
  assert.equal(sessionDay(w, '2026-05-27')?.weekday, 'Wed');
  assert.equal(sessionDay(w, '2026-05-26')?.weekday, 'Mon'); // Tuesday: first day with nothing logged
  w = updateSet(w, 'd1', 'squat', 0, { v: '6' });
  assert.equal(sessionDay(w, '2026-05-26')?.weekday, 'Wed');
  const mon = w.days[0]!;
  const squat = w.exercises[0]!;
  assert.deepEqual(emptySetIndexes(mon, squat), [1, 2]);
  assert.deepEqual(emptySetIndexes(mon, w.exercises[1]!), [0, 1, 2]);
  assert.equal(exerciseDone(mon, squat), false);
  assert.equal(nextTimedExercise(w, mon, 'squat')?.id, 'rows'); // rows is timed and untouched
  w = updateSet(w, 'd1', 'rows', 0, { v: 'Ok' });
  assert.equal(nextTimedExercise(w, w.days[0]!, 'squat'), undefined); // already started
  assert.equal(nextTimedExercise(w, mon, 'rows'), undefined); // nothing after rows
  assert.equal(formatSeconds(90), '1:30');
  assert.equal(formatSeconds(5), '0:05');
  assert.equal(parseSeconds('1:30'), 90);
  assert.equal(parseSeconds('90'), 90);
  assert.equal(parseSeconds('2m'), 120);
  assert.equal(parseSeconds('1m 5s'), 65);
  assert.equal(parseSeconds('x'), null);
  assert.equal(mergeSettings({ trackBodyweight: false }).session.restSec, 90);
  assert.equal(mergeSettings({ session: { restSec: 60 } as never }).session.stepSec, 30);
  // a new week copies the timed flag
  const next = newWeek({ id: 'n', dayIds: [], now: NOW, settings: DEFAULT_SETTINGS, previous: w });
  assert.equal(next.exercises[1]?.timedSec, 90);
  assert.equal(next.exercises[0]?.timedSec, undefined);
  // imports may retire ids
  const parsed = parseWorkoutExport({ format: 'multitool-workout', version: 1, weeks: [], remove: ['import-gap-1', 7] });
  assert.deepEqual(parsed.remove, ['import-gap-1']);
});


test('deleting a day or week that has happened clears it and marks it as no workout', () => {
  let w = baseWeek();
  w = updateSet(w, 'd1', 'squat', 0, { v: '8', c: 'green' });
  w = updateDay(w, 'd1', { bodyweight: 86, notes: 'tired', marks: '*', alt: undefined });
  w = updateDay(w, 'd2', { alt: 'Run' });
  w = addFootnote(w, 'squat', 'knee').week;
  w = { ...w, notes: 'plan' };
  const day = clearDay(w, 'd1');
  const d1 = day.days.find((d) => d.id === 'd1')!;
  assert.equal(d1.c, 'red');
  assert.equal(d1.date, '2026-05-25');
  assert.equal(d1.bodyweight, undefined);
  assert.equal(d1.notes, undefined);
  assert.equal(d1.marks, undefined);
  assert.deepEqual(d1.cells['squat']?.sets, [{ v: '' }, { v: '' }, { v: '' }]);
  assert.equal(day.days.length, 3, 'the row stays');
  assert.equal(day.notes, 'plan', 'clearing a day leaves the week alone');

  const week = clearWeek(w, '2026-05-27'); // "today" is the Wednesday of that week
  assert.equal(week.label, 'Week 22');
  assert.equal(week.startDate, '2026-05-25');
  assert.deepEqual(week.exercises.map((e) => e.id), ['squat', 'rows'], 'exercises stay for the next week to copy');
  assert.equal(week.notes, undefined);
  assert.deepEqual(week.footnotes, {});
  assert.deepEqual(
    week.days.map((d) => [d.weekday, d.c ?? null, d.alt ?? null]),
    [
      ['Mon', 'red', null],
      ['Wed', 'red', null],
      ['Fri', null, null], // still ahead: cleared, not marked
    ],
  );
  assert.equal(weekHasContent(clearWeek(w)), true, 'a cleared past week keeps its red days (they count as content for the log)');
  assert.deepEqual(clearWeek(w).days.map((d) => d.c), ['red', 'red', 'red']);

  assert.equal(dayHasHappened(d1, '2026-05-25'), true);
  assert.equal(dayHasHappened(d1, '2026-05-24'), false);
  assert.equal(dayHasHappened({ ...d1, date: undefined }, '2020-01-01'), true);
  assert.equal(weekHasBegun(w, '2026-05-25'), true);
  assert.equal(weekHasBegun(w, '2026-05-24'), false);
  assert.equal(weekHasBegun({ ...w, startDate: undefined }, '2020-01-01'), true);
});

test('week numbers: from the label, else from the nearest numbered week by calendar distance', () => {
  const mk = (id: string, label: string, startDate?: string): Week => ({ id, label, startDate, createdAt: 0, exercises: [], days: [], footnotes: {} });
  const weeks = [
    mk('a', 'Week 79', '2026-08-03'),
    mk('b', 'Week 80', '2026-08-10'),
    mk('c', 'No workout', '2026-08-17'),
    mk('d', 'No workout', '2026-08-24'),
    mk('e', 'Week 83', '2026-08-31'),
    mk('f', 'Sick', undefined),
  ];
  const n = weekNumbers(weeks);
  assert.deepEqual(weeks.map((w) => [w.id, n.get(w.id)]), [['a', 79], ['b', 80], ['c', 81], ['d', 82], ['e', 83], ['f', 6]]);
  // without any numbered week the position is used
  assert.deepEqual([...weekNumbers([mk('x', 'Deload', '2026-01-05'), mk('y', 'Deload', '2026-01-12')]).values()], [1, 2]);
  // tabs go by position, so they never overlap whatever the labels say
  assert.equal(pageTabLabel(0, 10), '1–10');
  assert.equal(pageTabLabel(70, 10), '71–80');
  assert.equal(pageTabLabel(80, 6), '81–86');
  assert.equal(pageTabLabel(85, 1), '86');
});

test('a changed weight turns the header purple; the same weight takes it off again', () => {
  const mk = (id: string, label: string, startDate: string, weight: string, c?: string): Week => ({
    id,
    label,
    startDate,
    createdAt: 0,
    exercises: [{ id: 'rows', name: 'Dumbbell Rows', weight, sets: 3, ...(c ? { c } : {}) }],
    days: [],
    footnotes: {},
  });
  const lib = DEFAULT_SETTINGS.library;
  const w85 = mk('w85', 'Week 85', '2026-09-14', '24kg');
  const w86 = mk('w86', 'Week 86', '2026-09-21', '24kg');
  const weeks = [w86, w85];
  assert.equal(previousExercise(weeks, w86, w86.exercises[0]!, lib)?.weight, '24kg');
  assert.equal(previousExercise(weeks, w85, w85.exercises[0]!, lib), undefined, 'nothing before the first week');
  // the same exercise under another id / name still counts (library match, then the name)
  assert.equal(previousExercise(weeks, w86, { id: 'x1', name: 'NO BENCH: Dumbbell Rows' }, lib)?.weight, '24kg');
  assert.equal(previousExercise(weeks, w86, { id: 'x2', name: 'Something new' }, lib), undefined);

  let w = setExerciseWeight(w86, 'rows', '26kg', '24kg');
  assert.equal(w.exercises[0]?.weight, '26kg');
  assert.equal(w.exercises[0]?.c, 'purple', 'changed → purple');
  w = setExerciseWeight(w, 'rows', '24 kg', '24kg');
  assert.equal(w.exercises[0]?.c, undefined, 'back to the old weight (spacing aside) → plain again');
  // a colour picked by hand is left alone
  const gold = setExerciseWeight(mk('w', 'Week 87', '2026-09-28', '24kg', 'gold'), 'rows', '30kg', '24kg');
  assert.equal(gold.exercises[0]?.c, 'gold');
  // nothing to compare with (first time on the plan): no purple
  assert.equal(setExerciseWeight(w85, 'rows', '26kg', undefined).exercises[0]?.c, undefined);
  // the purple is not copied into the next week (the weight is)
  const next = newWeek({ id: 'w87', dayIds: ['a', 'b', 'c'], now: 0, settings: DEFAULT_SETTINGS, previous: setExerciseWeight(w86, 'rows', '26kg', '24kg') });
  assert.equal(next.exercises[0]?.weight, '26kg');
  assert.equal(next.exercises[0]?.c, undefined);
  assert.equal(setExerciseWeight(w86, 'nope', '1kg', '2kg'), w86, 'unknown exercise: unchanged');
});

test('note suggestions: short comma-separated pieces of earlier day notes, newest first', () => {
  const mk = (id: string, startDate: string, notes: (string | undefined)[]): Week => ({
    id,
    label: id,
    startDate,
    createdAt: 0,
    exercises: [],
    days: notes.map((n, i) => ({ id: `${id}-${i}`, weekday: (['Mon', 'Wed', 'Fri'] as const)[i] ?? 'Mon', cells: {}, ...(n ? { notes: n } : {}) })),
    footnotes: {},
  });
  assert.deepEqual(splitNotePieces('Pre-workout, 30mg Lis,  , Coffee\nSlept badly'), ['Pre-workout', '30mg Lis', 'Coffee', 'Slept badly']);
  assert.deepEqual(splitNotePieces('See https://example.com/x, ok'), ['ok'], 'links are not suggestions');
  assert.deepEqual(splitNotePieces('a'.repeat(33)), [], 'long sentences are not suggestions');
  assert.deepEqual(splitNotePieces(undefined), []);
  const weeks = [
    mk('w1', '2026-09-07', ['coffee, Sick', undefined, 'Pre-workout']),
    mk('w2', '2026-09-14', ['Pre-workout, Coffee', 'Thursday.', undefined]),
  ];
  assert.deepEqual(noteSuggestions(weeks), ['Thursday.', 'Pre-workout', 'Coffee', 'Sick'], 'newest day first; one entry per spelling, the latest spelling wins');
  assert.deepEqual(noteSuggestions(weeks, 2), ['Thursday.', 'Pre-workout']);
  assert.deepEqual(noteSuggestions([]), []);
});

test('a set cell stored without v (emptied, or coloured while empty) reads and types as empty — never "undefined"', () => {
  assert.equal(toTypedCell({} as SetCell), '');
  assert.equal(toTypedCell({ c: 'green' } as SetCell), '');
  assert.equal(toTypedCell({ fn: [1] } as SetCell), '.');
  assert.equal(formatSet({} as SetCell), '');
  let w = newWeek({ id: 'w', dayIds: ['d1'], now: 0, settings: { ...DEFAULT_SETTINGS, defaultDays: ['Thu'] } });
  w = addExercise(w, { id: 'chest', name: 'Chest Press', weight: '24kg', sets: 3 });
  // a colour on an empty cell used to clean `v` away; the stored cell keeps v: ''
  w = updateSet(w, 'd1', 'chest', 2, { c: 'green' });
  assert.deepEqual(w.days[0]?.cells['chest']?.sets[2], { v: '', c: 'green' });
  // and however the cell got stored, getSet always hands back a string
  const stored: Week = { ...w, days: [{ ...w.days[0]!, cells: { chest: { sets: [{ v: '12' }, {} as SetCell, { c: 'green' } as SetCell] } } }] };
  assert.equal(getSet(stored, 'd1', 'chest', 1).v, '');
  assert.equal(getSet(stored, 'd1', 'chest', 2).v, '');
  assert.equal(getSet(stored, 'd1', 'chest', 2).c, 'green');
  assert.equal(toTypedCell(getSet(stored, 'd1', 'chest', 2)), '');
  // typing into such a cell works
  const typed = typeSet(stored, 'd1', 'chest', 2, '10!');
  assert.deepEqual(typed.days[0]?.cells['chest']?.sets[2], { v: '10!', c: 'green' });
});

test('rest per exercise / per set, prep and work fall back to the tool settings; new weeks carry them', () => {
  const s = { ...DEFAULT_SETTINGS.session, restSec: 90, prepSec: 10, workSec: 60 };
  const plain: Exercise = { id: 'a', name: 'Rows', weight: '', sets: 3 };
  assert.equal(restForSet(plain, 0, s), 90);
  assert.equal(restForSet({ ...plain, restSec: 120 }, 2, s), 120);
  assert.equal(restForSet({ ...plain, restSec: 120, restPerSet: [60, undefined, 180] }, 0, s), 60);
  assert.equal(restForSet({ ...plain, restSec: 120, restPerSet: [60, undefined, 180] }, 1, s), 120, 'a hole falls back to the exercise rest');
  assert.equal(restForSet({ ...plain, restPerSet: [60] }, 2, s), 90, 'beyond the list: the tool default');
  assert.equal(prepForExercise(plain, s), 10);
  assert.equal(prepForExercise({ ...plain, prepSec: 0 }, s), 0, 'zero prep is a choice, not a fallback');
  assert.equal(workForExercise({ ...plain }, s), 60);
  assert.equal(workForExercise({ ...plain, timedSec: 90 }, s), 90);
  // copied into the next week; colour and marks are not
  let w = newWeek({ id: 'w1', dayIds: ['d1'], now: 0, settings: { ...DEFAULT_SETTINGS, defaultDays: ['Mon'] } });
  w = addExercise(w, { id: 'hs', name: 'Handstand', weight: '', sets: 3, timedSec: 90, prepSec: 5, restSec: 100, restPerSet: [100, 110, 120], note: 'to the wall', c: 'purple', marks: '!' });
  const next = newWeek({ id: 'w2', dayIds: ['d2'], now: 0, settings: DEFAULT_SETTINGS, previous: w });
  assert.deepEqual(next.exercises[0], { id: 'hs', name: 'Handstand', sets: 3, timedSec: 90, prepSec: 5, restSec: 100, restPerSet: [100, 110, 120], note: 'to the wall' });
  // fewer sets: the per-set rests of the sets that are gone go too
  const fewer = updateExercise(w, 'hs', { sets: 2 });
  assert.deepEqual(fewer.exercises[0]?.restPerSet, [100, 110]);
  assert.equal(mergeSettings({}).session.prepSec, 10, 'stored settings without prepSec get the default');
});

test('completing a workout: the button, the last set, and the catch after a long pause', () => {
  let w = newWeek({ id: 'w', dayIds: ['d1'], now: 0, settings: { ...DEFAULT_SETTINGS, defaultDays: ['Thu'] } });
  w = addExercise(w, { id: 'a', name: 'Rows', weight: '', sets: 2 });
  w = addExercise(w, { id: 'b', name: 'Curls', weight: '', sets: 1 });
  const t0 = 1_000_000;
  assert.equal(dayComplete(w, w.days[0]!), false);
  w = typeSet(w, 'd1', 'a', 0, '10');
  w = touchSession(w, 'd1', t0);
  w = typeSet(w, 'd1', 'a', 1, '9');
  w = touchSession(w, 'd1', t0 + 120_000, 90);
  assert.equal(dayComplete(w, w.days[0]!), false, 'curls still open');
  w = typeSet(w, 'd1', 'b', 0, '12');
  w = touchSession(w, 'd1', t0 + 240_000, 90);
  assert.equal(dayComplete(w, w.days[0]!), true, 'every set typed → the prompt');
  assert.equal(completeSession(w, 'nope').days[0]?.session?.done, undefined, 'unknown day: nothing');
  // the button, five minutes after the last set: ends now
  const byButton = completeSession(w, 'd1', t0 + 540_000);
  assert.deepEqual(byButton.days[0]?.session, { start: t0, end: t0 + 540_000, restSec: 180, done: true });
  assert.equal(sessionMinutes(byButton.days[0]!), 9);
  // the button an hour after the last set: the hour was not training → ends at the last activity too
  assert.equal(completeSession(w, 'd1', t0 + 240_000 + 60 * 60_000).days[0]?.session?.end, t0 + 240_000);
  // caught later: ends at the last activity
  const caught = completeSession(w, 'd1');
  assert.deepEqual(caught.days[0]?.session, { start: t0, end: t0 + 240_000, restSec: 180, done: true });
  assert.equal(sessionMinutes(caught.days[0]!), 4);
  // the catch: open for half an hour → listed; completed or fresh → not
  assert.equal(staleSessions([w], t0 + 240_000 + SESSION_IDLE_MS - 1).length, 0);
  assert.equal(staleSessions([w], t0 + 240_000 + SESSION_IDLE_MS).length, 1);
  assert.equal(staleSessions([caught], t0 + 10 * SESSION_IDLE_MS).length, 0);
  // a set typed after "complete" reopens the workout
  const reopened = touchSession(byButton, 'd1', t0 + 600_000);
  assert.equal(reopened.days[0]?.session?.done, undefined);
  assert.equal(reopened.days[0]?.session?.end, t0 + 600_000);
  // a day without a session cannot be completed (nothing was timed)
  const plain = newWeek({ id: 'p', dayIds: ['x'], now: 0, settings: DEFAULT_SETTINGS });
  assert.equal(completeSession(plain, 'x').days[0]?.session, undefined);
  assert.equal(dayComplete(plain, plain.days[0]!), false, 'no exercises: never "complete"');
});
