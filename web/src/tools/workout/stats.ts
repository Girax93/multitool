// Workout statistics — pure helpers over the weeks (no DOM). The stats page
// (stats-view.ts) draws these; the numbers here are testable on their own.
//
// Everything is laid out over *calendar* weeks, not over the week entries:
// a week Ari skipped is a slot with nothing in it, so gaps stay visible in
// every chart ("empty weeks should still be noticeable").

import { addDays, fromIsoDate, mondayOf, sessionMinutes, weekNumbers, type DayEntry, type Week } from './model.js';

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

/** The exercises of the log, most recently used first, then by how many weeks they ran. */
export function exerciseCatalogue(weeks: Week[]): ExerciseInfo[] {
  const map = new Map<string, ExerciseInfo>();
  for (const w of weeks) {
    for (const ex of w.exercises) {
      const cur = map.get(ex.id);
      const last = w.startDate ?? '';
      if (cur) {
        cur.weeks++;
        if (last > cur.last) {
          cur.last = last;
          cur.name = ex.name;
        }
        cur.timed ||= !!ex.timedSec;
      } else map.set(ex.id, { id: ex.id, name: ex.name, weeks: 1, last, timed: !!ex.timedSec });
    }
  }
  return [...map.values()].sort((a, b) => (a.last === b.last ? b.weeks - a.weeks : a.last < b.last ? 1 : -1));
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
export function exerciseProgress(weeks: Week[], exId: string, range: StatsRange): ExerciseWeek[] {
  return weekSlots(weeks, range).map((slot) => {
    const out: ExerciseWeek = { ...slot, planned: false, sets: 0 };
    let best: number | undefined;
    let total: number | undefined;
    let volume: number | undefined;
    let weight: number | undefined;
    for (const w of slot.weeks) {
      const ex = w.exercises.find((e) => e.id === exId);
      if (!ex) continue;
      out.planned = true;
      out.name = ex.name;
      const planWeight = parseWeight(ex.weight);
      if (planWeight !== undefined) weight = planWeight;
      for (const d of w.days) {
        if (d.alt?.trim()) continue;
        for (const s of d.cells[exId]?.sets ?? []) {
          const p = parseSetValue(s.v);
          if (!p.logged) continue;
          out.sets++;
          if (p.reps === undefined) continue;
          best = Math.max(best ?? 0, p.reps);
          total = (total ?? 0) + p.reps;
          const kg = p.weight ?? planWeight;
          if (kg !== undefined) volume = (volume ?? 0) + p.reps * kg;
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

export interface WeightPoint {
  date: string;
  kg: number;
}

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
