// Workout log — pure data model and helpers (no DOM, no storage).
//
// One Week = a block like Ari's spreadsheet: exercises across (with their
// weight), training days down, N set cells per exercise per day, numbered
// footnotes per exercise, a notes column, optional bodyweight per day, and
// Excel-style colour / star / mark annotations that can sit on any cell, on an
// exercise-for-a-day, or on a whole day. All updates are immutable.

import { DEFAULT_LIBRARY, mergeLibrary, type LibraryExercise } from './library.js';

export type Weekday = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
export const WEEKDAYS: Weekday[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export interface LegendEntry {
  id: string;
  label: string;
  /** CSS colour. */
  color: string;
}

export interface MarkDef {
  symbol: string;
  meaning: string;
}

/** Workout mode: what happens after a set is typed (see session.ts). */
export interface SessionSettings {
  /** Rest between sets, seconds. */
  restSec: number;
  /** What "+30 s" / "−30 s" add or take, seconds. */
  stepSec: number;
  /** Default work time per set of a timed exercise (handstands), seconds. */
  workSec: number;
  /** After the rest of the exercise before a timed one, offer to start it. */
  offerTimed: boolean;
}

export interface WorkoutSettings {
  trackBodyweight: boolean;
  unit: 'kg' | 'lb';
  defaultDays: Weekday[];
  defaultSets: number;
  legend: LegendEntry[];
  marks: MarkDef[];
  session: SessionSettings;
  /** Exercise library (muscle groups, load per rep); built-ins merged in by id. */
  library: LibraryExercise[];
  /** Built-in library ids the user deleted (so merging does not bring them back). */
  libraryRemoved: string[];
}

/** Colour / star annotation. `c` is a legend id. */
export interface CellStyle {
  c?: string;
  star?: boolean;
}

export interface SetCell extends CellStyle {
  /** Free text: "12", "6+4", "12!" — whatever the user typed. Stored objects are `clean`ed, so an emptied cell may lack it. */
  v: string;
  /** Footnote numbers referenced by this set. */
  fn?: number[];
}

export interface ExerciseDay extends CellStyle {
  sets: SetCell[];
}

export interface Exercise extends CellStyle {
  id: string;
  name: string;
  /** Free text, e.g. "24kg". */
  weight: string;
  sets: number;
  /**
   * A timed exercise (handstand holds): each set is `timedSec` seconds of
   * work, which workout mode counts down before the rest. Absent = reps.
   */
  timedSec?: number;
  /** Library entry this exercise is (muscle groups, load); matched by name when absent. */
  lib?: string;
}

export interface DayEntry extends CellStyle {
  id: string;
  weekday: Weekday;
  /** ISO date (YYYY-MM-DD) when known. */
  date?: string;
  bodyweight?: number;
  /** Free-text marks for the whole day, e.g. "*" (bad sleep). */
  marks?: string;
  notes?: string;
  notesStyle?: CellStyle;
  /**
   * Worked out, but not with the tracked exercises (a YouTube session, a
   * run…): the name of what was done. The grid shows it as one cell across
   * the exercise columns; the day's sets are kept but hidden.
   */
  alt?: string;
  /** Keyed by exercise id. */
  cells: Record<string, ExerciseDay>;
  /** How long the workout took, when it was logged through workout mode. */
  session?: DaySession;
}

/**
 * The span of a workout logged in workout mode: from the first set typed to
 * the last set or countdown, plus how much of it was rest (every rest
 * countdown as it actually ran, +30 s / −30 s and early Off included).
 */
export interface DaySession {
  /** Epoch ms of the first activity. */
  start: number;
  /** Epoch ms of the latest activity. */
  end: number;
  /** Seconds spent in rest countdowns. */
  restSec: number;
}

/** Activity more than this long after the last one starts a new session (a second workout that day). */
export const SESSION_GAP_MS = 3 * 60 * 60 * 1000;

export interface Footnote {
  /**
   * Positive: a numbered note, referenced from sets as ¹ ².
   * Negative: a plain note about the exercise this week, shown without a number
   * (the key is still unique per exercise so it can be edited and removed).
   */
  n: number;
  text: string;
}

export interface Week {
  id: string;
  label: string;
  startDate?: string;
  createdAt: number;
  exercises: Exercise[];
  days: DayEntry[];
  /** Keyed by exercise id. Numbers are stable; gaps are fine. */
  footnotes: Record<string, Footnote[]>;
  /** Free text about the whole week (plans, discoveries). */
  notes?: string;
}

export const DEFAULT_LEGEND: LegendEntry[] = [
  { id: 'star', label: 'REALLY good!', color: 'star' },
  { id: 'green', label: 'Easy and smooth', color: '#4f8a2f' },
  { id: 'brown', label: 'Bad life choices (alcohol, no sleep etc.)', color: '#9a4a1e' },
  { id: 'purple', label: 'Weight increased', color: '#6b4f9a' },
  { id: 'gold', label: 'Usual shoulder pain still there', color: '#b8860b' },
  { id: 'red', label: 'Did not do (e.g. pain)', color: '#c0392b' },
];

export const DEFAULT_MARKS: MarkDef[] = [
  { symbol: '*', meaning: 'Bad sleep' },
  { symbol: '**', meaning: 'Sick' },
  { symbol: '***', meaning: 'Pain' },
  { symbol: '!', meaning: 'Felt very hard' },
  { symbol: '!!', meaning: 'Felt extremely hard' },
  { symbol: '(x)', meaning: 'Different weight' },
];

export const DEFAULT_SESSION: SessionSettings = { restSec: 90, stepSec: 30, workSec: 90, offerTimed: true };

export const DEFAULT_SETTINGS: WorkoutSettings = {
  trackBodyweight: true,
  unit: 'kg',
  defaultDays: ['Mon', 'Wed', 'Fri'],
  defaultSets: 3,
  legend: DEFAULT_LEGEND,
  marks: DEFAULT_MARKS,
  session: DEFAULT_SESSION,
  library: DEFAULT_LIBRARY,
  libraryRemoved: [],
};

/** Stored settings may predate a field (or hold a partial `session`): fill in the defaults. */
export function mergeSettings(stored: Partial<WorkoutSettings> | null | undefined): WorkoutSettings {
  const s = stored ?? {};
  const removed = s.libraryRemoved ?? [];
  return { ...DEFAULT_SETTINGS, ...s, session: { ...DEFAULT_SESSION, ...(s.session ?? {}) }, library: mergeLibrary(s.library, removed), libraryRemoved: removed };
}

// ---- Dates -----------------------------------------------------------------

const pad = (n: number): string => String(n).padStart(2, '0');

export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromIsoDate(s: string): Date {
  const [y, m, d] = s.split('-').map((x) => parseInt(x, 10));
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function addDays(iso: string, days: number): string {
  const d = fromIsoDate(iso);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

/** ISO date of the Monday of the week containing `d`. */
export function mondayOf(d: Date): string {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (copy.getDay() + 6) % 7; // Mon=0 … Sun=6
  copy.setDate(copy.getDate() - dow);
  return toIsoDate(copy);
}

/** ISO-8601 week number of a date. */
export function isoWeek(iso: string): { year: number; week: number } {
  const d = fromIsoDate(iso);
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return { year: t.getUTCFullYear(), week };
}

export function weekdayOffset(day: Weekday): number {
  return WEEKDAYS.indexOf(day);
}

export function weekdayOfDate(iso: string): Weekday {
  return WEEKDAYS[(fromIsoDate(iso).getDay() + 6) % 7] ?? 'Mon';
}

// ---- Construction --------------------------------------------------------------

export function emptySets(n: number): SetCell[] {
  return Array.from({ length: Math.max(1, n) }, () => ({ v: '' }));
}

export function newDay(id: string, weekday: Weekday, startDate: string | undefined, exercises: Exercise[]): DayEntry {
  const cells: Record<string, ExerciseDay> = {};
  for (const ex of exercises) cells[ex.id] = { sets: emptySets(ex.sets) };
  const day: DayEntry = { id, weekday, cells };
  if (startDate) day.date = addDays(startDate, weekdayOffset(weekday));
  return day;
}

export interface NewWeekInput {
  id: string;
  dayIds: string[];
  now: number;
  settings: WorkoutSettings;
  /** Exercises are copied from here (same ids, so progress can be followed). */
  previous?: Week;
  /** Monday of the new week; defaults to the week after `previous` or the current week. */
  startDate?: string;
  label?: string;
}

export function newWeek(input: NewWeekInput): Week {
  const { settings, previous } = input;
  let startDate = input.startDate;
  if (!startDate) {
    if (previous?.startDate) startDate = addDays(previous.startDate, 7);
    else startDate = mondayOf(new Date(input.now));
  }
  const exercises: Exercise[] = previous
    ? previous.exercises.map((e) => clean({ id: e.id, name: e.name, weight: e.weight, sets: e.sets, timedSec: e.timedSec, lib: e.lib }))
    : [];
  const days = settings.defaultDays.map((wd, i) => newDay(input.dayIds[i] ?? `${input.id}-${wd}`, wd, startDate, exercises));
  return {
    id: input.id,
    label: input.label ?? nextWeekLabel(previous?.label, startDate),
    startDate,
    createdAt: input.now,
    exercises,
    days,
    footnotes: {},
  };
}

export function defaultWeekLabel(startDate: string | undefined): string {
  if (!startDate) return 'Week';
  return `Week ${isoWeek(startDate).week}`;
}

/** "Week 12" → "Week 13" (Ari counts weeks since he started); otherwise the ISO week. */
export function nextWeekLabel(previousLabel: string | undefined, startDate: string | undefined): string {
  const m = previousLabel ? /^(.*?)(\d+)\s*$/.exec(previousLabel.trim()) : null;
  if (m && m[2]) return `${m[1] ?? ''}${parseInt(m[2], 10) + 1}`;
  return defaultWeekLabel(startDate);
}

/**
 * The label for a week added after `weeks`. Ari numbers weeks since he
 * started, every calendar week counting whether he trained or not, so the
 * number is the highest existing one plus the calendar weeks between that
 * week and `startDate` ("Week 86" on 21 Sep → "Week 88" for 5 Oct); without
 * dates it is simply one more. Undefined when no label is numbered (newWeek
 * then picks its default).
 */
export function nextWeekLabelFrom(weeks: Week[], startDate?: string): string | undefined {
  let best: { prefix: string; n: number; start?: string } | null = null;
  for (const w of weeks) {
    const m = /^(.*?)(\d+)\s*$/.exec(w.label.trim());
    if (m && m[2]) {
      const n = parseInt(m[2], 10);
      if (!best || n > best.n) best = { prefix: m[1] ?? '', n, start: w.startDate };
    }
  }
  if (!best) return undefined;
  let step = 1;
  if (startDate && best.start) {
    const days = (fromIsoDate(startDate).getTime() - fromIsoDate(best.start).getTime()) / 86_400_000;
    step = Math.max(1, Math.round(days / 7));
  }
  return `${best.prefix}${best.n + step}`;
}

/** True when anything was logged: a set, another workout, notes, marks, bodyweight, a note in the notes row or a week note. */
export function weekHasContent(week: Week): boolean {
  if (week.notes?.trim()) return true;
  if (Object.values(week.footnotes).some((list) => list.some((f) => f.text.trim() !== ''))) return true;
  return week.days.some(
    (d) => dayTrained(d) || !!d.notes?.trim() || !!d.marks?.trim() || d.bodyweight !== undefined || !!d.c || !!d.star,
  );
}

/**
 * Weeks that only duplicate one of `keep` (same label, not in `keep`, nothing
 * logged) — e.g. a "Week 38" started by hand on two devices before the real
 * Week 38 was imported.
 */
export function emptyDuplicateWeeks(weeks: Week[], keep: Week[]): Week[] {
  const keepIds = new Set(keep.map((w) => w.id));
  const labels = new Set(keep.map((w) => w.label.trim().toLowerCase()));
  return weeks.filter((w) => !keepIds.has(w.id) && labels.has(w.label.trim().toLowerCase()) && !weekHasContent(w));
}

/** Weeks sorted oldest → newest. */
export function sortWeeks(weeks: Week[]): Week[] {
  return [...weeks].sort((a, b) => {
    const ka = a.startDate ?? '';
    const kb = b.startDate ?? '';
    if (ka !== kb) return ka < kb ? -1 : 1;
    return a.createdAt - b.createdAt;
  });
}

// ---- Cell access -----------------------------------------------------------

export function getExerciseDay(week: Week, dayId: string, exId: string): ExerciseDay | undefined {
  return week.days.find((d) => d.id === dayId)?.cells[exId];
}

export function getSet(week: Week, dayId: string, exId: string, index: number): SetCell {
  return getExerciseDay(week, dayId, exId)?.sets[index] ?? { v: '' };
}

function withDay(week: Week, dayId: string, fn: (d: DayEntry) => DayEntry): Week {
  return { ...week, days: week.days.map((d) => (d.id === dayId ? fn(d) : d)) };
}

function withExerciseDay(week: Week, dayId: string, exId: string, fn: (ed: ExerciseDay) => ExerciseDay): Week {
  const ex = week.exercises.find((e) => e.id === exId);
  return withDay(week, dayId, (d) => {
    const current = d.cells[exId] ?? { sets: emptySets(ex?.sets ?? 3) };
    return { ...d, cells: { ...d.cells, [exId]: fn(current) } };
  });
}

export function updateSet(week: Week, dayId: string, exId: string, index: number, patch: Partial<SetCell>): Week {
  return withExerciseDay(week, dayId, exId, (ed) => {
    const sets = [...ed.sets];
    while (sets.length <= index) sets.push({ v: '' });
    const cur = sets[index] ?? { v: '' };
    sets[index] = clean({ ...cur, ...patch });
    return { ...ed, sets };
  });
}

export function updateExerciseDayStyle(week: Week, dayId: string, exId: string, style: CellStyle): Week {
  return withExerciseDay(week, dayId, exId, (ed) => clean({ ...ed, ...style }));
}

export function updateDay(week: Week, dayId: string, patch: Partial<Omit<DayEntry, 'id' | 'cells'>>): Week {
  return withDay(week, dayId, (d) => clean({ ...d, ...patch }));
}

/** Drop undefined / empty-array / false style keys so stored objects stay tidy. */
export function clean<T extends object>(obj: T): T {
  const out = { ...obj } as Record<string, unknown>;
  for (const k of Object.keys(out)) {
    const v = out[k];
    if (v === undefined || v === null || v === '' || v === false || (Array.isArray(v) && v.length === 0)) delete out[k];
  }
  return out as T;
}

// ---- Exercises -------------------------------------------------------------

export function addExercise(week: Week, ex: Exercise): Week {
  const exercises = [...week.exercises, ex];
  const days = week.days.map((d) => ({ ...d, cells: { ...d.cells, [ex.id]: { sets: emptySets(ex.sets) } } }));
  return { ...week, exercises, days };
}

export function updateExercise(week: Week, exId: string, patch: Partial<Omit<Exercise, 'id'>>): Week {
  const exercises = week.exercises.map((e) => (e.id === exId ? clean({ ...e, ...patch }) : e));
  let days = week.days;
  if (patch.sets !== undefined) {
    const n = Math.max(1, patch.sets);
    days = days.map((d) => {
      const ed = d.cells[exId];
      if (!ed) return d;
      const sets = ed.sets.slice(0, n);
      while (sets.length < n) sets.push({ v: '' });
      return { ...d, cells: { ...d.cells, [exId]: { ...ed, sets } } };
    });
  }
  return { ...week, exercises, days };
}

export function removeExercise(week: Week, exId: string): Week {
  const days = week.days.map((d) => {
    const { [exId]: _gone, ...cells } = d.cells;
    return { ...d, cells };
  });
  const { [exId]: _fn, ...footnotes } = week.footnotes;
  return { ...week, exercises: week.exercises.filter((e) => e.id !== exId), days, footnotes };
}

export function moveExercise(week: Week, exId: string, direction: -1 | 1): Week {
  const i = week.exercises.findIndex((e) => e.id === exId);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= week.exercises.length) return week;
  const exercises = [...week.exercises];
  const a = exercises[i];
  const b = exercises[j];
  if (!a || !b) return week;
  exercises[i] = b;
  exercises[j] = a;
  return { ...week, exercises };
}

// ---- Days ------------------------------------------------------------------

/** Days in weekday order (stable, so two entries on the same weekday keep their order). */
export function sortDays(days: DayEntry[]): DayEntry[] {
  return [...days].sort((x, y) => weekdayOffset(x.weekday) - weekdayOffset(y.weekday));
}

export function addDay(week: Week, id: string, weekday: Weekday): Week {
  const day = newDay(id, weekday, week.startDate, week.exercises);
  return { ...week, days: sortDays([...week.days, day]) };
}

export function removeDay(week: Week, dayId: string): Week {
  return { ...week, days: week.days.filter((d) => d.id !== dayId) };
}

/** Legend id of the "did not do" colour, which marks days and weeks off. */
export const NO_WORKOUT_COLOR = 'red';

/**
 * "Delete" for a day that has (or is) happening: everything logged on it goes,
 * but the row stays and is marked red, so the week still shows the day off and
 * the calendar / graphs count it (Ari tracks the days he did not train, too).
 */
export function clearDay(week: Week, dayId: string, mark = true): Week {
  return withDay(week, dayId, (d) => {
    const cells: Record<string, ExerciseDay> = {};
    for (const ex of week.exercises) cells[ex.id] = { sets: emptySets(ex.sets) };
    const next: DayEntry = { id: d.id, weekday: d.weekday, cells };
    if (d.date) next.date = d.date;
    if (mark) next.c = NO_WORKOUT_COLOR;
    return next;
  });
}

/**
 * "Delete" for a week that has begun: it becomes a no-workout week — every day
 * cleared and marked red (days after `today` are only cleared), notes gone.
 * Label, dates and the exercise list stay, so the number keeps its place and
 * the next week can still copy the exercises.
 */
export function clearWeek(week: Week, today?: string): Week {
  let w: Week = clean({ ...week, footnotes: {}, notes: undefined });
  for (const d of week.days) w = clearDay(w, d.id, !today || !d.date || d.date <= today);
  return w;
}

/** A day that has happened (or is today) — deleting it clears it instead of removing the row. */
export function dayHasHappened(day: DayEntry, today: string): boolean {
  return !day.date || day.date <= today;
}

/** A week that has begun — deleting it clears it instead of removing it. */
export function weekHasBegun(week: Week, today: string): boolean {
  return !week.startDate || week.startDate <= today;
}

/**
 * The number of every week, for tabs and graphs: "Week 12" → 12; a week whose
 * label carries no number (an old "No workout" gap) takes its number from the
 * nearest numbered week by calendar distance (the week after Week 80 is 81),
 * and only without any dates does it fall back to its 1-based position.
 */
export function weekNumbers(weeks: Week[]): Map<string, number> {
  const out = new Map<string, number>();
  const numbered: { n: number; start: string; idx: number }[] = [];
  weeks.forEach((w, idx) => {
    const m = /(\d+)\s*$/.exec(w.label.trim());
    if (m && m[1]) {
      const n = parseInt(m[1], 10);
      out.set(w.id, n);
      if (w.startDate) numbered.push({ n, start: w.startDate, idx });
    }
  });
  weeks.forEach((w, idx) => {
    if (out.has(w.id)) return;
    let n = idx + 1;
    if (w.startDate && numbered.length) {
      const ref = numbered.reduce((a, b) => (Math.abs(b.idx - idx) < Math.abs(a.idx - idx) ? b : a));
      n = ref.n + Math.round((fromIsoDate(w.startDate).getTime() - fromIsoDate(ref.start).getTime()) / (7 * 86_400_000));
    }
    out.set(w.id, n);
  });
  return out;
}

/**
 * "71–80": a page tab names the weeks by their position in the log (1-based),
 * so the tabs always run on without gaps or overlaps — labels can be
 * inconsistent (Ari's older import numbers "Week 79" and "Week 80" six
 * calendar weeks apart, with unnumbered "No workout" weeks between them) and
 * still every calendar week is one entry, so the position is the week number.
 */
export function pageTabLabel(start: number, count: number): string {
  const lo = start + 1;
  const hi = start + count;
  return lo === hi ? String(lo) : `${lo}–${hi}`;
}

/**
 * Move a training day to another weekday (trained Tuesday instead of Monday).
 * The date follows from the week's start date; the row keeps its sets and notes.
 */
export function setDayWeekday(week: Week, dayId: string, weekday: Weekday): Week {
  const day = week.days.find((d) => d.id === dayId);
  if (!day) return week;
  const patch: Partial<DayEntry> = { weekday };
  if (week.startDate) patch.date = addDays(week.startDate, weekdayOffset(weekday));
  else if (day.date) patch.date = addDays(day.date, weekdayOffset(weekday) - weekdayOffset(day.weekday));
  const next = updateDay(week, dayId, patch);
  return { ...next, days: sortDays(next.days) };
}

/**
 * Note activity on a day's workout: the first activity opens the session,
 * every later one moves its end and adds the rest just taken. A gap longer
 * than SESSION_GAP_MS starts a fresh session (the earlier one is dropped: the
 * day holds one workout).
 */
export function touchSession(week: Week, dayId: string, now: number, restSec = 0): Week {
  return withDay(week, dayId, (d) => {
    const cur = d.session;
    const session: DaySession =
      cur && now - cur.end <= SESSION_GAP_MS && now >= cur.start
        ? { start: cur.start, end: Math.max(cur.end, now), restSec: Math.round(cur.restSec + restSec) }
        : { start: now, end: now, restSec: Math.round(restSec) };
    return { ...d, session };
  });
}

/** Minutes a logged workout took (undefined when it was not timed). */
export function sessionMinutes(day: DayEntry): number | undefined {
  return day.session ? Math.round((day.session.end - day.session.start) / 60_000) : undefined;
}

/** Set a day's date; the weekday follows (an empty date only clears the date). */
export function setDayDate(week: Week, dayId: string, date: string | undefined): Week {
  if (!date) return updateDay(week, dayId, { date: undefined });
  const next = updateDay(week, dayId, { date, weekday: weekdayOfDate(date) });
  return { ...next, days: sortDays(next.days) };
}

// ---- Footnotes -------------------------------------------------------------

export function footnotesFor(week: Week, exId: string): Footnote[] {
  return week.footnotes[exId] ?? [];
}

export function isNumbered(f: Footnote): boolean {
  return f.n > 0;
}

/** Only the numbered notes (the ones sets can reference), ascending. */
export function numberedFootnotes(week: Week, exId: string): Footnote[] {
  return footnotesFor(week, exId)
    .filter(isNumbered)
    .sort((a, b) => a.n - b.n);
}

/** Display order for the notes row: numbered notes first (1, 2, …), then plain notes in the order they were added. */
export function displayFootnotes(week: Week, exId: string): Footnote[] {
  const all = footnotesFor(week, exId);
  return [...all.filter(isNumbered).sort((a, b) => a.n - b.n), ...all.filter((f) => !isNumbered(f)).sort((a, b) => b.n - a.n)];
}

export function nextFootnoteNumber(week: Week, exId: string): number {
  return footnotesFor(week, exId).reduce((m, f) => Math.max(m, f.n), 0) + 1;
}

/** Make sure numbered note `n` exists for the exercise (created empty when a set refers to it before it was written). */
export function ensureFootnote(week: Week, exId: string, n: number): Week {
  if (n <= 0 || footnotesFor(week, exId).some((f) => f.n === n)) return week;
  return { ...week, footnotes: { ...week.footnotes, [exId]: [...footnotesFor(week, exId), { n, text: '' }] } };
}

/**
 * What a set cell looks like when typed: the value with its note references
 * as dot runs, the way the original sheet did it ("12!" + notes 1 and 2 →
 * "12! . .."), so `parseLegacyCell` reads it back unchanged.
 */
export function toTypedCell(cell: SetCell): string {
  const runs = (cell.fn ?? []).map((n) => '.'.repeat(n));
  if (runs.length === 0) return cell.v;
  if (runs.length === 1) return cell.v + runs[0];
  return `${cell.v} ${runs.join(' ')}`.trim();
}

/**
 * Apply what was typed straight into a set cell: reps, marks (`!`, `*`, `(x)` …)
 * and dot runs for note references. Notes referred to for the first time are
 * created empty so they can be written in the notes row. Colour and star stay.
 */
export function typeSet(week: Week, dayId: string, exId: string, index: number, text: string): Week {
  const parsed = parseLegacyCell(text);
  const prev = getSet(week, dayId, exId, index);
  let w = updateSet(week, dayId, exId, index, { v: parsed.v, fn: parsed.fn ?? [], star: parsed.star || prev.star });
  for (const n of parsed.fn ?? []) w = ensureFootnote(w, exId, n);
  return w;
}

/**
 * Add a note for an exercise this week. Numbered notes get the next free
 * number (numbers are never reused); plain notes get the next free negative
 * key and are shown without a number.
 */
export function addFootnote(week: Week, exId: string, text: string, numbered = true): { week: Week; n: number } {
  const n = numbered ? nextFootnoteNumber(week, exId) : footnotesFor(week, exId).reduce((m, f) => Math.min(m, f.n), 0) - 1;
  const list = [...footnotesFor(week, exId), { n, text }];
  return { week: { ...week, footnotes: { ...week.footnotes, [exId]: list } }, n };
}

export function updateFootnote(week: Week, exId: string, n: number, text: string): Week {
  const list = footnotesFor(week, exId).map((f) => (f.n === n ? { n, text } : f));
  return { ...week, footnotes: { ...week.footnotes, [exId]: list } };
}

/** Remove a footnote and every reference to it. */
export function removeFootnote(week: Week, exId: string, n: number): Week {
  const list = footnotesFor(week, exId).filter((f) => f.n !== n);
  const days = week.days.map((d) => {
    const ed = d.cells[exId];
    if (!ed) return d;
    const sets = ed.sets.map((s) => (s.fn?.includes(n) ? clean({ ...s, fn: s.fn.filter((x) => x !== n) }) : s));
    return { ...d, cells: { ...d.cells, [exId]: { ...ed, sets } } };
  });
  return { ...week, footnotes: { ...week.footnotes, [exId]: list }, days };
}

/** Returns the cell with `fn` explicitly set (possibly []), so it works as an updateSet patch. */
export function toggleRef(cell: SetCell, n: number): SetCell {
  const fn = cell.fn ?? [];
  const next = fn.includes(n) ? fn.filter((x) => x !== n) : [...fn, n].sort((a, b) => a - b);
  return { ...cell, fn: next };
}

// ---- Display helpers -------------------------------------------------------

const SUP = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];

export function superscript(n: number): string {
  return String(n)
    .split('')
    .map((ch) => SUP[parseInt(ch, 10)] ?? ch)
    .join('');
}

/** Plain-text rendering of a set cell, e.g. "6+4¹" or "12¹²". */
export function formatSet(cell: SetCell): string {
  return (cell.v ?? '') + (cell.fn ?? []).map(superscript).join('');
}

/**
 * Parse the old spreadsheet notation: every run of dots is a footnote
 * reference whose number is the run length ("16.." → "16" + note 2,
 * "12.***" → "12***" + note 1, "12.. …" → "12" + notes 2 and 3). An ellipsis
 * character counts as three dots; a dot between two digits is a decimal point
 * and is left alone. A ⭐ sets the star flag. Everything else is kept as typed.
 */
export function parseLegacyCell(text: string): SetCell {
  let s = text.replace(/…/g, '...').trim();
  const star = s.includes('⭐');
  if (star) s = s.replace(/⭐/g, '');
  const refs: number[] = [];
  s = s.replace(/(?<!\d)\.+(?!\d)|(?<=\d)\.+(?!\d)|(?<!\d)\.+(?=\d)/g, (run) => {
    refs.push(run.length);
    return '';
  });
  const v = s.replace(/\s+/g, ' ').trim();
  const fn = [...new Set(refs)].sort((a, b) => a - b);
  return { v, ...clean({ fn, star }) };
}

/** A day counts as trained when a set was logged or another workout was done instead. */
export function dayTrained(d: DayEntry): boolean {
  return !!d.alt?.trim() || Object.values(d.cells).some((ed) => ed.sets.some((s) => (s.v ?? '').trim() !== ''));
}

export function weekSummary(week: Week): string {
  const filled = week.days.filter(dayTrained).length;
  return `${filled}/${week.days.length} days · ${week.exercises.length} exercises`;
}

export function legendColor(settings: WorkoutSettings, id: string | undefined): string | undefined {
  if (!id) return undefined;
  const e = settings.legend.find((l) => l.id === id);
  return e && e.color !== 'star' ? e.color : undefined;
}

// ---- Import / export -------------------------------------------------------

export interface WorkoutExport {
  format: 'multitool-workout';
  version: 1;
  exportedAt: string;
  weeks: Week[];
  settings?: WorkoutSettings;
  /** Ids of weeks the file retires (a renumbered import replacing earlier ids). */
  remove?: string[];
}

export function exportWeeks(weeks: Week[], settings?: WorkoutSettings): WorkoutExport {
  return { format: 'multitool-workout', version: 1, exportedAt: new Date().toISOString(), weeks, settings };
}

export function parseWorkoutExport(data: unknown): WorkoutExport {
  if (typeof data !== 'object' || data === null) throw new Error('Not a JSON object');
  const d = data as Partial<WorkoutExport>;
  if (d.format !== 'multitool-workout') throw new Error('Not a MultiTool workout file');
  if (!Array.isArray(d.weeks)) throw new Error('No weeks in file');
  for (const w of d.weeks) {
    if (typeof w.id !== 'string' || !Array.isArray(w.exercises) || !Array.isArray(w.days)) throw new Error(`Malformed week ${String(w.id)}`);
    w.footnotes ??= {};
    w.label ??= defaultWeekLabel(w.startDate);
    w.createdAt ??= Date.now();
  }
  const remove = Array.isArray(d.remove) ? d.remove.filter((id): id is string => typeof id === 'string') : undefined;
  return { format: 'multitool-workout', version: 1, exportedAt: d.exportedAt ?? '', weeks: d.weeks, settings: d.settings, ...(remove?.length ? { remove } : {}) };
}

// ---- Links in free text ------------------------------------------------------

export type TextPart = { text: string } | { label: string; url: string };

const LINK_RE = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"']+)/g;

/**
 * Split note text into plain runs and links: `[label](https://…)` or a bare
 * `https://…` URL. Trailing punctuation after a bare URL stays text.
 */
export function splitLinks(text: string): TextPart[] {
  const out: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(LINK_RE)) {
    const start = m.index ?? 0;
    let raw = m[0];
    let label = m[1];
    let url = m[2] ?? m[3] ?? '';
    if (!label) {
      // bare URL: drop closing punctuation that is almost never part of it
      const trimmed = url.replace(/[.,;:!?)\]]+$/, '');
      raw = raw.slice(0, raw.length - (url.length - trimmed.length));
      url = trimmed;
      label = url.replace(/^https?:\/\//, '');
      if (label.length > 48) label = `${label.slice(0, 45)}…`;
    }
    if (start > last) out.push({ text: text.slice(last, start) });
    out.push({ label, url });
    last = start + raw.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

export function hasLink(text: string | undefined): boolean {
  return !!text && splitLinks(text).some((p) => 'url' in p);
}

// ---- Workout mode helpers ---------------------------------------------------------

/** The week whose seven days contain `date` (ISO), if any. */
export function weekForDate(weeks: Week[], date: string): Week | undefined {
  return weeks.find((w) => w.startDate && w.startDate <= date && date < addDays(w.startDate, 7));
}

/** The day of a week that falls on `date`, else the first day that has nothing logged yet, else the first day. */
export function sessionDay(week: Week, date: string): DayEntry | undefined {
  return week.days.find((d) => d.date === date) ?? week.days.find((d) => !dayTrained(d)) ?? week.days[0];
}

/** Sets of an exercise on a day that still hold nothing. */
export function emptySetIndexes(day: DayEntry, ex: Exercise): number[] {
  const sets = day.cells[ex.id]?.sets ?? [];
  const out: number[] = [];
  for (let i = 0; i < ex.sets; i++) if (!(sets[i]?.v ?? '').trim()) out.push(i);
  return out;
}

/**
 * The timed exercise that comes right after `exId` in the week's order and has
 * no set logged on `day` yet — the one workout mode offers to start when the
 * previous exercise's rest is turned off.
 */
export function nextTimedExercise(week: Week, day: DayEntry, exId: string): Exercise | undefined {
  const i = week.exercises.findIndex((e) => e.id === exId);
  const next = week.exercises[i + 1];
  if (!next || !next.timedSec) return undefined;
  return emptySetIndexes(day, next).length === next.sets ? next : undefined;
}

/** True when every set of the exercise on that day holds something. */
export function exerciseDone(day: DayEntry, ex: Exercise): boolean {
  return emptySetIndexes(day, ex).length === 0;
}

/** "1:30" for 90 seconds, "0:45", "2:00". */
export function formatSeconds(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "1:30" / "90" / "1m30s" → seconds, or null. */
export function parseSeconds(text: string): number | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  const mmss = /^(\d+):(\d{1,2})$/.exec(t);
  if (mmss) return parseInt(mmss[1] ?? '0', 10) * 60 + parseInt(mmss[2] ?? '0', 10);
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  const m = /^(?:(\d+)\s*m)?\s*(?:(\d+)\s*s?)?$/.exec(t);
  if (m && (m[1] || m[2])) return parseInt(m[1] ?? '0', 10) * 60 + parseInt(m[2] ?? '0', 10);
  return null;
}
