// Workout service: persistence and mutations. Each week is stored under its
// own key so the log can grow for years without rewriting one big blob.

import { uid } from '../../core/dom.js';
import type { ToolContext } from '../../core/registry.js';
import { signal, type Signal } from '../../core/store.js';
import {
  DEFAULT_SETTINGS,
  newWeek,
  sortWeeks,
  type Week,
  type WorkoutSettings,
} from './model.js';

const WEEK_PREFIX = 'weeks/';
const SETTINGS_KEY = 'settings';
const CURRENT_KEY = 'ui/currentWeek';

export class WorkoutService {
  readonly weeks: Signal<Week[]> = signal<Week[]>([]);
  readonly settings: Signal<WorkoutSettings> = signal<WorkoutSettings>(DEFAULT_SETTINGS);
  readonly currentWeekId: Signal<string | null> = signal<string | null>(null);
  readonly status: Signal<string | null> = signal<string | null>(null);

  constructor(private readonly ctx: ToolContext) {}

  async init(): Promise<void> {
    const [entries, settings, current] = await Promise.all([
      this.ctx.kv.list<Week>(WEEK_PREFIX),
      this.ctx.kv.get<Partial<WorkoutSettings>>(SETTINGS_KEY),
      this.ctx.kv.get<string>(CURRENT_KEY),
    ]);
    if (settings) this.settings.set({ ...DEFAULT_SETTINGS, ...settings });
    const weeks = sortWeeks(entries.map((e) => e.value));
    this.weeks.set(weeks);
    const last = weeks[weeks.length - 1];
    this.currentWeekId.set(current && weeks.some((w) => w.id === current) ? current : (last?.id ?? null));
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

  /** Start a new week after the latest one (exercises copied). */
  createWeek(opts: { startDate?: string; label?: string; copyFrom?: Week } = {}): Week {
    const list = this.weeks.get();
    const previous = opts.copyFrom ?? list[list.length - 1];
    const settings = this.settings.get();
    const week = newWeek({
      id: uid('wk'),
      dayIds: settings.defaultDays.map(() => uid('d')),
      now: Date.now(),
      settings,
      previous,
      startDate: opts.startDate,
      label: opts.label,
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

  /** Merge imported weeks (same id → replaced). Returns how many were added/replaced. */
  async importWeeks(weeks: Week[], settings?: WorkoutSettings): Promise<{ added: number; replaced: number }> {
    const byId = new Map(this.weeks.get().map((w) => [w.id, w]));
    let added = 0;
    let replaced = 0;
    for (const w of weeks) {
      if (byId.has(w.id)) replaced++;
      else added++;
      byId.set(w.id, w);
      await this.ctx.kv.set(WEEK_PREFIX + w.id, w);
    }
    this.weeks.set(sortWeeks([...byId.values()]));
    if (settings) await this.updateSettings(settings);
    if (!this.current()) {
      const last = this.weeks.get()[this.weeks.get().length - 1];
      if (last) this.select(last.id);
    }
    this.updateStatus();
    return { added, replaced };
  }

  private updateStatus(): void {
    const list = this.weeks.get();
    const last = list[list.length - 1];
    this.status.set(last ? `${last.label} · ${list.length} week${list.length === 1 ? '' : 's'}` : null);
  }
}
