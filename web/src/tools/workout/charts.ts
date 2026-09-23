// Small hand-rolled SVG charts for the stats page: bars over categories
// (calendar weeks) and lines over a numeric x (weeks or days). No library —
// the app is dependency-free — so this keeps to what the stats need: thin
// marks, a hairline grid, one y axis, markers big enough to tap, and a
// tooltip that follows the pointer (crosshair on line charts). Every chart
// re-draws itself to the width it gets (ResizeObserver), so it works from a
// phone to a wide screen without scaling text.

import { h, replace, type Child } from '../../core/dom.js';

const NS = 'http://www.w3.org/2000/svg';

/** SVG element builder (attributes as given; `class` works). */
export function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number | undefined> = {}, ...children: (SVGElement | string)[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) el.setAttribute(k, String(v));
  for (const c of children) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  return el;
}

export interface TipApi {
  /** Show the tooltip near (x, y) in the plot's pixel space. */
  show(x: number, y: number, content: Child): void;
  hide(): void;
}

export interface LegendItem {
  name: string;
  color: string;
  /** Draw the swatch as a line instead of a square. */
  line?: boolean;
}

export interface ChartHost {
  root: HTMLElement;
  /** Draw again (data changed). */
  redraw(): void;
}

/**
 * The frame every chart shares: legend (when ≥ 2 items), the plot, the
 * tooltip. `build` is called with the current width whenever it changes.
 */
export function chartHost(opts: { height: number; legend?: LegendItem[]; testid?: string; build: (width: number, tip: TipApi) => SVGSVGElement }): ChartHost {
  const plot = h('div', { class: 'chart-plot' });
  const tipEl = h('div', { class: 'chart-tip', hidden: true });
  const root = h('div', { class: 'chart', dataset: opts.testid ? { testid: opts.testid } : undefined });
  if (opts.legend && opts.legend.length > 1) {
    root.appendChild(
      h(
        'div',
        { class: 'chart-legend' },
        ...opts.legend.map((l) => h('span', { class: 'chart-legend-item' }, h('span', { class: `chart-swatch${l.line ? ' chart-swatch-line' : ''}`, style: { background: l.color } }), l.name)),
      ),
    );
  }
  root.appendChild(plot);
  root.appendChild(tipEl);
  const tip: TipApi = {
    show: (x, y, content) => {
      replace(tipEl, content);
      tipEl.hidden = false;
      const w = plot.clientWidth;
      const tw = tipEl.offsetWidth;
      const left = Math.max(0, Math.min(w - tw, x - tw / 2));
      tipEl.style.left = `${left}px`;
      tipEl.style.top = `${Math.max(0, y - tipEl.offsetHeight - 12)}px`;
    },
    hide: () => {
      tipEl.hidden = true;
    },
  };
  let width = 0;
  const draw = (): void => {
    const w = Math.max(160, Math.floor(plot.clientWidth || root.clientWidth || 320));
    width = w;
    tip.hide();
    replace(plot, opts.build(w, tip));
  };
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => {
      const w = Math.floor(plot.clientWidth);
      if (w && Math.abs(w - width) > 2) draw();
    });
    ro.observe(plot);
  }
  // First draw once the element has a size (next frame after being attached).
  requestAnimationFrame(draw);
  return { root, redraw: draw };
}

// ---- Scales -----------------------------------------------------------------------

/** "Nice" ticks covering [min, max] (about `count` of them); the range is widened to the ticks. */
export function niceTicks(min: number, max: number, count = 4): { ticks: number[]; min: number; max: number } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { ticks: [0, 1], min: 0, max: 1 };
  if (max - min < 1e-9) {
    max = min + 1;
  }
  const raw = (max - min) / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { ticks, min: lo, max: hi };
}

export function fmtNum(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10);
}

/** "3 days", "1 day", "12 reps", "45 min". */
export function withUnit(v: number, unit: string | undefined): string {
  if (!unit) return fmtNum(v);
  const singular = v === 1 && /^[a-z]+s$/.test(unit) ? unit.slice(0, -1) : unit;
  return `${fmtNum(v)} ${singular}`;
}

const MARGIN = { top: 10, right: 12, bottom: 26, left: 36 };

function frame(width: number, height: number, ticks: number[], yPos: (v: number) => number, format: (v: number) => string, extra?: (g: SVGGElement) => void): SVGSVGElement {
  const svg = s('svg', { class: 'chart-svg', width, height, viewBox: `0 0 ${width} ${height}`, role: 'img' });
  const grid = s('g', { class: 'chart-grid' });
  for (const t of ticks) {
    const y = yPos(t);
    grid.appendChild(s('line', { x1: MARGIN.left, x2: width - MARGIN.right, y1: y, y2: y, class: 'chart-gridline' }));
    grid.appendChild(s('text', { x: MARGIN.left - 6, y: y + 3.5, class: 'chart-ylabel', 'text-anchor': 'end' }, format(t)));
  }
  svg.appendChild(grid);
  if (extra) extra(grid);
  return svg;
}

/** Which category labels to draw so they stay ≥ `minGap` px apart. */
function labelEvery(slotWidth: number, minGap: number): number {
  return Math.max(1, Math.ceil(minGap / Math.max(1, slotWidth)));
}

// ---- Bar chart --------------------------------------------------------------------

export interface BarCategory {
  key: string;
  /** Axis label. */
  label: string;
  /** Tooltip title. */
  title: string;
  /** Nothing logged for this slot: drawn as a faint red column so the gap is visible. */
  empty?: boolean;
  /** What the tooltip says for an empty slot (default: the chart's emptyLabel). */
  emptyText?: string;
}

export interface BarSeries {
  name: string;
  color: string;
  values: (number | undefined)[];
}

export interface BarChartOpts {
  categories: BarCategory[];
  series: BarSeries[];
  stacked?: boolean;
  /** Fixed top of the y axis (e.g. 7 days). */
  yMax?: number;
  /** The axis reaches at least this high, so a few small values do not get decimal ticks. */
  yAtLeast?: number;
  /** Text after the value in tooltips. */
  unit?: string;
  height?: number;
  testid?: string;
  emptyLabel?: string;
  onSelect?: (index: number) => void;
}

export function barChart(opts: BarChartOpts): ChartHost {
  const height = opts.height ?? 180;
  const legend: LegendItem[] = opts.series.map((se) => ({ name: se.name, color: se.color }));
  if (opts.categories.some((c) => c.empty)) legend.push({ name: opts.emptyLabel ?? 'no entry', color: 'var(--chart-empty)' });
  return chartHost({
    height,
    legend,
    testid: opts.testid,
    build: (width, tip) => {
      const n = opts.categories.length;
      const totals = opts.categories.map((_c, i) => (opts.stacked ? opts.series.reduce((a, se) => a + (se.values[i] ?? 0), 0) : Math.max(0, ...opts.series.map((se) => se.values[i] ?? 0))));
      const dataMax = Math.max(0, ...totals);
      const { ticks, max } = opts.yMax !== undefined ? { ticks: niceTicks(0, opts.yMax, 4).ticks.filter((t) => t <= opts.yMax!), max: opts.yMax } : niceTicks(0, Math.max(dataMax, opts.yAtLeast ?? 1), 4);
      const plotW = width - MARGIN.left - MARGIN.right;
      const plotH = height - MARGIN.top - MARGIN.bottom;
      const yPos = (v: number): number => MARGIN.top + plotH - (v / (max || 1)) * plotH;
      const slot = plotW / Math.max(1, n);
      const svg = frame(width, height, ticks, yPos, fmtNum);
      const baseY = yPos(0);
      const every = labelEvery(slot, 30);
      const bars = s('g');
      const groupW = Math.max(2, slot - 2);
      const perBar = opts.stacked ? groupW : Math.max(1, (groupW - 2 * (opts.series.length - 1)) / opts.series.length);
      opts.categories.forEach((c, i) => {
        const x0 = MARGIN.left + i * slot + 1;
        if (c.empty) {
          bars.appendChild(s('rect', { x: MARGIN.left + i * slot, y: MARGIN.top, width: slot, height: plotH, class: 'chart-empty-col' }));
          bars.appendChild(s('rect', { x: x0, y: baseY - 2, width: groupW, height: 2, class: 'chart-empty-tick' }));
        }
        let stackTop = baseY;
        opts.series.forEach((se, k) => {
          const v = se.values[i];
          if (!v) return;
          const hgt = Math.max(1, baseY - yPos(v));
          if (opts.stacked) {
            const gap = stackTop < baseY ? 2 : 0;
            const y = stackTop - gap - hgt;
            bars.appendChild(s('rect', { x: x0, y, width: groupW, height: hgt, rx: Math.min(3, groupW / 2), fill: se.color, class: 'chart-bar' }));
            stackTop = y;
          } else {
            const x = x0 + k * (perBar + 2);
            bars.appendChild(s('rect', { x, y: baseY - hgt, width: perBar, height: hgt, rx: Math.min(3, perBar / 2), fill: se.color, class: 'chart-bar' }));
          }
        });
        if (i % every === 0 || (every > 1 && i === n - 1 && (n - 1) % every > every / 2)) {
          svg.appendChild(s('text', { x: x0 + groupW / 2, y: height - 8, class: 'chart-xlabel', 'text-anchor': 'middle' }, c.label));
        }
      });
      svg.appendChild(bars);
      svg.appendChild(s('line', { x1: MARGIN.left, x2: width - MARGIN.right, y1: baseY, y2: baseY, class: 'chart-baseline' }));
      // hover: one wide hit area per category
      const hover = s('rect', { x: 0, y: 0, width: 0, height: plotH, class: 'chart-hover-col', visibility: 'hidden' });
      svg.appendChild(hover);
      const at = (ev: PointerEvent): number => {
        const r = svg.getBoundingClientRect();
        const x = ev.clientX - r.left - MARGIN.left;
        return Math.max(0, Math.min(n - 1, Math.floor(x / slot)));
      };
      let shown = -1;
      const show = (i: number): void => {
        const c = opts.categories[i];
        if (!c) return;
        shown = i;
        hover.setAttribute('x', String(MARGIN.left + i * slot));
        hover.setAttribute('y', String(MARGIN.top));
        hover.setAttribute('width', String(slot));
        hover.setAttribute('visibility', 'visible');
        const rows = opts.series.map((se) => {
          const v = se.values[i];
          return h('div', { class: 'chart-tip-row' }, h('span', { class: 'chart-swatch', style: { background: se.color } }), h('span', null, se.name), h('b', null, v === undefined ? '–' : withUnit(v, opts.unit)));
        });
        tip.show(MARGIN.left + (i + 0.5) * slot, yPos(totals[i] ?? 0), [h('div', { class: 'chart-tip-title' }, c.title), c.empty ? h('div', { class: 'chart-tip-row muted' }, c.emptyText ?? opts.emptyLabel ?? 'no entry') : rows]);
      };
      // Touch: the first tap shows the tooltip, a second tap on the same column selects it.
      let armed = false;
      svg.addEventListener('pointermove', (ev) => {
        const i = at(ev);
        if (i !== shown) show(i);
      });
      svg.addEventListener('pointerdown', (ev) => {
        const i = at(ev);
        armed = ev.pointerType !== 'touch' || i === shown;
        show(i);
      });
      svg.addEventListener('pointerleave', (ev) => {
        if (ev.pointerType === 'touch') return; // a finger "leaves" right after the tap; keep the tooltip
        shown = -1;
        hover.setAttribute('visibility', 'hidden');
        tip.hide();
      });
      if (opts.onSelect) {
        svg.style.cursor = 'pointer';
        svg.addEventListener('click', (ev) => {
          if (armed) opts.onSelect?.(at(ev as PointerEvent));
        });
      }
      return svg;
    },
  });
}

// ---- Line chart ---------------------------------------------------------------------

export interface LinePoint {
  x: number;
  y: number;
  /** Extra tooltip line for this point. */
  note?: string;
}

export interface LineSeries {
  name: string;
  color: string;
  points: LinePoint[];
}

export interface LineChartOpts {
  xMin: number;
  xMax: number;
  xTicks: { x: number; label: string }[];
  /** Columns to shade as "nothing here" (x0..x1 in x units). */
  xBands?: { x0: number; x1: number }[];
  /** Ranges to mark on the plot, e.g. weeks the exercise was planned but skipped. */
  series: LineSeries[];
  /** Points further apart than this (x units) are not joined. */
  gap?: number;
  /** Start the y axis at zero (bars-like readings); else fit to the data. */
  zero?: boolean;
  unit?: string;
  format?: (v: number) => string;
  height?: number;
  testid?: string;
  /** Tooltip title for an x value. */
  title: (x: number) => string;
  emptyLabel?: string;
  onSelect?: (x: number) => void;
}

export function lineChart(opts: LineChartOpts): ChartHost {
  const height = opts.height ?? 200;
  const format = opts.format ?? fmtNum;
  const legend: LegendItem[] = opts.series.map((se) => ({ name: se.name, color: se.color, line: true }));
  if (opts.xBands?.length) legend.push({ name: opts.emptyLabel ?? 'no entry', color: 'var(--chart-empty)' });
  return chartHost({
    height,
    legend,
    testid: opts.testid,
    build: (width, tip) => {
      const ys = opts.series.flatMap((se) => se.points.map((p) => p.y));
      const dataMin = ys.length ? Math.min(...ys) : 0;
      const dataMax = ys.length ? Math.max(...ys) : 1;
      const pad = opts.zero ? 0 : (dataMax - dataMin || 1) * 0.15;
      const { ticks, min, max } = niceTicks(opts.zero ? 0 : dataMin - pad, dataMax + pad, 4);
      const plotW = width - MARGIN.left - MARGIN.right;
      const plotH = height - MARGIN.top - MARGIN.bottom;
      const span = Math.max(1e-9, opts.xMax - opts.xMin);
      const xPos = (x: number): number => MARGIN.left + ((x - opts.xMin) / span) * plotW;
      const yPos = (v: number): number => MARGIN.top + plotH - ((v - min) / (max - min || 1)) * plotH;
      const svg = frame(width, height, ticks, yPos, format);
      for (const b of opts.xBands ?? []) {
        const x0 = xPos(Math.max(opts.xMin, b.x0));
        const x1 = xPos(Math.min(opts.xMax, b.x1));
        svg.appendChild(s('rect', { x: x0, y: MARGIN.top, width: Math.max(1, x1 - x0), height: plotH, class: 'chart-empty-col' }));
      }
      // x labels, thinned to the space available
      const labelW = 34;
      const tickCount = opts.xTicks.length;
      const every = tickCount > 1 ? labelEvery(plotW / (tickCount - 1), labelW) : 1;
      opts.xTicks.forEach((t, i) => {
        if (i % every !== 0) return;
        svg.appendChild(s('text', { x: xPos(t.x), y: height - 8, class: 'chart-xlabel', 'text-anchor': 'middle' }, t.label));
      });
      svg.appendChild(s('line', { x1: MARGIN.left, x2: width - MARGIN.right, y1: MARGIN.top + plotH, y2: MARGIN.top + plotH, class: 'chart-baseline' }));
      // lines and markers (smaller when points crowd: dense series read as a line)
      const markers: { x: number; y: number; el: SVGCircleElement; series: LineSeries; p: LinePoint }[] = [];
      const densest = Math.max(1, ...opts.series.map((se) => se.points.length));
      const radius = plotW / densest < 12 ? 2.5 : 4;
      for (const se of opts.series) {
        const pts = [...se.points].sort((a, b) => a.x - b.x);
        let d = '';
        let prev: LinePoint | undefined;
        for (const p of pts) {
          const joined = prev && (opts.gap === undefined || p.x - prev.x <= opts.gap);
          d += `${joined ? 'L' : 'M'}${xPos(p.x).toFixed(1)},${yPos(p.y).toFixed(1)} `;
          prev = p;
        }
        if (d) svg.appendChild(s('path', { d: d.trim(), class: 'chart-line', stroke: se.color }));
        for (const p of pts) {
          const el = s('circle', { cx: xPos(p.x), cy: yPos(p.y), r: radius, class: 'chart-marker', fill: se.color });
          svg.appendChild(el);
          markers.push({ x: xPos(p.x), y: yPos(p.y), el, series: se, p });
        }
      }
      // crosshair + tooltip on the nearest x
      const cross = s('line', { x1: 0, x2: 0, y1: MARGIN.top, y2: MARGIN.top + plotH, class: 'chart-crosshair', visibility: 'hidden' });
      svg.appendChild(cross);
      let shownX: number | undefined;
      const nearest = (ev: PointerEvent): number | undefined => {
        if (!markers.length) return undefined;
        const r = svg.getBoundingClientRect();
        const px = ev.clientX - r.left;
        let best = markers[0]!;
        for (const m of markers) if (Math.abs(m.x - px) < Math.abs(best.x - px)) best = m;
        return best.p.x;
      };
      const show = (x: number): void => {
        shownX = x;
        const at = markers.filter((m) => m.p.x === x);
        for (const m of markers) m.el.setAttribute('r', m.p.x === x ? '6' : String(radius));
        const px = xPos(x);
        cross.setAttribute('x1', String(px));
        cross.setAttribute('x2', String(px));
        cross.setAttribute('visibility', 'visible');
        const rows = at.map((m) =>
          h(
            'div',
            { class: 'chart-tip-row' },
            h('span', { class: 'chart-swatch', style: { background: m.series.color } }),
            h('span', null, m.series.name),
            h('b', null, opts.format ? `${format(m.p.y)}${opts.unit ? ` ${opts.unit}` : ''}` : withUnit(m.p.y, opts.unit)),
            m.p.note ? h('span', { class: 'muted' }, m.p.note) : null,
          ),
        );
        tip.show(px, Math.min(...at.map((m) => m.y)), [h('div', { class: 'chart-tip-title' }, opts.title(x)), rows]);
      };
      let armed = false;
      svg.addEventListener('pointermove', (ev) => {
        const x = nearest(ev);
        if (x !== undefined && x !== shownX) show(x);
      });
      svg.addEventListener('pointerdown', (ev) => {
        const x = nearest(ev);
        armed = ev.pointerType !== 'touch' || x === shownX;
        if (x !== undefined) show(x);
      });
      svg.addEventListener('pointerleave', (ev) => {
        if (ev.pointerType === 'touch') return;
        shownX = undefined;
        cross.setAttribute('visibility', 'hidden');
        for (const m of markers) m.el.setAttribute('r', String(radius));
        tip.hide();
      });
      if (opts.onSelect) {
        svg.style.cursor = 'pointer';
        svg.addEventListener('click', (ev) => {
          const x = nearest(ev as PointerEvent);
          if (x !== undefined && armed) opts.onSelect?.(x);
        });
      }
      return svg;
    },
  });
}
