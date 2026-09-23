// Stats page (#/t/workout/stats): what the log adds up to over a range of
// calendar weeks — a GitHub-style activity map, a month calendar, days per
// week, one exercise's progression, bodyweight and workout duration. The
// range ("last N weeks" / all) is a per-device preference like the log's
// view; skipped weeks stay visible as empty slots in every chart.

import { h, replace, svg } from '../../core/dom.js';
import { navigate, toolPath } from '../../core/router.js';
import { icons } from '../../ui/icons.js';
import { barChart, fmtNum, lineChart, s, type LinePoint } from './charts.js';
import { addDays, fromIsoDate, toIsoDate, weekdayOfDate, type Week } from './model.js';
import type { StatsPref, WorkoutService } from './service.js';
import {
  EXERCISE_METRICS,
  bodyweightSeries,
  calendarMonth,
  dayActivities,
  durationSeries,
  exerciseCatalogue,
  exerciseProgress,
  heatLevel,
  metricValue,
  statsRange,
  summarize,
  weeklyActivity,
  type DayActivity,
  type ExerciseMetric,
  type StatsRange,
} from './stats.js';

/** Month shown in the calendar card; survives re-renders while the page is open. */
let calendarCursor: { year: number; month0: number } | null = null;

export function resetStatsView(): void {
  calendarCursor = null;
}

const COLOR = {
  tracked: 'var(--heat-3)',
  other: 'var(--heat-other)',
  line: 'var(--chart-1)',
};

function card(title: string, testid: string, ...children: (HTMLElement | null)[]): HTMLElement {
  return h('section', { class: 'card stats-card', dataset: { testid } }, h('h2', { class: 'card-title' }, title), ...children);
}

function shortDate(iso: string): string {
  return fromIsoDate(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function longDate(iso: string): string {
  return fromIsoDate(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function renderStats(service: WorkoutService): HTMLElement {
  const weeks = service.weeks.get();
  const pref = service.stats.get();
  const today = toIsoDate(new Date());
  const range = statsRange(weeks, pref.mode, pref.weeks, today);
  const days = dayActivities(weeks);
  const weekly = weeklyActivity(weeks, range);
  const weights = bodyweightSeries(weeks, range);
  const durations = durationSeries(weeks, range);
  const summary = summarize(weekly, weights, durations);
  const unit = service.settings.get().unit;

  const openWeek = (weekId: string): void => {
    service.select(weekId);
    navigate(toolPath('workout'));
  };
  const openDay = (a: DayActivity | undefined): void => {
    if (a) openWeek(a.weekId);
  };

  const head = h(
    'div',
    { class: 'sess-head stats-head' },
    h('button', { class: 'btn btn-text btn-sm', dataset: { testid: 'stats-back' }, onClick: () => navigate(toolPath('workout')) }, svg(icons.back, 'icon icon-sm'), 'Log'),
    h('span', { class: 'sess-title' }, 'Stats'),
    renderRangeControl(service, pref),
  );

  const tiles = h(
    'div',
    { class: 'stats-tiles', dataset: { testid: 'stats-tiles' } },
    tile(String(summary.trained + summary.other), 'workouts', `${summary.trained} tracked · ${summary.other} other`),
    tile(fmtNum(summary.perWeek), 'per week', `${summary.weeks} week${summary.weeks === 1 ? '' : 's'}, ${summary.emptyWeeks} without`),
    tile(String(summary.sets), 'sets logged', ''),
    summary.weightDelta !== undefined ? tile(`${summary.weightDelta > 0 ? '+' : ''}${fmtNum(summary.weightDelta)} ${unit}`, 'bodyweight', `${weights[0]?.kg} → ${weights[weights.length - 1]?.kg} ${unit}`) : null,
    summary.avgMinutes !== undefined ? tile(`${summary.avgMinutes} min`, 'per workout', `${durations.length} timed`) : null,
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
        tiles,
        renderHeatmap(days, range, today, openDay),
        renderCalendar(days, today, openDay),
        renderDaysPerWeek(weekly, openWeek),
        renderExerciseCard(service, weeks, range, pref),
        renderBodyweight(weights, range, unit, days, openDay),
        renderDuration(durations, days, openDay),
      ),
    ),
  );
}

function tile(value: string, label: string, sub: string): HTMLElement {
  return h('div', { class: 'stats-tile' }, h('div', { class: 'stats-tile-value' }, value), h('div', { class: 'stats-tile-label' }, label), sub ? h('div', { class: 'stats-tile-sub muted' }, sub) : null);
}

// ---- Range ----------------------------------------------------------------------------

function renderRangeControl(service: WorkoutService, pref: StatsPref): HTMLElement {
  const seg = (mode: StatsPref['mode'], label: string): HTMLElement =>
    h(
      'button',
      {
        class: `seg${pref.mode === mode ? ' seg-active' : ''}`,
        role: 'radio',
        'aria-checked': String(pref.mode === mode),
        dataset: { testid: `stats-${mode}` },
        onClick: () => service.setStats({ mode }),
      },
      label,
    );
  const n = h('input', {
    type: 'number',
    class: 'input input-num wk-per',
    min: '1',
    max: '520',
    value: String(pref.weeks),
    'aria-label': 'Weeks to read from',
    dataset: { testid: 'stats-weeks' },
    onChange: () => service.setStats({ weeks: parseInt(n.value, 10), mode: 'last' }),
  });
  return h(
    'div',
    { class: 'wk-viewctl stats-range' },
    h('div', { class: 'segmented segmented-sm', role: 'radiogroup' }, seg('last', `Last ${pref.weeks} weeks`), seg('all', 'All')),
    pref.mode === 'last' ? h('label', { class: 'wk-per-label' }, 'weeks', n) : null,
  );
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
function renderHeatmap(days: Map<string, DayActivity>, range: StatsRange, today: string, open: (a: DayActivity | undefined) => void): HTMLElement {
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
        armed = ev.pointerType !== 'touch' || !tipHost.hidden && tipHost.dataset['date'] === date;
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
    h('span', { class: 'chart-legend-item' }, ...[1, 2, 3, 4].map((l) => h('span', { class: `chart-swatch hm-t${l}` })), 'tracked (sets)'),
    h('span', { class: 'chart-legend-item' }, h('span', { class: 'chart-swatch hm-other' }), 'other workout'),
  );
  return card('Activity', 'stats-heatmap', wrap, legend);
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
      h('div', { class: 'cal-grid' },
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
      h('span', { class: 'chart-legend-item' }, h('span', { class: 'chart-swatch', style: { background: COLOR.tracked } }), 'tracked'),
      h('span', { class: 'chart-legend-item' }, h('span', { class: 'chart-swatch', style: { background: COLOR.other } }), 'other workout'),
      h('span', { class: 'chart-legend-item' }, h('span', { class: 'chart-swatch cal-swatch-marked' }), 'marked off'),
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

function renderDaysPerWeek(weekly: ReturnType<typeof weeklyActivity>, openWeek: (id: string) => void): HTMLElement {
  const chart = barChart({
    testid: 'chart-days',
    categories: weekly.map((w) => ({ key: w.start, label: String(w.n), title: `Week ${w.n} · ${shortDate(w.start)}`, empty: w.tracked + w.other === 0, emptyText: w.empty ? 'no entry' : 'no workout' })),
    series: [
      { name: 'tracked', color: COLOR.tracked, values: weekly.map((w) => (w.empty ? undefined : w.tracked)) },
      { name: 'other', color: COLOR.other, values: weekly.map((w) => (w.empty ? undefined : w.other)) },
    ],
    stacked: true,
    yMax: Math.max(3, ...weekly.map((w) => w.tracked + w.other)) + 1,
    unit: 'days',
    emptyLabel: 'no workout',
    onSelect: (i) => {
      const w = weekly[i]?.weeks[0];
      if (w) openWeek(w.id);
    },
  });
  return card('Days per week', 'stats-days', chart.root);
}

// ---- Exercise progression ---------------------------------------------------------------

function renderExerciseCard(service: WorkoutService, weeks: Week[], range: StatsRange, pref: StatsPref): HTMLElement {
  const catalogue = exerciseCatalogue(weeks);
  if (!catalogue.length) return card('Exercise progression', 'stats-exercise', h('p', { class: 'muted' }, 'No exercises logged yet.'));
  const exId = catalogue.some((e) => e.id === pref.exercise) ? (pref.exercise as string) : catalogue[0]!.id;
  const metric: ExerciseMetric = EXERCISE_METRICS.some((m) => m.id === pref.metric) ? (pref.metric as ExerciseMetric) : 'best';
  const select = h('select', { class: 'input stats-select', dataset: { testid: 'stats-exercise-select' } }, ...catalogue.map((e) => h('option', { value: e.id }, `${e.name} (${e.weeks} wk)`)));
  select.value = exId;
  select.addEventListener('change', () => service.setStats({ exercise: select.value }));
  const metrics = h(
    'div',
    { class: 'segmented segmented-xs', role: 'radiogroup' },
    ...EXERCISE_METRICS.map((m) =>
      h('button', { class: `seg${m.id === metric ? ' seg-active' : ''}`, role: 'radio', 'aria-checked': String(m.id === metric), dataset: { testid: `stats-metric-${m.id}` }, onClick: () => service.setStats({ metric: m.id }) }, m.label),
    ),
  );
  const rows = exerciseProgress(weeks, exId, range);
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
    emptyLabel: 'not done',
    title: (x) => {
      const r = rows[x];
      return r ? `Week ${r.n} · ${shortDate(r.start)}` : '';
    },
    onSelect: (x) => {
      const w = rows[x]?.weeks[0];
      if (w) {
        service.select(w.id);
        navigate(toolPath('workout'));
      }
    },
  });
  return card(
    'Exercise progression',
    'stats-exercise',
    h('div', { class: 'stats-controls' }, select, metrics),
    points.length ? chart.root : h('p', { class: 'muted' }, `Nothing logged for ${info.name} in this range.`),
    timedNote,
    skipped ? h('p', { class: 'muted stats-note' }, `Shaded: weeks without this exercise (${skipped} of them planned but not done).`) : null,
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

function renderBodyweight(weights: ReturnType<typeof bodyweightSeries>, range: StatsRange, unit: string, days: Map<string, DayActivity>, open: (a: DayActivity | undefined) => void): HTMLElement {
  if (!weights.length) return card('Bodyweight', 'stats-weight', h('p', { class: 'muted' }, 'No bodyweight logged in this range.'));
  const total = dayIndex(addDays(range.to, 6), range.from);
  const chart = lineChart({
    testid: 'chart-weight',
    xMin: 0,
    xMax: total,
    xTicks: dateTicks(range),
    series: [{ name: `Bodyweight (${unit})`, color: COLOR.line, points: weights.map((p) => ({ x: dayIndex(p.date, range.from), y: p.kg })) }],
    gap: 21,
    unit,
    format: (v) => fmtNum(v),
    title: (x) => longDate(addDays(range.from, x)),
    onSelect: (x) => open(days.get(addDays(range.from, x))),
  });
  return card('Bodyweight', 'stats-weight', chart.root, h('p', { class: 'muted stats-note' }, 'Gaps longer than three weeks are left open.'));
}

// ---- Duration ------------------------------------------------------------------------------

function renderDuration(durations: DayActivity[], days: Map<string, DayActivity>, open: (a: DayActivity | undefined) => void): HTMLElement {
  if (!durations.length) {
    return card('Workout duration', 'stats-duration', h('p', { class: 'muted' }, 'Nothing timed yet. Log a workout through Workout mode and its length (rest included, every +30 s counted) lands here.'));
  }
  const chart = barChart({
    testid: 'chart-duration',
    categories: durations.map((d) => ({ key: d.date, label: shortDate(d.date), title: `${longDate(d.date)} · ${d.weekLabel}` })),
    series: [
      { name: 'working', color: COLOR.tracked, values: durations.map((d) => Math.max(0, (d.minutes ?? 0) - (d.restMinutes ?? 0)) || undefined) },
      { name: 'rest', color: 'var(--chart-1)', values: durations.map((d) => d.restMinutes || undefined) },
    ],
    stacked: true,
    yAtLeast: 30,
    unit: 'min',
    onSelect: (i) => open(days.get(durations[i]?.date ?? '')),
  });
  return card('Workout duration', 'stats-duration', chart.root, h('p', { class: 'muted stats-note' }, 'From the first set typed in Workout mode to the last set or countdown; rest is what the countdowns actually ran.'));
}
