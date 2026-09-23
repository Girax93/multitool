// Stats page (#/t/workout/stats): what the log adds up to — an overview with
// a days donut, a GitHub-style activity map, a month calendar, days per
// week, training volume, muscle groups over time and as a share, exercises
// as a share, one exercise's progression, bodyweight and workout duration.
// Every card has its own range (1 week … 1 year, all, or any number of
// weeks) and the header sets them all at once; ranges are a per-device
// preference like the log's view. Skipped weeks stay visible as empty slots
// in every chart, long ranges can be zoomed and panned, and every axis says
// what its numbers are.

import { h, replace, svg } from '../../core/dom.js';
import { navigate, toolPath } from '../../core/router.js';
import { icons } from '../../ui/icons.js';
import { barChart, donutChart, fmtNum, lineChart, s, type BarCategory, type LinePoint, type LineSeries, type Slice, type View } from './charts.js';
import { muscleLabel, type LibraryExercise, type MuscleGroup } from './library.js';
import { addDays, fromIsoDate, toIsoDate, weekdayOfDate, type Week } from './model.js';
import type { RangeSpec, StatsPref, WorkoutService } from './service.js';
import {
  EXERCISE_METRICS,
  bodyweightSeries,
  calendarMonth,
  dayActivities,
  durationSeries,
  exerciseCatalogue,
  exerciseProgress,
  exerciseTotals,
  heatLevel,
  metricValue,
  muscleTotals,
  muscleWeekly,
  statsRange,
  summarize,
  volumeWeekly,
  weeklyActivity,
  type DayActivity,
  type ExerciseMetric,
  type MuscleWeek,
  type StatsRange,
  type WeekSlot,
} from './stats.js';

/** Month shown in the calendar card; survives re-renders while the page is open. */
let calendarCursor: { year: number; month0: number } | null = null;

export function resetStatsView(): void {
  calendarCursor = null;
}

const COLOR = {
  tracked: 'var(--heat-3)',
  other: 'var(--heat-other)',
  off: 'var(--heat-0)',
  line: 'var(--chart-1)',
  rest: 'var(--chart-1)',
};

/** Fixed colour per muscle group, so a group keeps its colour whatever else is drawn. */
const MUSCLE_COLOR: Record<MuscleGroup, string> = {
  chest: 'var(--cat-1)', // blue
  back: 'var(--cat-2)', // orange
  shoulders: 'var(--cat-7)', // gold
  biceps: 'var(--cat-4)', // purple
  triceps: 'var(--cat-5)', // teal
  forearms: 'var(--cat-6)', // pink
  core: 'var(--cat-10)', // cyan
  quads: 'var(--cat-3)', // green
  hamstrings: 'var(--cat-8)', // indigo
  glutes: 'var(--cat-9)', // brown
  calves: 'var(--cat-11)', // olive
};

const CAT = (i: number): string => `var(--cat-${(i % 11) + 1})`;

/** Range presets: what the chips offer, as calendar weeks. */
const PRESETS: { label: string; weeks: number }[] = [
  { label: '1 wk', weeks: 1 },
  { label: '3 wk', weeks: 3 },
  { label: '1 mo', weeks: 4 },
  { label: '3 mo', weeks: 13 },
  { label: '6 mo', weeks: 26 },
  { label: '1 yr', weeks: 52 },
];

const X_WEEK = 'Week number';
const X_DATE = 'Date';

function card(title: string, testid: string, ...children: (HTMLElement | null)[]): HTMLElement {
  return h('section', { class: 'card stats-card', dataset: { testid } }, h('h2', { class: 'card-title' }, title), ...children);
}

function shortDate(iso: string): string {
  return fromIsoDate(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function longDate(iso: string): string {
  return fromIsoDate(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function rangeText(spec: RangeSpec): string {
  if (spec.mode === 'all') return 'all time';
  const p = PRESETS.find((x) => x.weeks === spec.weeks);
  return p ? `last ${p.label === '1 wk' ? 'week' : p.label.replace(' wk', ' weeks').replace(' mo', ' months').replace(' yr', ' year')}` : `last ${spec.weeks} weeks`;
}

function weekTitle(slot: WeekSlot): string {
  return `Week ${slot.n} · ${shortDate(slot.start)}`;
}

function weeksLabel(rows: WeekSlot[], view: View): string {
  const first = rows[Math.max(0, Math.round(view.a))];
  const last = rows[Math.min(rows.length - 1, Math.round(view.b))];
  return first && last ? `weeks ${first.n}–${last.n}` : '';
}

export function renderStats(service: WorkoutService): HTMLElement {
  const weeks = service.weeks.get();
  const pref = service.stats.get();
  const settings = service.settings.get();
  const library = settings.library;
  const today = toIsoDate(new Date());
  const days = dayActivities(weeks);
  const unit = settings.unit;
  const rangeOf = (cardId: string): StatsRange => {
    const spec = service.statsRangeFor(cardId);
    return statsRange(weeks, spec.mode, spec.weeks, today);
  };

  const openWeek = (weekId: string): void => {
    service.select(weekId);
    navigate(toolPath('workout'));
  };
  const openDay = (a: DayActivity | undefined): void => {
    if (a) openWeek(a.weekId);
  };
  const openSlot = (slot: WeekSlot | undefined): void => {
    const w = slot?.weeks[0];
    if (w) openWeek(w.id);
  };

  const head = h(
    'div',
    { class: 'sess-head stats-head' },
    h('button', { class: 'btn btn-text btn-sm', dataset: { testid: 'stats-back' }, onClick: () => navigate(toolPath('workout')) }, svg(icons.back, 'icon icon-sm'), 'Log'),
    h('span', { class: 'sess-title' }, 'Stats'),
    h(
      'div',
      { class: 'stats-range-all' },
      h('span', { class: 'muted stats-range-all-label' }, 'All cards:'),
      rangeChips({ mode: pref.mode, weeks: pref.weeks }, (spec) => service.setStats({ ...spec, ranges: {} }), 'stats-all'),
    ),
  );

  return h(
    'div',
    { class: 'wk stats', dataset: { testid: 'stats' } },
    head,
    h(
      'div',
      { class: 'wk-scroll' },
      h(
        'div',
        { class: 'stats-body' },
        renderOverview(service, weeks, rangeOf('overview'), unit, openDay),
        renderHeatmap(service, days, rangeOf('activity'), today, openDay),
        renderCalendar(days, today, openDay),
        renderDaysPerWeek(service, weeks, rangeOf('days'), openSlot),
        renderVolume(service, weeks, rangeOf('volume'), pref, library, openSlot),
        renderMuscleLines(service, weeks, rangeOf('muscles'), pref, library, openSlot),
        renderMuscleShare(service, weeks, rangeOf('muscle-share'), pref, library),
        renderExerciseShare(service, weeks, rangeOf('exercise-share'), library),
        renderExerciseCard(service, weeks, rangeOf('exercise'), pref, library, openSlot),
        renderBodyweight(service, weeks, rangeOf('weight'), unit, days, openDay),
        renderDuration(service, weeks, rangeOf('duration'), days, openDay),
      ),
    ),
  );
}

// ---- Range chips ------------------------------------------------------------------------

/** 1 wk · 3 wk · 1 mo · 3 mo · 6 mo · 1 yr · All · [N] wk — the active one highlighted. */
function rangeChips(spec: RangeSpec, onChange: (spec: RangeSpec) => void, testid: string): HTMLElement {
  const isPreset = spec.mode === 'last' && PRESETS.some((p) => p.weeks === spec.weeks);
  const chip = (label: string, active: boolean, onClick: () => void, tid: string): HTMLElement =>
    h('button', { type: 'button', class: `chip chip-range${active ? ' chip-active' : ''}`, dataset: { testid: tid }, onClick }, label);
  const custom = h('input', {
    type: 'number',
    class: 'input input-num range-custom',
    min: '1',
    max: '520',
    value: spec.mode === 'last' && !isPreset ? String(spec.weeks) : '',
    placeholder: '#',
    'aria-label': 'Number of weeks',
    dataset: { testid: `${testid}-custom` },
    onChange: () => {
      const n = parseInt(custom.value, 10);
      if (n > 0) onChange({ mode: 'last', weeks: n });
    },
  });
  return h(
    'div',
    { class: 'range-chips', role: 'radiogroup' },
    ...PRESETS.map((p) => chip(p.label, spec.mode === 'last' && spec.weeks === p.weeks, () => onChange({ mode: 'last', weeks: p.weeks }), `${testid}-${p.weeks}`)),
    chip('All', spec.mode === 'all', () => onChange({ mode: 'all', weeks: spec.weeks }), `${testid}-all`),
    h('label', { class: `range-custom-wrap${spec.mode === 'last' && !isPreset ? ' chip-active' : ''}` }, custom, h('span', { class: 'muted' }, 'wk')),
  );
}

/** A card's own range control (with "same as all cards" when it has an override). */
function cardRange(service: WorkoutService, cardId: string): HTMLElement {
  const own = service.stats.get().ranges?.[cardId];
  const spec = service.statsRangeFor(cardId);
  return h(
    'div',
    { class: 'card-range' },
    rangeChips(spec, (next) => service.setCardRange(cardId, next), `range-${cardId}`),
    own ? h('button', { type: 'button', class: 'btn btn-text btn-sm', onClick: () => service.setCardRange(cardId, undefined) }, 'Same as all cards') : null,
  );
}

function segmented<T extends string>(options: { id: T; label: string }[], value: T, onPick: (id: T) => void, testid: string): HTMLElement {
  return h(
    'div',
    { class: 'segmented segmented-xs', role: 'radiogroup' },
    ...options.map((o) => h('button', { type: 'button', class: `seg${o.id === value ? ' seg-active' : ''}`, role: 'radio', 'aria-checked': String(o.id === value), dataset: { testid: `${testid}-${o.id}` }, onClick: () => onPick(o.id) }, o.label)),
  );
}

// ---- Overview ---------------------------------------------------------------------------

function tile(value: string, label: string, sub: string): HTMLElement {
  return h('div', { class: 'stats-tile' }, h('div', { class: 'stats-tile-value' }, value), h('div', { class: 'stats-tile-label' }, label), sub ? h('div', { class: 'stats-tile-sub muted' }, sub) : null);
}

function renderOverview(service: WorkoutService, weeks: Week[], range: StatsRange, unit: string, open: (a: DayActivity | undefined) => void): HTMLElement {
  void open;
  const weekly = weeklyActivity(weeks, range);
  const weights = bodyweightSeries(weeks, range);
  const durations = durationSeries(weeks, range);
  const summary = summarize(weekly, weights, durations);
  const tiles = h(
    'div',
    { class: 'stats-tiles', dataset: { testid: 'stats-tiles' } },
    tile(String(summary.trained + summary.other), 'workouts', `${summary.trained} tracked · ${summary.other} other`),
    tile(fmtNum(summary.perWeek), 'per week', `${summary.weeks} week${summary.weeks === 1 ? '' : 's'}, ${summary.emptyWeeks} without`),
    tile(String(summary.sets), 'sets logged', ''),
    summary.weightDelta !== undefined ? tile(`${summary.weightDelta > 0 ? '+' : ''}${fmtNum(summary.weightDelta)} ${unit}`, 'bodyweight', `${weights[0]?.kg} → ${weights[weights.length - 1]?.kg} ${unit}`) : null,
    summary.avgMinutes !== undefined ? tile(`${summary.avgMinutes} min`, 'per workout', `${durations.length} timed`) : null,
  );
  // days split: every calendar day of the range up to today
  const totalDays = weekly.reduce((n, w) => n + Math.max(0, Math.min(7, Math.floor((fromIsoDate(toIsoDate(new Date())).getTime() - fromIsoDate(w.start).getTime()) / 86_400_000) + 1)), 0);
  const off = Math.max(0, totalDays - summary.trained - summary.other);
  const donut = donutChart({
    testid: 'donut-days',
    unit: 'days',
    center: { value: String(summary.trained + summary.other), label: 'workouts' },
    slices: [
      { name: 'Tracked workout', value: summary.trained, color: COLOR.tracked },
      { name: 'Other workout', value: summary.other, color: COLOR.other },
      { name: 'No workout', value: off, color: COLOR.off },
    ],
  });
  return card('Overview', 'stats-overview', cardRange(service, 'overview'), tiles, h('h3', { class: 'stats-sub' }, `Days, ${rangeText(service.statsRangeFor('overview'))}`), donut.root);
}

// ---- Activity map ---------------------------------------------------------------------

const CELL = 13;
const GAP = 3;
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * GitHub-style map: one column per calendar week in the range, Monday to
 * Sunday down. Tracked workouts in greens by sets done, other workouts in
 * orange, days without in a dim green; days still ahead are not drawn.
 */
function renderHeatmap(service: WorkoutService, days: Map<string, DayActivity>, range: StatsRange, today: string, open: (a: DayActivity | undefined) => void): HTMLElement {
  const cols: string[] = [];
  for (let d = range.from; d <= range.to; d = addDays(d, 7)) cols.push(d);
  let maxSets = 0;
  for (const a of days.values()) if (a.date >= range.from && a.date <= today && a.kind === 'tracked') maxSets = Math.max(maxSets, a.sets);
  const left = 0;
  const top = 16;
  const width = cols.length * (CELL + GAP) + 36; // room for the last month label
  const height = top + 7 * (CELL + GAP);
  const el = s('svg', { class: 'heatmap-svg', width, height, viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': 'Workout activity' });
  // weekday labels sit outside the scrolling part so they stay put
  const dayLabels = h('div', { class: 'heatmap-days', style: { paddingTop: `${top}px` } }, ...WD.map((d, r) => h('span', { class: 'heatmap-day', style: { height: `${CELL + GAP}px` } }, r % 2 === 0 ? d : '')));
  const tipHost = h('div', { class: 'chart-tip', hidden: true });
  const wrap = h('div', { class: 'heatmap-wrap' });
  const scroller = h('div', { class: 'heatmap-scroll' }, el);
  // month labels: over the first column of each month (the first column too, unless a month starts right after it)
  const labelCols = new Set<number>(cols.map((monday, c) => (fromIsoDate(monday).getDate() <= 7 ? c : -1)).filter((c) => c >= 0));
  if (!labelCols.has(0) && !labelCols.has(1) && !labelCols.has(2)) labelCols.add(0);
  cols.forEach((monday, c) => {
    const x = left + c * (CELL + GAP);
    if (labelCols.has(c)) {
      const d = fromIsoDate(monday);
      const withYear = c === 0 || d.getMonth() === 0;
      el.appendChild(s('text', { x, y: 10, class: 'chart-xlabel' }, d.toLocaleDateString(undefined, withYear ? { month: 'short', year: 'numeric' } : { month: 'short' })));
    }
    for (let r = 0; r < 7; r++) {
      const date = addDays(monday, r);
      if (date > today) continue;
      const a = days.get(date);
      let cls = 'hm-off';
      if (a?.kind === 'tracked') cls = `hm-t${heatLevel(a.sets, maxSets)}`;
      else if (a?.kind === 'other') cls = 'hm-other';
      const rect = s('rect', { x, y: top + r * (CELL + GAP), width: CELL, height: CELL, rx: 2, class: `hm-cell ${cls}`, 'data-date': date });
      const show = (): void => {
        replace(tipHost, h('div', { class: 'chart-tip-title' }, longDate(date)), h('div', { class: 'chart-tip-row' }, describe(a)));
        tipHost.hidden = false;
        const tw = tipHost.offsetWidth;
        tipHost.style.left = `${Math.max(0, Math.min(wrap.clientWidth - tw, scroller.offsetLeft + x - scroller.scrollLeft + CELL / 2 - tw / 2))}px`;
        tipHost.style.top = `${Math.max(0, top + r * (CELL + GAP) - tipHost.offsetHeight - 8)}px`;
      };
      // Touch: the first tap shows what the day was, a second tap opens its week.
      let armed = false;
      rect.addEventListener('pointerenter', show);
      rect.addEventListener('pointerdown', (ev) => {
        armed = ev.pointerType !== 'touch' || (!tipHost.hidden && tipHost.dataset['date'] === date);
        show();
        tipHost.dataset['date'] = date;
      });
      rect.addEventListener('click', () => {
        if (armed) open(a);
      });
      el.appendChild(rect);
    }
  });
  el.addEventListener('pointerleave', (ev) => {
    if (ev.pointerType === 'touch') return; // keep it for the second tap
    tipHost.hidden = true;
  });
  wrap.append(dayLabels, scroller, tipHost);
  // newest weeks at the right: start scrolled to the end
  requestAnimationFrame(() => {
    scroller.scrollLeft = scroller.scrollWidth;
  });
  const legend = h(
    'div',
    { class: 'chart-legend heatmap-legend' },
    h('span', { class: 'chart-legend-item' }, h('span', { class: 'chart-swatch hm-off' }), 'no workout'),
    h('span', { class: 'chart-legend-item' }, ...[1, 2, 3, 4].map((l) => h('span', { class: `chart-swatch hm-t${l}` })), 'tracked workout (more sets = brighter)'),
    h('span', { class: 'chart-legend-item' }, h('span', { class: 'chart-swatch hm-other' }), 'other workout'),
  );
  return card('Activity map', 'stats-heatmap', cardRange(service, 'activity'), h('p', { class: 'muted stats-note' }, 'One square per day, weeks left to right, Monday at the top. Tap a square for the day; tap again to open its week.'), wrap, legend);
}

function describe(a: DayActivity | undefined): string {
  if (!a) return 'No entry';
  if (a.kind === 'tracked') return `${a.weekLabel} · ${a.sets} set${a.sets === 1 ? '' : 's'}${a.minutes !== undefined ? ` · ${a.minutes} min` : ''}`;
  if (a.kind === 'other') return `${a.weekLabel} · ${a.alt}`;
  return `${a.weekLabel} · no workout${a.marked ? ' (marked off)' : ''}`;
}

// ---- Calendar ---------------------------------------------------------------------------

function renderCalendar(days: Map<string, DayActivity>, today: string, open: (a: DayActivity | undefined) => void): HTMLElement {
  const t = fromIsoDate(today);
  calendarCursor ??= { year: t.getFullYear(), month0: t.getMonth() };
  const body = h('div', { class: 'cal-body' });
  const title = h('span', { class: 'cal-title', dataset: { testid: 'cal-title' } });
  const draw = (): void => {
    const cur = calendarCursor ?? { year: t.getFullYear(), month0: t.getMonth() };
    const m = calendarMonth(cur.year, cur.month0, days);
    title.textContent = m.label;
    const numbers = weekNumbersByMonday(days);
    replace(
      body,
      h(
        'div',
        { class: 'cal-grid' },
        h('span', { class: 'cal-wk-head' }, 'wk'),
        ...WD.map((d) => h('span', { class: 'cal-head' }, d)),
        ...m.rows.flatMap((row) => [
          h('span', { class: 'cal-wk muted' }, numbers.get(row.start) ?? ''),
          ...row.days.map((d) => {
            const a = d.activity;
            const kind = a?.kind ?? 'none';
            const cls = ['cal-day', d.inMonth ? '' : 'cal-out', d.date === today ? 'cal-today' : '', `cal-${kind}`, a?.marked ? 'cal-marked' : '', d.date > today ? 'cal-future' : ''].filter(Boolean).join(' ');
            return h(
              'button',
              { class: cls, title: a ? describe(a) : '', dataset: { date: d.date }, onClick: () => open(a) },
              h('span', { class: 'cal-num' }, String(d.d)),
              a && a.kind !== 'off' ? h('span', { class: 'cal-dot' }) : null,
            );
          }),
        ]),
      ),
    );
  };
  const nav = (delta: number): void => {
    const cur = calendarCursor ?? { year: t.getFullYear(), month0: t.getMonth() };
    const d = new Date(cur.year, cur.month0 + delta, 1);
    calendarCursor = { year: d.getFullYear(), month0: d.getMonth() };
    draw();
  };
  draw();
  return card(
    'Calendar',
    'stats-calendar',
    h(
      'div',
      { class: 'cal-nav' },
      h('button', { class: 'iconbtn', 'aria-label': 'Previous month', dataset: { testid: 'cal-prev' }, onClick: () => nav(-1) }, svg(icons.chevronLeft)),
      title,
      h('button', { class: 'iconbtn', 'aria-label': 'Next month', dataset: { testid: 'cal-next' }, onClick: () => nav(1) }, svg(icons.chevronRight)),
    ),
    body,
    h(
      'div',
      { class: 'chart-legend' },
      h('span', { class: 'chart-legend-item' }, h('span', { class: 'chart-swatch', style: { background: COLOR.tracked } }), 'tracked workout'),
      h('span', { class: 'chart-legend-item' }, h('span', { class: 'chart-swatch', style: { background: COLOR.other } }), 'other workout'),
      h('span', { class: 'chart-legend-item' }, h('span', { class: 'chart-swatch cal-swatch-marked' }), 'marked off (no workout)'),
      h('span', { class: 'chart-legend-item' }, 'wk = week number · tap a day to open its week'),
    ),
  );
}

/** Week number for each Monday that has a day entry (from the entry's label). */
function weekNumbersByMonday(days: Map<string, DayActivity>): Map<string, string> {
  const out = new Map<string, string>();
  for (const a of days.values()) {
    const monday = addDays(a.date, -WD.indexOf(weekdayOfDate(a.date)));
    if (out.has(monday)) continue;
    const m = /(\d+)\s*$/.exec(a.weekLabel);
    out.set(monday, m && m[1] ? m[1] : '·');
  }
  return out;
}

// ---- Days per week ----------------------------------------------------------------------

function weekCategories(rows: (WeekSlot & { empty?: boolean })[]): BarCategory[] {
  return rows.map((w) => ({ key: w.start, label: String(w.n), title: weekTitle(w), empty: w.empty, emptyText: w.weeks.length ? 'no workout' : 'no entry' }));
}

function renderDaysPerWeek(service: WorkoutService, weeks: Week[], range: StatsRange, open: (slot: WeekSlot | undefined) => void): HTMLElement {
  const weekly = weeklyActivity(weeks, range);
  const chart = barChart({
    testid: 'chart-days',
    categories: weekCategories(weekly.map((w) => ({ ...w, empty: w.tracked + w.other === 0 }))),
    series: [
      { name: 'tracked workout', color: COLOR.tracked, values: weekly.map((w) => (w.empty ? undefined : w.tracked)) },
      { name: 'other workout', color: COLOR.other, values: weekly.map((w) => (w.empty ? undefined : w.other)) },
    ],
    stacked: true,
    yMax: Math.max(3, ...weekly.map((w) => w.tracked + w.other)) + 1,
    unit: 'days',
    xLabel: X_WEEK,
    yLabel: 'days',
    emptyLabel: 'no workout',
    viewLabel: (first, last) => `weeks ${first.label}–${last.label}`,
    onSelect: (i) => open(weekly[i]),
  });
  return card('Workout days per week', 'stats-days', cardRange(service, 'days'), chart.root);
}

// ---- Training volume ---------------------------------------------------------------------

const VOLUME_METRICS: { id: 'sets' | 'reps' | 'load'; label: string; unit: string; yLabel: string }[] = [
  { id: 'sets', label: 'Sets', unit: 'sets', yLabel: 'sets' },
  { id: 'reps', label: 'Reps', unit: 'reps', yLabel: 'reps' },
  { id: 'load', label: 'Weight moved', unit: 'kg', yLabel: 'kg moved' },
];

function renderVolume(service: WorkoutService, weeks: Week[], range: StatsRange, pref: StatsPref, library: LibraryExercise[], open: (slot: WeekSlot | undefined) => void): HTMLElement {
  const metric = VOLUME_METRICS.find((m) => m.id === pref.volumeMetric) ?? VOLUME_METRICS[0]!;
  const rows = volumeWeekly(weeks, range, library);
  const points: LinePoint[] = rows.map((r, i) => ({ x: i, y: r[metric.id] })).filter((p, i) => !rows[i]!.empty);
  const chart = lineChart({
    testid: 'chart-volume',
    xMin: 0,
    xMax: Math.max(1, rows.length - 1),
    xTicks: rows.map((r, i) => ({ x: i, label: String(r.n) })),
    xBands: rows.map((r, i) => ({ r, i })).filter(({ r }) => r.empty).map(({ i }) => ({ x0: i - 0.5, x1: i + 0.5 })),
    series: [{ name: metric.label, color: COLOR.line, points }],
    gap: 1,
    zero: true,
    unit: metric.unit,
    xLabel: X_WEEK,
    yLabel: metric.yLabel,
    emptyLabel: 'no entry',
    title: (x) => (rows[x] ? weekTitle(rows[x]!) : ''),
    zoom: { minSpan: 4, label: (v) => weeksLabel(rows, v) },
    onSelect: (x) => open(rows[x]),
  });
  return card(
    'Training volume per week',
    'stats-volume',
    cardRange(service, 'volume'),
    h('div', { class: 'stats-controls' }, segmented(VOLUME_METRICS, metric.id, (id) => service.setStats({ volumeMetric: id }), 'volume-metric')),
    chart.root,
    metric.id === 'load' ? h('p', { class: 'muted stats-note' }, 'Weight moved = reps × kg per rep, with bodyweight exercises counted as their share of your bodyweight (Settings → Exercises).') : null,
  );
}

// ---- Muscle groups ---------------------------------------------------------------------

function renderMuscleLines(service: WorkoutService, weeks: Week[], range: StatsRange, pref: StatsPref, library: LibraryExercise[], open: (slot: WeekSlot | undefined) => void): HTMLElement {
  const metric: 'sets' | 'load' = pref.muscleMetric === 'load' ? 'load' : 'sets';
  const rows: MuscleWeek[] = muscleWeekly(weeks, range, library);
  const totals = muscleTotals(rows);
  const available = totals.map((t) => t.group);
  if (!available.length) {
    return card('Muscle groups over time', 'stats-muscles', cardRange(service, 'muscles'), h('p', { class: 'muted' }, 'No sets with a known exercise in this range. Exercises get their muscle groups from Settings → Exercises.'));
  }
  const chosen = (pref.muscleGroups ?? []).filter((g): g is MuscleGroup => available.includes(g as MuscleGroup));
  const selected: MuscleGroup[] = chosen.length ? chosen : available.slice(0, 4);
  const series: LineSeries[] = selected.map((g) => ({
    name: muscleLabel(g),
    color: MUSCLE_COLOR[g],
    points: rows.map((r, i) => ({ x: i, y: r[metric][g] })).filter((p, i) => rows[i]!.weeks.length > 0),
  }));
  const chart = lineChart({
    testid: 'chart-muscles',
    xMin: 0,
    xMax: Math.max(1, rows.length - 1),
    xTicks: rows.map((r, i) => ({ x: i, label: String(r.n) })),
    xBands: rows.map((r, i) => ({ r, i })).filter(({ r }) => r.weeks.length === 0).map(({ i }) => ({ x0: i - 0.5, x1: i + 0.5 })),
    series,
    gap: 1,
    zero: true,
    unit: metric === 'sets' ? 'sets' : 'kg',
    xLabel: X_WEEK,
    yLabel: metric === 'sets' ? 'sets' : 'kg moved',
    emptyLabel: 'no entry',
    title: (x) => (rows[x] ? weekTitle(rows[x]!) : ''),
    zoom: { minSpan: 4, label: (v) => weeksLabel(rows, v) },
    onSelect: (x) => open(rows[x]),
  });
  const chips = h(
    'div',
    { class: 'chips chips-tight' },
    ...available.map((g) =>
      h(
        'button',
        {
          type: 'button',
          class: `chip chip-muscle${selected.includes(g) ? ' chip-active' : ''}`,
          dataset: { testid: `muscle-${g}` },
          onClick: () => {
            const next = selected.includes(g) ? selected.filter((x) => x !== g) : [...selected, g];
            service.setStats({ muscleGroups: next.length ? next : [g] });
          },
        },
        h('span', { class: 'chart-swatch', style: { background: MUSCLE_COLOR[g] } }),
        muscleLabel(g),
      ),
    ),
  );
  return card(
    'Muscle groups over time',
    'stats-muscles',
    cardRange(service, 'muscles'),
    h('div', { class: 'stats-controls' }, segmented([{ id: 'sets', label: 'Sets' }, { id: 'load', label: 'Weight moved' }], metric, (id) => service.setStats({ muscleMetric: id }), 'muscle-metric')),
    chips,
    chart.root,
    h('p', { class: 'muted stats-note' }, 'A set counts fully for the muscles that do the work and half for the ones that help (Settings → Exercises). Tap the chips to choose which groups are drawn.'),
  );
}

function renderMuscleShare(service: WorkoutService, weeks: Week[], range: StatsRange, pref: StatsPref, library: LibraryExercise[]): HTMLElement {
  const metric: 'sets' | 'load' = pref.shareMetric === 'load' ? 'load' : 'sets';
  const totals = muscleTotals(muscleWeekly(weeks, range, library));
  const slices: Slice[] = totals.map((t) => ({ name: muscleLabel(t.group), value: metric === 'sets' ? t.sets : t.load, color: MUSCLE_COLOR[t.group], detail: metric === 'sets' ? `${fmtNum(t.load)} kg moved` : `${fmtNum(t.sets)} sets` }));
  const total = slices.reduce((n, x) => n + x.value, 0);
  const donut = donutChart({
    testid: 'donut-muscles',
    unit: metric === 'sets' ? 'sets' : 'kg',
    center: { value: fmtNum(total), label: metric === 'sets' ? 'muscle-sets' : 'kg moved' },
    maxSlices: 8,
    slices,
  });
  return card(
    'Muscle groups share',
    'stats-muscle-share',
    cardRange(service, 'muscle-share'),
    h('div', { class: 'stats-controls' }, segmented([{ id: 'sets', label: 'Sets' }, { id: 'load', label: 'Weight moved' }], metric, (id) => service.setStats({ shareMetric: id }), 'share-metric')),
    donut.root,
    h('p', { class: 'muted stats-note' }, 'Every set counts for each muscle it works (fully for the main ones, half for the helpers), so the total is more than the sets logged.'),
  );
}

function renderExerciseShare(service: WorkoutService, weeks: Week[], range: StatsRange, library: LibraryExercise[]): HTMLElement {
  const totals = exerciseTotals(weeks, range, library);
  const slices: Slice[] = totals.map((t, i) => ({ name: t.name, value: t.sets, color: CAT(i), detail: `${fmtNum(t.reps)} reps${t.load ? ` · ${fmtNum(t.load)} kg moved` : ''}` }));
  const donut = donutChart({ testid: 'donut-exercises', unit: 'sets', maxSlices: 7, slices });
  return card('Exercises share', 'stats-exercise-share', cardRange(service, 'exercise-share'), h('p', { class: 'muted stats-note' }, 'Sets per exercise in the range.'), donut.root);
}

// ---- Exercise progression ---------------------------------------------------------------

function renderExerciseCard(service: WorkoutService, weeks: Week[], range: StatsRange, pref: StatsPref, library: LibraryExercise[], open: (slot: WeekSlot | undefined) => void): HTMLElement {
  const catalogue = exerciseCatalogue(weeks, library);
  if (!catalogue.length) return card('Exercise progression', 'stats-exercise', h('p', { class: 'muted' }, 'No exercises logged yet.'));
  const exId = catalogue.some((e) => e.id === pref.exercise) ? (pref.exercise as string) : catalogue[0]!.id;
  const metric: ExerciseMetric = EXERCISE_METRICS.some((m) => m.id === pref.metric) ? (pref.metric as ExerciseMetric) : 'best';
  const select = h('select', { class: 'input stats-select', dataset: { testid: 'stats-exercise-select' } }, ...catalogue.map((e) => h('option', { value: e.id }, `${e.name} (${e.weeks} wk)`)));
  select.value = exId;
  select.addEventListener('change', () => service.setStats({ exercise: select.value }));
  const metrics = segmented(
    EXERCISE_METRICS.map((m) => ({ id: m.id, label: m.label })),
    metric,
    (id) => service.setStats({ metric: id }),
    'stats-metric',
  );
  const rows = exerciseProgress(weeks, exId, range, library);
  const def = EXERCISE_METRICS.find((m) => m.id === metric)!;
  const points: LinePoint[] = [];
  rows.forEach((r, i) => {
    const v = metricValue(r, metric);
    if (v !== undefined) points.push({ x: i, y: v, note: r.name });
  });
  const info = catalogue.find((e) => e.id === exId)!;
  const timedNote = info.timed && metric !== 'sets' ? h('p', { class: 'muted stats-note' }, 'A timed exercise: sets done is the useful metric here.') : null;
  const skipped = rows.filter((r) => r.planned && r.sets === 0).length;
  const chart = lineChart({
    testid: 'chart-exercise',
    xMin: 0,
    xMax: Math.max(1, rows.length - 1),
    xTicks: rows.map((r, i) => ({ x: i, label: String(r.n) })),
    xBands: rows.map((r, i) => ({ r, i })).filter(({ r }) => metricValue(r, metric) === undefined).map(({ i }) => ({ x0: i - 0.5, x1: i + 0.5 })),
    series: [{ name: def.label, color: COLOR.line, points }],
    gap: 1,
    zero: metric !== 'weight',
    unit: def.unit,
    xLabel: X_WEEK,
    yLabel: def.id === 'volume' ? 'kg moved' : def.unit,
    emptyLabel: 'not done',
    title: (x) => (rows[x] ? weekTitle(rows[x]!) : ''),
    zoom: { minSpan: 4, label: (v) => weeksLabel(rows, v) },
    onSelect: (x) => open(rows[x]),
  });
  return card(
    'Exercise progression',
    'stats-exercise',
    cardRange(service, 'exercise'),
    h('div', { class: 'stats-controls' }, select, metrics),
    points.length ? chart.root : h('p', { class: 'muted' }, `Nothing logged for ${info.name} in this range.`),
    timedNote,
    skipped ? h('p', { class: 'muted stats-note' }, `Shaded: weeks without this exercise (${skipped} of them planned but not done).`) : null,
    metric === 'volume' ? h('p', { class: 'muted stats-note' }, 'Weight moved = reps × kg per rep; bodyweight exercises use their share of your bodyweight from Settings → Exercises.') : null,
  );
}

// ---- Bodyweight ---------------------------------------------------------------------------

function dayIndex(iso: string, from: string): number {
  return Math.round((fromIsoDate(iso).getTime() - fromIsoDate(from).getTime()) / 86_400_000);
}

function dateTicks(range: StatsRange): { x: number; label: string }[] {
  const ticks: { x: number; label: string }[] = [];
  const total = dayIndex(addDays(range.to, 6), range.from);
  // one tick per week for short ranges, per month beyond ~20 weeks
  if (total <= 20 * 7) {
    for (let d = range.from; d <= range.to; d = addDays(d, 7)) ticks.push({ x: dayIndex(d, range.from), label: shortDate(d) });
  } else {
    let d = range.from;
    let lastMonth = -1;
    while (d <= addDays(range.to, 6)) {
      const dt = fromIsoDate(d);
      const m = dt.getMonth();
      if (m !== lastMonth) {
        const withYear = lastMonth === -1 || m === 0;
        ticks.push({ x: dayIndex(d, range.from), label: dt.toLocaleDateString(undefined, withYear ? { month: 'short', year: '2-digit' } : { month: 'short' }) });
        lastMonth = m;
      }
      d = addDays(d, 1);
    }
  }
  return ticks;
}

function renderBodyweight(service: WorkoutService, weeks: Week[], range: StatsRange, unit: string, days: Map<string, DayActivity>, open: (a: DayActivity | undefined) => void): HTMLElement {
  const weights = bodyweightSeries(weeks, range);
  const total = dayIndex(addDays(range.to, 6), range.from);
  const chart = weights.length
    ? lineChart({
        testid: 'chart-weight',
        xMin: 0,
        xMax: total,
        xTicks: dateTicks(range),
        series: [{ name: `Bodyweight (${unit})`, color: COLOR.line, points: weights.map((p) => ({ x: dayIndex(p.date, range.from), y: p.kg })) }],
        gap: 21,
        unit,
        format: (v) => fmtNum(v),
        xLabel: X_DATE,
        yLabel: unit,
        title: (x) => longDate(addDays(range.from, x)),
        zoom: { minSpan: 14, label: (v) => `${shortDate(addDays(range.from, Math.round(v.a)))} – ${shortDate(addDays(range.from, Math.round(v.b)))}` },
        onSelect: (x) => open(days.get(addDays(range.from, x))),
      }).root
    : h('p', { class: 'muted' }, 'No bodyweight logged in this range.');
  return card('Bodyweight', 'stats-weight', cardRange(service, 'weight'), chart, weights.length ? h('p', { class: 'muted stats-note' }, 'Gaps longer than three weeks are left open.') : null);
}

// ---- Duration ------------------------------------------------------------------------------

function renderDuration(service: WorkoutService, weeks: Week[], range: StatsRange, days: Map<string, DayActivity>, open: (a: DayActivity | undefined) => void): HTMLElement {
  const durations = durationSeries(weeks, range);
  if (!durations.length) {
    return card('Workout duration', 'stats-duration', cardRange(service, 'duration'), h('p', { class: 'muted' }, 'Nothing timed in this range. Log a workout through Workout mode and its length (rest included, every +30 s counted) lands here.'));
  }
  const chart = barChart({
    testid: 'chart-duration',
    categories: durations.map((d) => ({ key: d.date, label: shortDate(d.date), title: `${longDate(d.date)} · ${d.weekLabel}` })),
    series: [
      { name: 'working', color: COLOR.tracked, values: durations.map((d) => Math.max(0, (d.minutes ?? 0) - (d.restMinutes ?? 0)) || undefined) },
      { name: 'rest', color: COLOR.rest, values: durations.map((d) => d.restMinutes || undefined) },
    ],
    stacked: true,
    yAtLeast: 30,
    unit: 'min',
    xLabel: X_DATE,
    yLabel: 'minutes',
    viewLabel: (first, last) => `${first.label} – ${last.label}`,
    onSelect: (i) => open(days.get(durations[i]?.date ?? '')),
  });
  const working = durations.reduce((n, d) => n + Math.max(0, (d.minutes ?? 0) - (d.restMinutes ?? 0)), 0);
  const rest = durations.reduce((n, d) => n + (d.restMinutes ?? 0), 0);
  const donut = donutChart({
    testid: 'donut-duration',
    unit: 'min',
    center: { value: `${Math.round((working + rest) / durations.length)}`, label: 'min per workout' },
    slices: [
      { name: 'Working', value: working, color: COLOR.tracked },
      { name: 'Resting', value: rest, color: COLOR.rest },
    ],
  });
  return card(
    'Workout duration',
    'stats-duration',
    cardRange(service, 'duration'),
    chart.root,
    h('p', { class: 'muted stats-note' }, 'From the first set typed in Workout mode to the last set or countdown; rest is what the countdowns actually ran.'),
    h('h3', { class: 'stats-sub' }, 'Working vs resting'),
    donut.root,
  );
}
