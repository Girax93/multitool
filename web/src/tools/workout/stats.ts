// Workout statistics — pure helpers over the weeks (no DOM). The stats page
// (stats-view.ts) draws these; the numbers here are testable on their own.
//
// Everything is laid out over *calendar* weeks, not over the week entries:
// a week Ari skipped is a slot with nothing in it, so gaps stay visible in
// every chart ("empty weeks should still be noticeable").

import { MUSCLE_GROUPS, libraryIndex, loadPerRep, roleWeight, type LibraryExercise, type MuscleGroup } from './library.js';
import { addDays, fromIsoDate, mondayOf, sessionMinutes, weekNumbers, type DayEntry, type Exercise, type Week } from './model.js';

// ---- Set notation --------------------------------------------------------------

/** Cells that say the set was not done. */
const NOT_DONE = /^(?:-+|x|✗|✕|skip(?:ped)?|n\/a|na)$/i;

export interface ParsedSet {
  /** Reps done, when the cell holds a number ("12!" → 12, "6+4" → 10, "9,3" → 9). */
  reps?: number;
  /** A weight given in the cell ("12(20)" → 20). */
  weight?: number;
  /** Anything at all was logged (also "Ok", "-", "✗"). */
  logged: boolean;
}

/**
 * Read a set cell the way it was typed. Marks (!, *, ~, ?, ⭐) are ignored;
 * "a+b" adds up (6 reps, a pause, 4 more); "a,b" keeps the first number
 * (pure reps before assisted ones, falls for handstands); "(n)" is the
 * weight used that set. Words ("Ok", "Good") are logged but have no reps.
 */
export function parseSetValue(v: string | undefined): ParsedSet {
  const raw = (v ?? '').trim();
  if (!raw || NOT_DONE.test(raw)) return { logged: false };
  let s = raw.replace(/[!*~?⭐🥈✓]/g, ' ');
  let weight: number | undefined;
  s = s.replace(/\(\s*(\d+(?:[.,]\d+)?)\s*(?:kg|lb)?\s*\)/i, (_m, n: string) => {
    weight = parseFloat(n.replace(',', '.'));
    return ' ';
  });
  const plus = /^\s*(\d+(?:\.\d+)?)(?:\s*\+\s*(\d+(?:\.\d+)?))+\s*$/.exec(s);
  let reps: number | undefined;
  if (plus) {
    reps = s
      .split('+')
      .map((x) => parseFloat(x))
      .filter((x) => !Number.isNaN(x))
      .reduce((a, b) => a + b, 0);
  } else {
    const first = /(\d+(?:\.\d+)?)/.exec(s);
    if (first && first[1]) reps = parseFloat(first[1]);
  }
  return { logged: true, ...(reps !== undefined ? { reps } : {}), ...(weight !== undefined ? { weight } : {}) };
}

/** "24kg" → 24, "26kg → 18kg" → 18 (what it became), "14kg pure,assisted" → 14, "" → undefined. */
export function parseWeight(text: string | undefined): number | undefined {
  const t = (text ?? '').trim();
  if (!t) return undefined;
  const kg = [...t.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:kg|lb)\b/gi)];
  const last = kg[kg.length - 1]?.[1];
  if (last) return parseFloat(last.replace(',', '.'));
  const any = /(\d+(?:[.,]\d+)?)/.exec(t);
  return any && any[1] ? parseFloat(any[1].replace(',', '.')) : undefined;
}

// ---- Days ---------------------------------------------------------------------------

export interface WeightPoint {
  date: string;
  kg: number;
}

export type ActivityKind = 'tracked' | 'other' | 'off';

/** One calendar day of the log. */
export interface DayActivity {
  date: string;
  kind: ActivityKind;
  /** Sets with something logged (tracked days). */
  sets: number;
  /** What was done instead (other days). */
  alt?: string;
  /** Marked as a day off (red) in the log. */
  marked: boolean;
  bodyweight?: number;
  /** Workout length in minutes, when it was logged through workout mode. */
  minutes?: number;
  restMinutes?: number;
  weekId: string;
  weekLabel: string;
  dayId: string;
}

/** How many set cells of the day hold something (both tracked and other-workout days). */
export function setsLogged(day: DayEntry): number {
  let n = 0;
  for (const ed of Object.values(day.cells)) for (const s of ed.sets) if (parseSetValue(s.v).logged) n++;
  return n;
}

/**
 * Every dated day of the log, keyed by date. Two rows on the same date (rare:
 * a hand-added extra row) merge into one, keeping the trained one.
 */
export function dayActivities(weeks: Week[]): Map<string, DayActivity> {
  const out = new Map<string, DayActivity>();
  for (const w of weeks) {
    for (const d of w.days) {
      if (!d.date) continue;
      const sets = setsLogged(d);
      const kind: ActivityKind = d.alt?.trim() ? 'other' : sets > 0 ? 'tracked' : 'off';
      const a: DayActivity = {
        date: d.date,
        kind,
        sets: kind === 'tracked' ? sets : 0,
        marked: d.c === 'red',
        weekId: w.id,
        weekLabel: w.label,
        dayId: d.id,
      };
      if (kind === 'other') a.alt = d.alt?.trim();
      if (d.bodyweight !== undefined) a.bodyweight = d.bodyweight;
      const min = sessionMinutes(d);
      if (min !== undefined) {
        a.minutes = min;
        a.restMinutes = Math.round((d.session?.restSec ?? 0) / 60);
      }
      const prev = out.get(d.date);
      if (!prev || (prev.kind === 'off' && kind !== 'off')) out.set(d.date, a);
    }
  }
  return out;
}

// ---- Ranges ---------------------------------------------------------------------------

export interface StatsRange {
  /** Monday of the first calendar week shown. */
  from: string;
  /** Monday of the last calendar week shown (this week). */
  to: string;
}

/** "Last N weeks" ending in the week of `today`, or everything since the first dated week. */
export function statsRange(weeks: Week[], mode: 'last' | 'all', n: number, today: string): StatsRange {
  const to = mondayOf(fromIsoDate(today));
  if (mode === 'last') return { from: addDays(to, -7 * (Math.max(1, n) - 1)), to };
  const first = weeks.map((w) => w.startDate).filter((s): s is string => !!s).sort()[0];
  return { from: first && first < to ? first : to, to };
}

/** One calendar week in a range: its Monday, Ari's number for it and the entries that cover it. */
export interface WeekSlot {
  start: string;
  /** Week number: the entry's own, or counted on by calendar distance from the nearest numbered one. */
  n: number;
  weeks: Week[];
}

export function weekSlots(weeks: Week[], range: StatsRange): WeekSlot[] {
  const numbers = weekNumbers(weeks);
  const dated = weeks.filter((w) => w.startDate);
  const slots: WeekSlot[] = [];
  for (let start = range.from; start <= range.to; start = addDays(start, 7)) {
    const own = dated.filter((w) => w.startDate === start);
    let n: number;
    const first = own[0];
    if (first && numbers.has(first.id)) n = numbers.get(first.id) ?? 0;
    else {
      // count on from the nearest dated entry
      let best: { w: Week; dist: number } | undefined;
      for (const w of dated) {
        const dist = Math.abs(fromIsoDate(w.startDate ?? start).getTime() - fromIsoDate(start).getTime());
        if (!best || dist < best.dist) best = { w, dist };
      }
      n = best ? (numbers.get(best.w.id) ?? 0) + Math.round((fromIsoDate(start).getTime() - fromIsoDate(best.w.startDate ?? start).getTime()) / (7 * 86_400_000)) : 0;
    }
    slots.push({ start, n, weeks: own });
  }
  return slots;
}

// ---- Weekly numbers -------------------------------------------------------------------

export interface WeekActivity extends WeekSlot {
  tracked: number;
  other: number;
  /** Days in the entry marked off / left empty. */
  off: number;
  /** No entry at all for this calendar week. */
  empty: boolean;
  sets: number;
  minutes?: number;
}

export function weeklyActivity(weeks: Week[], range: StatsRange): WeekActivity[] {
  const days = dayActivities(weeks);
  return weekSlots(weeks, range).map((slot) => {
    let tracked = 0;
    let other = 0;
    let off = 0;
    let sets = 0;
    let minutes: number | undefined;
    for (let i = 0; i < 7; i++) {
      const a = days.get(addDays(slot.start, i));
      if (!a) continue;
      if (a.kind === 'tracked') tracked++;
      else if (a.kind === 'other') other++;
      else off++;
      sets += a.sets;
      if (a.minutes !== undefined) minutes = (minutes ?? 0) + a.minutes;
    }
    const out: WeekActivity = { ...slot, tracked, other, off, empty: slot.weeks.length === 0, sets };
    if (minutes !== undefined) out.minutes = minutes;
    return out;
  });
}

// ---- Exercises -----------------------------------------------------------------------

export interface ExerciseInfo {
  id: string;
  name: string;
  /** Weeks (entries) the exercise appears in, newest first is not needed: count only. */
  weeks: number;
  /** Start date of the latest week it appears in. */
  last: string;
  timed: boolean;
}

/**
 * The exercises of the log, most recently used first, then by how many weeks
 * they ran. With a library, renamed variants of one exercise ("Chest Press",
 * "+1 step Chest Press") fold into its entry under the library name; the
 * week's own name still shows in the chart tooltip.
 */
export function exerciseCatalogue(weeks: Week[], library: LibraryExercise[] = []): ExerciseInfo[] {
  const index = libraryIndex(allExercises(weeks), library);
  const map = new Map<string, ExerciseInfo>();
  for (const w of weeks) {
    for (const ex of w.exercises) {
      const entry = index.get(ex.id);
      const key = entry?.id ?? ex.id;
      const cur = map.get(key);
      const last = w.startDate ?? '';
      if (cur) {
        cur.weeks++;
        if (last > cur.last) {
          cur.last = last;
          if (!entry) cur.name = ex.name; // unmatched: the latest spelling
        }
        cur.timed ||= !!ex.timedSec;
      } else map.set(key, { id: key, name: entry?.name ?? ex.name, weeks: 1, last, timed: !!ex.timedSec || !!entry?.timedSec });
    }
  }
  return [...map.values()].sort((a, b) => (a.last === b.last ? b.weeks - a.weeks : a.last < b.last ? 1 : -1));
}

function allExercises(weeks: Week[]): Exercise[] {
  return weeks.flatMap((w) => w.exercises);
}

/** Bodyweight known on a date: that day's, else the latest logged before it. */
export function bodyweightOn(weights: WeightPoint[], date: string): number | undefined {
  let best: WeightPoint | undefined;
  for (const p of weights) {
    if (p.date > date) break;
    best = p;
  }
  return best?.kg;
}

/** Every bodyweight in the log, by date (for carrying forward). */
export function allBodyweights(weeks: Week[]): WeightPoint[] {
  const out: WeightPoint[] = [];
  for (const w of weeks) for (const d of w.days) if (d.date && d.bodyweight !== undefined) out.push({ date: d.date, kg: d.bodyweight });
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

export type ExerciseMetric = 'best' | 'total' | 'volume' | 'weight' | 'sets';

export const EXERCISE_METRICS: { id: ExerciseMetric; label: string; unit: string }[] = [
  { id: 'best', label: 'Best set', unit: 'reps' },
  { id: 'total', label: 'Total reps', unit: 'reps' },
  { id: 'volume', label: 'Volume', unit: 'reps × kg' },
  { id: 'weight', label: 'Weight', unit: 'kg' },
  { id: 'sets', label: 'Sets done', unit: 'sets' },
];

/** One calendar week of one exercise. */
export interface ExerciseWeek extends WeekSlot {
  /** The exercise was on the plan that week. */
  planned: boolean;
  /** Sets with anything logged. */
  sets: number;
  best?: number;
  total?: number;
  volume?: number;
  weight?: number;
  /** Exercise as it was named that week (the name may drift: "Chest Press" → "+1 step Chest Press"). */
  name?: string;
}

/**
 * Per-week numbers for one exercise (by id), over the range. A week where the
 * exercise was planned but nothing logged keeps `planned` with no values, so
 * the chart shows the gap; a calendar week without an entry is neither.
 */
export function exerciseProgress(weeks: Week[], key: string, range: StatsRange, library: LibraryExercise[] = []): ExerciseWeek[] {
  const index = libraryIndex(allExercises(weeks), library);
  const weights = allBodyweights(weeks);
  return weekSlots(weeks, range).map((slot) => {
    const out: ExerciseWeek = { ...slot, planned: false, sets: 0 };
    let best: number | undefined;
    let total: number | undefined;
    let volume: number | undefined;
    let weight: number | undefined;
    for (const w of slot.weeks) {
      const ex = w.exercises.find((e) => e.id === key || index.get(e.id)?.id === key);
      if (!ex) continue;
      const entry = index.get(ex.id);
      out.planned = true;
      out.name = ex.name;
      const planWeight = parseWeight(ex.weight);
      if (planWeight !== undefined) weight = planWeight;
      for (const d of w.days) {
        if (d.alt?.trim()) continue;
        const bw = d.bodyweight ?? (d.date ? bodyweightOn(weights, d.date) : undefined);
        for (const s of d.cells[ex.id]?.sets ?? []) {
          const p = parseSetValue(s.v);
          if (!p.logged) continue;
          out.sets++;
          if (p.reps === undefined) continue;
          best = Math.max(best ?? 0, p.reps);
          total = (total ?? 0) + p.reps;
          const kg = loadPerRep(entry, planWeight, bw, p.weight);
          if (kg !== undefined) volume = (volume ?? 0) + Math.round(p.reps * kg);
        }
      }
    }
    if (best !== undefined) out.best = best;
    if (total !== undefined) out.total = total;
    if (volume !== undefined) out.volume = Math.round(volume);
    if (weight !== undefined) out.weight = weight;
    return out;
  });
}

export function metricValue(w: ExerciseWeek, metric: ExerciseMetric): number | undefined {
  switch (metric) {
    case 'best':
      return w.best;
    case 'total':
      return w.total;
    case 'volume':
      return w.volume;
    case 'weight':
      return w.weight;
    case 'sets':
      return w.sets || undefined;
  }
}

// ---- Muscle groups and volume ---------------------------------------------------------

/** One logged set with what it moved and which muscles it hit. */
interface SetRecord {
  date: string;
  monday: string;
  exKey: string;
  exName: string;
  reps?: number;
  /** kg moved in the set (reps × load per rep), when known. */
  load?: number;
  muscles: { group: MuscleGroup; weight: number }[];
}

/** Every logged set in the range, with muscle groups and load from the library. */
export function setRecords(weeks: Week[], range: StatsRange, library: LibraryExercise[]): SetRecord[] {
  const index = libraryIndex(allExercises(weeks), library);
  const weights = allBodyweights(weeks);
  const end = addDays(range.to, 7);
  const out: SetRecord[] = [];
  for (const w of weeks) {
    if (!w.startDate || w.startDate < range.from || w.startDate >= end) continue;
    for (const d of w.days) {
      if (d.alt?.trim()) continue;
      const date = d.date ?? w.startDate;
      const bw = d.bodyweight ?? bodyweightOn(weights, date);
      for (const ex of w.exercises) {
        const entry = index.get(ex.id);
        const planWeight = parseWeight(ex.weight);
        for (const s of d.cells[ex.id]?.sets ?? []) {
          const p = parseSetValue(s.v);
          if (!p.logged) continue;
          const perRep = loadPerRep(entry, planWeight, bw, p.weight);
          const rec: SetRecord = {
            date,
            monday: w.startDate,
            exKey: entry?.id ?? ex.id,
            exName: entry?.name ?? ex.name,
            muscles: (entry?.muscles ?? []).map((m) => ({ group: m.group, weight: roleWeight(m.role) })),
          };
          if (p.reps !== undefined) rec.reps = p.reps;
          if (p.reps !== undefined && perRep !== undefined) rec.load = Math.round(p.reps * perRep);
          out.push(rec);
        }
      }
    }
  }
  return out;
}

export type MuscleTotals = Record<MuscleGroup, number>;

function zeroTotals(): MuscleTotals {
  const out = {} as MuscleTotals;
  for (const m of MUSCLE_GROUPS) out[m.id] = 0;
  return out;
}

export interface MuscleWeek extends WeekSlot {
  /** Sets per group (a prime mover counts the set fully, a helper half). */
  sets: MuscleTotals;
  /** kg moved per group, same weighting. */
  load: MuscleTotals;
}

/** Sets and load per muscle group per calendar week. */
export function muscleWeekly(weeks: Week[], range: StatsRange, library: LibraryExercise[]): MuscleWeek[] {
  const records = setRecords(weeks, range, library);
  const byMonday = new Map<string, SetRecord[]>();
  for (const r of records) byMonday.set(r.monday, [...(byMonday.get(r.monday) ?? []), r]);
  return weekSlots(weeks, range).map((slot) => {
    const sets = zeroTotals();
    const load = zeroTotals();
    for (const r of byMonday.get(slot.start) ?? []) {
      for (const m of r.muscles) {
        sets[m.group] += m.weight;
        if (r.load !== undefined) load[m.group] += m.weight * r.load;
      }
    }
    for (const m of MUSCLE_GROUPS) {
      sets[m.id] = Math.round(sets[m.id] * 10) / 10;
      load[m.id] = Math.round(load[m.id]);
    }
    return { ...slot, sets, load };
  });
}

export interface MuscleShare {
  group: MuscleGroup;
  sets: number;
  load: number;
}

/** Sets and load per muscle group over the whole range, biggest first (groups with nothing are left out). */
export function muscleTotals(weekly: MuscleWeek[]): MuscleShare[] {
  const out: MuscleShare[] = MUSCLE_GROUPS.map((m) => ({ group: m.id, sets: 0, load: 0 }));
  for (const w of weekly) {
    for (const m of out) {
      m.sets += w.sets[m.group];
      m.load += w.load[m.group];
    }
  }
  return out
    .map((m) => ({ ...m, sets: Math.round(m.sets * 10) / 10 }))
    .filter((m) => m.sets > 0)
    .sort((a, b) => b.sets - a.sets || b.load - a.load);
}

export interface ExerciseShare {
  key: string;
  name: string;
  sets: number;
  reps: number;
  load: number;
}

/** Sets, reps and load per exercise over the range, most sets first. */
export function exerciseTotals(weeks: Week[], range: StatsRange, library: LibraryExercise[]): ExerciseShare[] {
  const map = new Map<string, ExerciseShare>();
  for (const r of setRecords(weeks, range, library)) {
    const cur = map.get(r.exKey) ?? { key: r.exKey, name: r.exName, sets: 0, reps: 0, load: 0 };
    cur.sets++;
    cur.reps += r.reps ?? 0;
    cur.load += r.load ?? 0;
    map.set(r.exKey, cur);
  }
  return [...map.values()].sort((a, b) => b.sets - a.sets);
}

export interface VolumeWeek extends WeekSlot {
  sets: number;
  reps: number;
  /** kg moved (sets whose load is known). */
  load: number;
  empty: boolean;
}

/** Sets, reps and kg moved per calendar week. */
export function volumeWeekly(weeks: Week[], range: StatsRange, library: LibraryExercise[]): VolumeWeek[] {
  const records = setRecords(weeks, range, library);
  return weekSlots(weeks, range).map((slot) => {
    const mine = records.filter((r) => r.monday === slot.start);
    return {
      ...slot,
      sets: mine.length,
      reps: mine.reduce((n, r) => n + (r.reps ?? 0), 0),
      load: mine.reduce((n, r) => n + (r.load ?? 0), 0),
      empty: slot.weeks.length === 0,
    };
  });
}

// ---- Heatmap / calendar --------------------------------------------------------------

/** GitHub-style level for a tracked day: 1–4 by sets done relative to the busiest day in view. */
export function heatLevel(sets: number, maxSets: number): 1 | 2 | 3 | 4 {
  if (maxSets <= 0 || sets <= 0) return 1;
  const q = sets / maxSets;
  return q > 0.75 ? 4 : q > 0.5 ? 3 : q > 0.25 ? 2 : 1;
}

export interface CalendarDay {
  date: string;
  /** Day of month. */
  d: number;
  inMonth: boolean;
  activity?: DayActivity;
}

/** The six-row Monday-first grid of a month (weeks × 7). Rows carry their Monday so week numbers can be shown. */
export function calendarMonth(year: number, month0: number, days: Map<string, DayActivity>): { rows: { start: string; days: CalendarDay[] }[]; label: string } {
  const first = new Date(year, month0, 1);
  const start = mondayOf(first);
  const rows: { start: string; days: CalendarDay[] }[] = [];
  let cursor = start;
  for (let r = 0; r < 6; r++) {
    const row = { start: cursor, days: [] as CalendarDay[] };
    for (let i = 0; i < 7; i++) {
      const date = addDays(cursor, i);
      const dt = fromIsoDate(date);
      const cd: CalendarDay = { date, d: dt.getDate(), inMonth: dt.getMonth() === month0 };
      const a = days.get(date);
      if (a) cd.activity = a;
      row.days.push(cd);
    }
    rows.push(row);
    cursor = addDays(cursor, 7);
    if (fromIsoDate(cursor).getMonth() !== month0 && r >= 3) break;
  }
  return { rows, label: first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) };
}

// ---- Bodyweight -----------------------------------------------------------------------

/** Every bodyweight logged in the range, by date. */
export function bodyweightSeries(weeks: Week[], range: StatsRange): WeightPoint[] {
  const end = addDays(range.to, 7);
  const out: WeightPoint[] = [];
  for (const a of dayActivities(weeks).values()) {
    if (a.bodyweight === undefined || a.date < range.from || a.date >= end) continue;
    out.push({ date: a.date, kg: a.bodyweight });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Days in the range with a timed workout. */
export function durationSeries(weeks: Week[], range: StatsRange): DayActivity[] {
  const end = addDays(range.to, 7);
  return [...dayActivities(weeks).values()].filter((a) => a.minutes !== undefined && a.date >= range.from && a.date < end).sort((a, b) => (a.date < b.date ? -1 : 1));
}

// ---- Headline numbers -----------------------------------------------------------------

export interface Summary {
  weeks: number;
  emptyWeeks: number;
  trained: number;
  other: number;
  sets: number;
  /** Trained-or-other days per calendar week in the range. */
  perWeek: number;
  /** Bodyweight change over the range (last − first), when two or more weigh-ins. */
  weightDelta?: number;
  avgMinutes?: number;
}

export function summarize(weekly: WeekActivity[], weights: WeightPoint[], durations: DayActivity[]): Summary {
  const trained = weekly.reduce((n, w) => n + w.tracked, 0);
  const other = weekly.reduce((n, w) => n + w.other, 0);
  const out: Summary = {
    weeks: weekly.length,
    emptyWeeks: weekly.filter((w) => w.empty || w.tracked + w.other === 0).length,
    trained,
    other,
    sets: weekly.reduce((n, w) => n + w.sets, 0),
    perWeek: weekly.length ? Math.round(((trained + other) / weekly.length) * 10) / 10 : 0,
  };
  const first = weights[0];
  const last = weights[weights.length - 1];
  if (first && last && weights.length > 1) out.weightDelta = Math.round((last.kg - first.kg) * 10) / 10;
  if (durations.length) out.avgMinutes = Math.round(durations.reduce((n, d) => n + (d.minutes ?? 0), 0) / durations.length);
  return out;
}
