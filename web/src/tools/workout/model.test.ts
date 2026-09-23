import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS,
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
  weekForDate,
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
  assert.deepEqual(getSet(w, 'd1', 'squat', 0), { c: 'green' }); // an empty value is not stored (clean)
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
