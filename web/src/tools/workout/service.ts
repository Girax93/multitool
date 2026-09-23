// Workout service: persistence and mutations. Each week is stored under its
// own key so the log can grow for years without rewriting one big blob.

import { uid } from '../../core/dom.js';
import type { ToolContext } from '../../core/registry.js';
import { Emitter, signal, type Signal } from '../../core/store.js';
import {
  DEFAULT_SETTINGS,
  addDays,
  emptyDuplicateWeeks,
  mergeSettings,
  mondayOf,
  newWeek,
  nextWeekLabelFrom,
  sortWeeks,
  weekHasContent,
  type Week,
  type WorkoutSettings,
} from './model.js';

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

/** What the stats page reads from: the last N calendar weeks or everything. Per device, like the view. */
export interface StatsPref {
  mode: 'last' | 'all';
  weeks: number;
  /** Exercise id shown in the progression chart. */
  exercise?: string;
  metric?: string;
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
   * week when that is later (weeks were skipped); the label counts calendar
   * weeks since the highest numbered one.
   */
  createWeek(opts: { startDate?: string; label?: string; copyFrom?: Week } = {}): Week {
    const list = this.weeks.get();
    const previous = opts.copyFrom ?? list[list.length - 1];
    const settings = this.settings.get();
    const thisMonday = mondayOf(new Date());
    let startDate = opts.startDate;
    if (!startDate) {
      const after = previous?.startDate ? addDays(previous.startDate, 7) : thisMonday;
      startDate = after < thisMonday ? thisMonday : after;
    }
    const week = newWeek({
      id: uid('wk'),
      dayIds: settings.defaultDays.map(() => uid('d')),
      now: Date.now(),
      settings,
      previous,
      startDate,
      label: opts.label ?? nextWeekLabelFrom(list, startDate),
    });
    this.weeks.set(sortWeeks([...list, week]));
    void this.ctx.kv.set(WEEK_PREFIX + week.id, week);
    this.select(week.id);
    this.updateStatus();
    return week;
  }

  async deleteWeek(id: string): Promise<void> {
    const remaining = this.weeks.get().filter((w) => w.id !== id);
    this.weeks.set(remaining);
    await this.ctx.kv.delete(WEEK_PREFIX + id);
    if (this.currentWeekId.get() === id) this.select(remaining[remaining.length - 1]?.id ?? '');
    this.updateStatus();
  }

  async updateSettings(patch: Partial<WorkoutSettings>): Promise<void> {
    const next = { ...this.settings.get(), ...patch };
    this.settings.set(next);
    await this.ctx.kv.set(SETTINGS_KEY, next);
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
