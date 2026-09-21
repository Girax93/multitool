// Workout log — pure data model and helpers (no DOM, no storage).
//
// One Week = a block like Ari's spreadsheet: exercises across (with their
// weight), training days down, N set cells per exercise per day, numbered
// footnotes per exercise, a notes column, optional bodyweight per day, and
// Excel-style colour / star / mark annotations that can sit on any cell, on an
// exercise-for-a-day, or on a whole day. All updates are immutable.

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

export interface WorkoutSettings {
  trackBodyweight: boolean;
  unit: 'kg' | 'lb';
  defaultDays: Weekday[];
  defaultSets: number;
  legend: LegendEntry[];
  marks: MarkDef[];
}

/** Colour / star annotation. `c` is a legend id. */
export interface CellStyle {
  c?: string;
  star?: boolean;
}

export interface SetCell extends CellStyle {
  /** Free text: "12", "6+4", "12!" — whatever the user typed. */
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
  /** Keyed by exercise id. */
  cells: Record<string, ExerciseDay>;
}

export interface Footnote {
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

export const DEFAULT_SETTINGS: WorkoutSettings = {
  trackBodyweight: true,
  unit: 'kg',
  defaultDays: ['Mon', 'Wed', 'Fri'],
  defaultSets: 3,
  legend: DEFAULT_LEGEND,
  marks: DEFAULT_MARKS,
};

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
    ? previous.exercises.map((e) => ({ id: e.id, name: e.name, weight: e.weight, sets: e.sets }))
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

export function addDay(week: Week, id: string, weekday: Weekday): Week {
  const day = newDay(id, weekday, week.startDate, week.exercises);
  const days = [...week.days, day].sort((x, y) => weekdayOffset(x.weekday) - weekdayOffset(y.weekday));
  return { ...week, days };
}

export function removeDay(week: Week, dayId: string): Week {
  return { ...week, days: week.days.filter((d) => d.id !== dayId) };
}

// ---- Footnotes -------------------------------------------------------------

export function footnotesFor(week: Week, exId: string): Footnote[] {
  return week.footnotes[exId] ?? [];
}

export function nextFootnoteNumber(week: Week, exId: string): number {
  return footnotesFor(week, exId).reduce((m, f) => Math.max(m, f.n), 0) + 1;
}

export function addFootnote(week: Week, exId: string, text: string): { week: Week; n: number } {
  const n = nextFootnoteNumber(week, exId);
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
  return clean({ v, fn, star });
}

export function weekSummary(week: Week): string {
  const filled = week.days.filter((d) => Object.values(d.cells).some((ed) => ed.sets.some((s) => s.v.trim() !== ''))).length;
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
  return { format: 'multitool-workout', version: 1, exportedAt: d.exportedAt ?? '', weeks: d.weeks, settings: d.settings };
}
