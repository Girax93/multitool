// Workout service: persistence and mutations. Each week is stored under its
// own key so the log can grow for years without rewriting one big blob.

import { uid } from '../../core/dom.js';
import type { ToolContext } from '../../core/registry.js';
import { Emitter, signal, type Signal } from '../../core/store.js';
import {
  DEFAULT_SETTINGS,
  addDays,
  clearWeek,
  emptyDuplicateWeeks,
  mergeSettings,
  mondayOf,
  newWeek,
  nextWeekLabelFrom,
  previousExercise,
  sortWeeks,
  toIsoDate,
  weekHasContent,
  type Exercise,
  type Week,
  type WorkoutSettings,
} from './model.js';
import { matchLibrary, slug, withDefaultWeight, type LibraryExercise, type LoadRule } from './library.js';

const WEEK_PREFIX = 'weeks/';
const SETTINGS_KEY = 'settings';
const CURRENT_KEY = 'ui/currentWeek';
const VIEW_KEY = 'ui/view';
const STATS_KEY = 'ui/stats';

/** How many weeks the log shows at once. Per device (a phone wants one, a PC wants more). */
export interface ViewPref {
  mode: 'one' | 'some' | 'all';
  /** Weeks per page in `some` mode. */
  per: number;
}
export const DEFAULT_VIEW: ViewPref = { mode: 'one', per: 3 };

/** A stretch of calendar weeks: the last N, or everything since the first entry. */
export interface RangeSpec {
  mode: 'last' | 'all';
  weeks: number;
}

/** What the stats page reads from, per device like the view: a default range and per-card overrides plus each card's choices. */
export interface StatsPref extends RangeSpec {
  /** Per-card ranges (card id → range); cards without one follow the default. */
  ranges?: Record<string, RangeSpec>;
  /** Exercise (library id) shown in the progression chart. */
  exercise?: string;
  metric?: string;
  /** Muscle-group chart: metric and the groups drawn. */
  muscleMetric?: 'sets' | 'load';
  muscleGroups?: string[];
  volumeMetric?: 'sets' | 'reps' | 'load';
  shareMetric?: 'sets' | 'load';
}
export const DEFAULT_STATS: StatsPref = { mode: 'last', weeks: 13 };

/** A set cell was typed into (workout mode listens to start the rest timer). */
export interface SetTyped {
  weekId: string;
  dayId: string;
  exId: string;
  index: number;
  text: string;
}

export class WorkoutService {
  readonly weeks: Signal<Week[]> = signal<Week[]>([]);
  readonly settings: Signal<WorkoutSettings> = signal<WorkoutSettings>(DEFAULT_SETTINGS);
  readonly currentWeekId: Signal<string | null> = signal<string | null>(null);
  readonly view: Signal<ViewPref> = signal<ViewPref>(DEFAULT_VIEW);
  readonly stats: Signal<StatsPref> = signal<StatsPref>(DEFAULT_STATS);
  readonly status: Signal<string | null> = signal<string | null>(null);
  readonly setTyped = new Emitter<SetTyped>();

  constructor(private readonly ctx: ToolContext) {}

  async init(): Promise<void> {
    const [entries, settings, current, view, stats] = await Promise.all([
      this.ctx.kv.list<Week>(WEEK_PREFIX),
      this.ctx.kv.get<Partial<WorkoutSettings>>(SETTINGS_KEY),
      this.ctx.kv.get<string>(CURRENT_KEY),
      this.ctx.kv.get<Partial<ViewPref>>(VIEW_KEY),
      this.ctx.kv.get<Partial<StatsPref>>(STATS_KEY),
    ]);
    if (settings) this.settings.set(mergeSettings(settings));
    if (view) this.view.set({ ...DEFAULT_VIEW, ...view });
    if (stats) this.stats.set({ ...DEFAULT_STATS, ...stats });
    const weeks = sortWeeks(entries.map((e) => e.value));
    this.weeks.set(weeks);
    // Always open on the newest week (Ari: "take me to the most recent week");
    // the stored selection only survives within a session.
    void current;
    this.currentWeekId.set(weeks[weeks.length - 1]?.id ?? null);
    this.updateStatus();
    this.ctx.kv.watch('', (keys) => void this.applyRemote(keys));
  }

  /** Weeks or settings changed by another device: reload just those keys. */
  private async applyRemote(keys: string[]): Promise<void> {
    let list = this.weeks.get();
    let touched = false;
    for (const key of keys) {
      if (key === SETTINGS_KEY) {
        const s = await this.ctx.kv.get<Partial<WorkoutSettings>>(SETTINGS_KEY);
        this.settings.set(mergeSettings(s));
      } else if (key.startsWith(WEEK_PREFIX)) {
        const id = key.slice(WEEK_PREFIX.length);
        const week = await this.ctx.kv.get<Week>(key);
        list = week ? [...list.filter((w) => w.id !== id), week] : list.filter((w) => w.id !== id);
        touched = true;
      }
    }
    if (!touched) return;
    const weeks = sortWeeks(list);
    this.weeks.set(weeks);
    const current = this.currentWeekId.get();
    if (!current || !weeks.some((w) => w.id === current)) this.currentWeekId.set(weeks[weeks.length - 1]?.id ?? null);
    this.updateStatus();
  }

  get(id: string): Week | undefined {
    return this.weeks.get().find((w) => w.id === id);
  }

  current(): Week | undefined {
    const id = this.currentWeekId.get();
    return id ? this.get(id) : undefined;
  }

  select(id: string): void {
    this.currentWeekId.set(id);
    void this.ctx.kv.set(CURRENT_KEY, id);
  }

  setView(patch: Partial<ViewPref>): void {
    const next = { ...this.view.get(), ...patch };
    next.per = Math.min(20, Math.max(2, Math.round(next.per) || DEFAULT_VIEW.per));
    this.view.set(next);
    void this.ctx.kv.set(VIEW_KEY, next);
  }

  setStats(patch: Partial<StatsPref>): void {
    const next = { ...this.stats.get(), ...patch };
    next.weeks = Math.min(520, Math.max(1, Math.round(next.weeks) || DEFAULT_STATS.weeks));
    this.stats.set(next);
    void this.ctx.kv.set(STATS_KEY, next);
  }

  /** The range one stats card reads from: its own, else the page default. */
  statsRangeFor(card: string): RangeSpec {
    const p = this.stats.get();
    return p.ranges?.[card] ?? { mode: p.mode, weeks: p.weeks };
  }

  /** Give one card its own range (undefined → back to the page default). */
  setCardRange(card: string, range: RangeSpec | undefined): void {
    const ranges = { ...(this.stats.get().ranges ?? {}) };
    if (range) ranges[card] = { mode: range.mode, weeks: Math.min(520, Math.max(1, Math.round(range.weeks) || 1)) };
    else delete ranges[card];
    this.setStats({ ranges });
  }

  /** Apply an immutable update to one week and persist it. */
  update(id: string, fn: (w: Week) => Week): Week | undefined {
    const before = this.get(id);
    if (!before) return undefined;
    const after = fn(before);
    if (after === before) return before;
    this.weeks.set(sortWeeks(this.weeks.get().map((w) => (w.id === id ? after : w))));
    void this.ctx.kv.set(WEEK_PREFIX + id, after);
    this.updateStatus();
    return after;
  }

  /**
   * Start a new week after the latest one (exercises copied). Without a
   * start date it is the week after the latest one, or the current calendar
   * week when that is later; the label counts calendar weeks since the
   * highest numbered one. Calendar weeks skipped in between are added as
   * no-workout weeks (red days), because every calendar week is one entry
   * with its number (Ari) — so the log's positions stay the week numbers.
   */
  createWeek(opts: { startDate?: string; label?: string; copyFrom?: Week } = {}): Week {
    let list = this.weeks.get();
    let previous = opts.copyFrom ?? list[list.length - 1];
    const settings = this.settings.get();
    const thisMonday = mondayOf(new Date());
    let startDate = opts.startDate;
    const filled: Week[] = [];
    if (!startDate) {
      let after = previous?.startDate ? addDays(previous.startDate, 7) : thisMonday;
      while (after < thisMonday) {
        const gap = clearWeek(this.build(list, settings, previous, after), toIsoDate(new Date()));
        list = sortWeeks([...list, gap]);
        void this.ctx.kv.set(WEEK_PREFIX + gap.id, gap);
        filled.push(gap);
        previous = gap;
        after = addDays(after, 7);
      }
      startDate = after;
    }
    const week = this.build(list, settings, previous, startDate, opts.label);
    this.weeks.set(sortWeeks([...list, week]));
    void this.ctx.kv.set(WEEK_PREFIX + week.id, week);
    this.select(week.id);
    this.updateStatus();
    if (filled.length) {
      const first = filled[0]?.label ?? '';
      const last = filled[filled.length - 1]?.label ?? '';
      this.ctx.toast(filled.length === 1 ? `${first} added as a no-workout week` : `${first} – ${last} added as no-workout weeks`, { durationMs: 6000 });
    }
    return week;
  }

  private build(list: Week[], settings: WorkoutSettings, previous: Week | undefined, startDate: string, label?: string): Week {
    return newWeek({
      id: uid('wk'),
      dayIds: settings.defaultDays.map(() => uid('d')),
      now: Date.now(),
      settings,
      previous,
      startDate,
      label: label ?? nextWeekLabelFrom(list, startDate),
    });
  }

  async deleteWeek(id: string): Promise<void> {
    const remaining = this.weeks.get().filter((w) => w.id !== id);
    this.weeks.set(remaining);
    await this.ctx.kv.delete(WEEK_PREFIX + id);
    if (this.currentWeekId.get() === id) this.select(remaining[remaining.length - 1]?.id ?? '');
    this.updateStatus();
  }

  async updateSettings(patch: Partial<WorkoutSettings>): Promise<void> {
    const next = mergeSettings({ ...this.settings.get(), ...patch });
    this.settings.set(next);
    await this.ctx.kv.set(SETTINGS_KEY, next);
  }

  /** The weight an exercise had the last time it was on the plan before this week (undefined: never before). */
  previousWeight(weekId: string, ex: Pick<Exercise, 'id' | 'name' | 'lib'>): string | undefined {
    const week = this.get(weekId);
    if (!week) return undefined;
    const prev = previousExercise(this.weeks.get(), week, ex, this.settings.get().library);
    return prev ? (prev.weight ?? '') : undefined;
  }

  /**
   * A weight typed on an exercise becomes the library entry's default (Ari:
   * "the new default for all future exercises of that kind"): the picker
   * writes it on the exercise the next time it is added to a week. New weeks
   * copy the latest week anyway, which already carries it.
   */
  rememberWeight(ex: Pick<Exercise, 'id' | 'name' | 'lib'>, weight: string): void {
    const s = this.settings.get();
    const entry = matchLibrary(ex, s.library);
    if (!entry || (entry.weight ?? '') === weight.trim()) return;
    void this.updateSettings({ library: withDefaultWeight(s.library, entry.id, weight) });
  }

  /**
   * The library entry an exercise counts as, created when there is none: a
   * blank entry named after the exercise (no muscle groups yet), linked with
   * `Exercise.lib`. Used when a load rule ("Bodyweight", "×2 dumbbells") is
   * set from the exercise editor — Ari: "make my own calculations for
   * exercises I don't already have".
   */
  ensureLibraryEntry(weekId: string, ex: Exercise): LibraryExercise {
    const s = this.settings.get();
    const found = matchLibrary(ex, s.library);
    if (found) {
      if (!ex.lib) this.update(weekId, (x) => ({ ...x, exercises: x.exercises.map((e) => (e.id === ex.id ? { ...e, lib: found.id } : e)) }));
      return found;
    }
    const base = slug(ex.name || 'exercise');
    let id = base;
    for (let n = 2; s.library.some((e) => e.id === id); n++) id = `${base}-${n}`;
    const entry: LibraryExercise = { id, name: ex.name.trim() || 'Exercise', muscles: [], load: { kind: 'external', dumbbells: 1 }, sets: ex.sets };
    if (ex.timedSec) entry.timedSec = ex.timedSec;
    if (ex.weight.trim()) entry.weight = ex.weight.trim();
    void this.updateSettings({ library: [...s.library, entry] });
    this.update(weekId, (x) => ({ ...x, exercises: x.exercises.map((e) => (e.id === ex.id ? { ...e, lib: id } : e)) }));
    return entry;
  }

  /** How the stats weigh a rep of this exercise (its library entry's rule), set from the exercise editor. */
  setExerciseLoad(weekId: string, ex: Exercise, load: LoadRule): void {
    const entry = this.ensureLibraryEntry(weekId, ex);
    const library = this.settings.get().library;
    void this.updateSettings({ library: library.map((e) => (e.id === entry.id ? { ...e, load } : e)) });
  }

  /** Add a mark to the tool's list (a word like "Pre-workout", or a symbol); an existing one is returned. */
  addMark(symbol: string, meaning = ''): string | undefined {
    const m = symbol.trim();
    if (!m) return undefined;
    const marks = this.settings.get().marks;
    const existing = marks.find((x) => x.symbol.toLowerCase() === m.toLowerCase());
    if (existing) return existing.symbol;
    void this.updateSettings({ marks: [...marks, { symbol: m, meaning: meaning.trim() }] });
    return m;
  }

  /**
   * Merge imported weeks (same id → replaced). Empty weeks whose label another
   * week with content already carries (a "Week 38" started by hand before the
   * real one arrived) are removed. Returns how many were added / replaced / removed.
   */
  async importWeeks(weeks: Week[], settings?: WorkoutSettings, remove: string[] = []): Promise<{ added: number; replaced: number; removed: number }> {
    const byId = new Map(this.weeks.get().map((w) => [w.id, w]));
    let added = 0;
    let replaced = 0;
    let removed = 0;
    for (const w of weeks) {
      if (byId.has(w.id)) replaced++;
      else added++;
      byId.set(w.id, w);
      await this.ctx.kv.set(WEEK_PREFIX + w.id, w);
    }
    // Weeks the file retires (a renumbered import that replaces earlier ids).
    for (const id of remove) {
      if (!byId.has(id)) continue;
      byId.delete(id);
      await this.ctx.kv.delete(WEEK_PREFIX + id);
      removed++;
    }
    const imported = new Set(weeks.map((w) => w.id));
    const all = [...byId.values()];
    const duplicates = emptyDuplicateWeeks(all, all.filter((w) => imported.has(w.id) || weekHasContent(w)));
    for (const d of duplicates) {
      byId.delete(d.id);
      await this.ctx.kv.delete(WEEK_PREFIX + d.id);
      removed++;
    }
    this.weeks.set(sortWeeks([...byId.values()]));
    if (settings) await this.updateSettings(settings);
    // Land on the newest week after an import (the imported history usually ends there).
    const last = this.weeks.get()[this.weeks.get().length - 1];
    if (last) this.select(last.id);
    this.updateStatus();
    return { added, replaced, removed };
  }

  private updateStatus(): void {
    const list = this.weeks.get();
    const last = list[list.length - 1];
    this.status.set(last ? `${last.label} · ${list.length} week${list.length === 1 ? '' : 's'}` : null);
  }
}
