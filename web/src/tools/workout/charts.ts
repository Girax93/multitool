// Small hand-rolled SVG charts for the stats page: bars over categories
// (calendar weeks), lines over a numeric x (weeks or days) and donuts for
// shares. No library — the app is dependency-free — so this keeps to what
// the stats need: thin marks, a hairline grid, one y axis with its unit
// written on it, an x-axis title, markers big enough to tap, a tooltip that
// follows the pointer (crosshair on line charts), and zoom / pan along x for
// the long ranges (buttons, mouse wheel, pinch, drag). Every chart re-draws
// itself to the width it gets (ResizeObserver), so it works from a phone to
// a wide screen without scaling text.

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

/** The part of the x domain on screen (zoom / pan), in the chart's x units. */
export interface View {
  a: number;
  b: number;
}

/** What the gesture layer tells a build: a drag just happened, so the click that follows is not a select. */
export interface Gesture {
  dragged: boolean;
}

export interface ChartHost {
  root: HTMLElement;
  /** Draw again (data changed). */
  redraw(): void;
}

export interface HostOpts {
  height: number;
  legend?: LegendItem[];
  testid?: string;
  /** Written under the x axis ("Week number", "Date"). */
  xLabel?: string;
  /** Written above the y axis ("days", "kg"). */
  yLabel?: string;
  /** Zoomable x domain; without it the chart is static. */
  domain?: { min: number; max: number; minSpan: number };
  /** "weeks 60–86": what the current view covers, shown next to the zoom buttons. */
  viewLabel?: (view: View) => string;
  build: (width: number, tip: TipApi, view: View, gesture: Gesture) => SVGSVGElement;
}

const ZOOM_STEP = 0.6;

/**
 * The frame every chart shares: legend (when ≥ 2 items), zoom buttons (when
 * the chart has a domain), the plot, the tooltip. `build` is called with the
 * current width and view whenever either changes.
 */
export function chartHost(opts: HostOpts): ChartHost {
  const plot = h('div', { class: 'chart-plot' });
  const tipEl = h('div', { class: 'chart-tip', hidden: true });
  const root = h('div', { class: 'chart', dataset: opts.testid ? { testid: opts.testid } : undefined });
  const head = h('div', { class: 'chart-head' });
  if (opts.legend && opts.legend.length > 1) {
    head.appendChild(
      h(
        'div',
        { class: 'chart-legend' },
        ...opts.legend.map((l) => h('span', { class: 'chart-legend-item' }, h('span', { class: `chart-swatch${l.line ? ' chart-swatch-line' : ''}`, style: { background: l.color } }), l.name)),
      ),
    );
  }
  const domain = opts.domain;
  const full: View = domain ? { a: domain.min, b: domain.max } : { a: 0, b: 1 };
  let view: View = { ...full };
  const gesture: Gesture = { dragged: false };
  const hint = h('span', { class: 'chart-view-hint muted' });
  const zoomBtn = (label: string, title: string, testid: string, onClick: () => void): HTMLElement =>
    h('button', { type: 'button', class: 'iconbtn iconbtn-sm chart-zoom-btn', title, 'aria-label': title, dataset: { testid }, onClick }, label);
  const tools = domain
    ? h(
        'div',
        { class: 'chart-tools' },
        hint,
        zoomBtn('−', 'Zoom out', 'chart-zoom-out', () => zoomBy(1 / ZOOM_STEP, 0.5)),
        zoomBtn('+', 'Zoom in', 'chart-zoom-in', () => zoomBy(ZOOM_STEP, 0.5)),
        zoomBtn('⟲', 'Show everything', 'chart-zoom-reset', () => setView({ ...full })),
      )
    : null;
  if (tools) head.appendChild(tools);
  if (head.childElementCount) root.appendChild(head);
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
      tipEl.style.top = `${Math.max(0, y + plot.offsetTop - tipEl.offsetHeight - 12)}px`;
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
    replace(plot, opts.build(w, tip, view, gesture));
    if (domain) {
      const zoomed = view.a > full.a + 1e-9 || view.b < full.b - 1e-9;
      hint.textContent = opts.viewLabel ? opts.viewLabel(view) : '';
      root.classList.toggle('chart-zoomed', zoomed);
    }
  };
  const setView = (next: View): void => {
    if (!domain) return;
    let a = next.a;
    let b = next.b;
    const span = Math.max(domain.minSpan, Math.min(full.b - full.a, b - a));
    if (a < full.a) {
      a = full.a;
      b = a + span;
    }
    if (b > full.b) {
      b = full.b;
      a = b - span;
    }
    if (b - a !== span) b = a + span;
    if (Math.abs(a - view.a) < 1e-9 && Math.abs(b - view.b) < 1e-9) return;
    view = { a, b };
    draw();
  };
  /** Scale the visible span by `factor` keeping the point at fraction `at` (0..1 across the plot) in place. */
  const zoomBy = (factor: number, at: number): void => {
    if (!domain) return;
    const span = view.b - view.a;
    const nextSpan = span * factor;
    const pivot = view.a + span * at;
    setView({ a: pivot - nextSpan * at, b: pivot + nextSpan * (1 - at) });
  };

  if (domain) {
    // Ctrl + wheel (a trackpad pinch arrives the same way) zooms around the
    // pointer — a plain wheel keeps scrolling the page; drag pans; two fingers pinch.
    plot.addEventListener(
      'wheel',
      (ev: WheelEvent) => {
        if (!ev.ctrlKey && !ev.metaKey) return;
        const r = plot.getBoundingClientRect();
        const at = Math.max(0, Math.min(1, (ev.clientX - r.left - MARGIN.left) / Math.max(1, r.width - MARGIN.left - MARGIN.right)));
        ev.preventDefault();
        zoomBy(ev.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, at);
      },
      { passive: false },
    );
    const pointers = new Map<number, { x: number; y: number }>();
    let dragStart: { x: number; view: View } | undefined;
    let pinchStart: { dist: number; mid: number; view: View } | undefined;
    plot.addEventListener('pointerdown', (ev) => {
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      gesture.dragged = false;
      if (pointers.size === 1) dragStart = { x: ev.clientX, view: { ...view } };
      else if (pointers.size === 2) {
        const [p, q] = [...pointers.values()];
        if (p && q) {
          const r = plot.getBoundingClientRect();
          pinchStart = { dist: Math.max(1, Math.abs(p.x - q.x)), mid: ((p.x + q.x) / 2 - r.left - MARGIN.left) / Math.max(1, r.width - MARGIN.left - MARGIN.right), view: { ...view } };
          dragStart = undefined;
        }
      }
    });
    plot.addEventListener('pointermove', (ev) => {
      if (!pointers.has(ev.pointerId)) return;
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pointers.size === 2 && pinchStart) {
        const [p, q] = [...pointers.values()];
        if (!p || !q) return;
        const dist = Math.max(1, Math.abs(p.x - q.x));
        const span0 = pinchStart.view.b - pinchStart.view.a;
        const span = span0 * (pinchStart.dist / dist);
        const pivot = pinchStart.view.a + span0 * pinchStart.mid;
        gesture.dragged = true;
        setView({ a: pivot - span * pinchStart.mid, b: pivot + span * (1 - pinchStart.mid) });
        return;
      }
      if (pointers.size === 1 && dragStart) {
        const dx = ev.clientX - dragStart.x;
        if (!gesture.dragged && Math.abs(dx) < 6) return;
        gesture.dragged = true;
        const shift = -dx * ((dragStart.view.b - dragStart.view.a) / Math.max(1, plot.clientWidth - MARGIN.left - MARGIN.right));
        setView({ a: dragStart.view.a + shift, b: dragStart.view.b + shift });
      }
    });
    const end = (ev: PointerEvent): void => {
      pointers.delete(ev.pointerId);
      if (pointers.size < 2) pinchStart = undefined;
      if (pointers.size === 0) dragStart = undefined;
      else if (pointers.size === 1) {
        const [p] = [...pointers.values()];
        if (p) dragStart = { x: p.x, view: { ...view } };
      }
    };
    plot.addEventListener('pointerup', end);
    plot.addEventListener('pointercancel', end);
    plot.classList.add('chart-plot-zoomable');
  }

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
  if (Math.abs(v) >= 10000) return `${Math.round(v / 100) / 10}k`;
  if (Math.abs(v) >= 100) return String(Math.round(v));
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10);
}

/** "3 days", "1 day", "12 reps", "45 min". */
export function withUnit(v: number, unit: string | undefined): string {
  if (!unit) return fmtNum(v);
  const singular = v === 1 && /^[a-z]+s$/.test(unit) ? unit.slice(0, -1) : unit;
  return `${fmtNum(v)} ${singular}`;
}

const MARGIN = { top: 22, right: 12, bottom: 40, left: 40 };

interface Frame {
  svg: SVGSVGElement;
  /** Everything drawn inside this group is clipped to the plot area. */
  plot: SVGGElement;
  /** Tick labels: clipped a little wider than the plot. */
  labels: SVGGElement;
  plotW: number;
  plotH: number;
}

let clipSeq = 0;

function frame(width: number, height: number, ticks: number[], yPos: (v: number) => number, format: (v: number) => string, labels: { x?: string; y?: string }): Frame {
  const svg = s('svg', { class: 'chart-svg', width, height, viewBox: `0 0 ${width} ${height}`, role: 'img' });
  const plotW = width - MARGIN.left - MARGIN.right;
  const plotH = height - MARGIN.top - MARGIN.bottom;
  const grid = s('g', { class: 'chart-grid' });
  for (const t of ticks) {
    const y = yPos(t);
    grid.appendChild(s('line', { x1: MARGIN.left, x2: width - MARGIN.right, y1: y, y2: y, class: 'chart-gridline' }));
    grid.appendChild(s('text', { x: MARGIN.left - 6, y: y + 3.5, class: 'chart-ylabel', 'text-anchor': 'end' }, format(t)));
  }
  svg.appendChild(grid);
  if (labels.y) svg.appendChild(s('text', { x: 2, y: MARGIN.top - 9, class: 'chart-axis-title', 'text-anchor': 'start' }, labels.y));
  if (labels.x) svg.appendChild(s('text', { x: MARGIN.left + plotW / 2, y: height - 6, class: 'chart-axis-title', 'text-anchor': 'middle' }, labels.x));
  const id = `chart-clip-${++clipSeq}`;
  // marks are clipped to the plot's left and right edges (panned-out bars vanish at the axis);
  // tick labels get a little more room so the first and last are not cut in half
  svg.appendChild(
    s('defs', {}, s('clipPath', { id }, s('rect', { x: MARGIN.left, y: 0, width: plotW, height })), s('clipPath', { id: `${id}-labels` }, s('rect', { x: MARGIN.left - 18, y: 0, width: plotW + 36, height }))),
  );
  const plot = s('g', { 'clip-path': `url(#${id})` });
  const labelsG = s('g', { 'clip-path': `url(#${id}-labels)` });
  svg.appendChild(plot);
  svg.appendChild(labelsG);
  return { svg, plot, labels: labelsG, plotW, plotH };
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
  /** Bars never grow wider than this (a chart with two categories would otherwise be two slabs). */
  maxBarWidth?: number;
  xLabel?: string;
  yLabel?: string;
  height?: number;
  testid?: string;
  emptyLabel?: string;
  /** Zoom / pan along the categories when there are more than this many. */
  zoomFrom?: number;
  /** "weeks 60–86" for the zoom hint, from the first and last visible category. */
  viewLabel?: (first: BarCategory, last: BarCategory) => string;
  onSelect?: (index: number) => void;
}

export function barChart(opts: BarChartOpts): ChartHost {
  const height = opts.height ?? 200;
  const legend: LegendItem[] = opts.series.map((se) => ({ name: se.name, color: se.color }));
  if (opts.categories.some((c) => c.empty)) legend.push({ name: opts.emptyLabel ?? 'no entry', color: 'var(--chart-empty)' });
  const n = opts.categories.length;
  const zoomable = n > (opts.zoomFrom ?? 20);
  return chartHost({
    height,
    legend,
    testid: opts.testid,
    xLabel: opts.xLabel,
    yLabel: opts.yLabel,
    domain: zoomable ? { min: 0, max: n, minSpan: Math.min(n, 4) } : undefined,
    viewLabel: (v) => {
      const first = opts.categories[Math.max(0, Math.floor(v.a))];
      const last = opts.categories[Math.min(n - 1, Math.ceil(v.b) - 1)];
      return first && last && opts.viewLabel ? opts.viewLabel(first, last) : '';
    },
    build: (width, tip, view, gesture) => {
      const totals = opts.categories.map((_c, i) => (opts.stacked ? opts.series.reduce((a, se) => a + (se.values[i] ?? 0), 0) : Math.max(0, ...opts.series.map((se) => se.values[i] ?? 0))));
      const a = zoomable ? view.a : 0;
      const b = zoomable ? view.b : n;
      // the axis fits what is on screen
      const visible = totals.filter((_t, i) => i + 1 > a && i < b);
      const dataMax = Math.max(0, ...visible);
      const { ticks, max } = opts.yMax !== undefined ? { ticks: niceTicks(0, opts.yMax, 4).ticks.filter((t) => t <= opts.yMax!), max: opts.yMax } : niceTicks(0, Math.max(dataMax, opts.yAtLeast ?? 1), 4);
      const plotH = height - MARGIN.top - MARGIN.bottom;
      const yPos = (v: number): number => MARGIN.top + plotH - (v / (max || 1)) * plotH;
      const fr = frame(width, height, ticks, yPos, fmtNum, { x: opts.xLabel, y: opts.yLabel });
      const { svg, plot, labels, plotW } = fr;
      const slot = plotW / Math.max(1e-9, b - a);
      const xOf = (i: number): number => MARGIN.left + (i - a) * slot;
      const baseY = yPos(0);
      const every = labelEvery(slot, 30);
      const bars = s('g');
      const groupW = Math.min(opts.maxBarWidth ?? Infinity, Math.max(2, slot - 2));
      const perBar = opts.stacked ? groupW : Math.max(1, (groupW - 2 * (opts.series.length - 1)) / opts.series.length);
      opts.categories.forEach((c, i) => {
        if (i + 1 < a - 1 || i > b + 1) return;
        const x0 = xOf(i) + 1 + (slot - 2 - groupW) / 2; // centred in its slot when capped
        if (c.empty) {
          bars.appendChild(s('rect', { x: xOf(i), y: MARGIN.top, width: slot, height: plotH, class: 'chart-empty-col' }));
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
          labels.appendChild(s('text', { x: x0 + groupW / 2, y: MARGIN.top + plotH + 16, class: 'chart-xlabel', 'text-anchor': 'middle' }, c.label));
        }
      });
      plot.appendChild(bars);
      svg.appendChild(s('line', { x1: MARGIN.left, x2: width - MARGIN.right, y1: baseY, y2: baseY, class: 'chart-baseline' }));
      // hover: one wide hit area per category
      const hover = s('rect', { x: 0, y: 0, width: 0, height: plotH, class: 'chart-hover-col', visibility: 'hidden' });
      plot.appendChild(hover);
      const at = (ev: PointerEvent): number => {
        const r = svg.getBoundingClientRect();
        const x = ev.clientX - r.left - MARGIN.left;
        return Math.max(0, Math.min(n - 1, Math.floor(a + x / slot)));
      };
      let shown = -1;
      const show = (i: number): void => {
        const c = opts.categories[i];
        if (!c) return;
        shown = i;
        hover.setAttribute('x', String(xOf(i)));
        hover.setAttribute('y', String(MARGIN.top));
        hover.setAttribute('width', String(slot));
        hover.setAttribute('visibility', 'visible');
        const rows = opts.series.map((se) => {
          const v = se.values[i];
          return h('div', { class: 'chart-tip-row' }, h('span', { class: 'chart-swatch', style: { background: se.color } }), h('span', null, se.name), h('b', null, v === undefined ? '–' : withUnit(v, opts.unit)));
        });
        tip.show(xOf(i) + slot / 2, yPos(totals[i] ?? 0), [h('div', { class: 'chart-tip-title' }, c.title), c.empty ? h('div', { class: 'chart-tip-row muted' }, c.emptyText ?? opts.emptyLabel ?? 'no entry') : rows]);
      };
      // Touch: the first tap shows the tooltip, a second tap on the same column selects it.
      let armed = false;
      svg.addEventListener('pointermove', (ev) => {
        if (gesture.dragged) return;
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
          if (armed && !gesture.dragged) opts.onSelect?.(at(ev as PointerEvent));
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
  series: LineSeries[];
  /** Points further apart than this (x units) are not joined. */
  gap?: number;
  /** Start the y axis at zero (bars-like readings); else fit to the data. */
  zero?: boolean;
  unit?: string;
  format?: (v: number) => string;
  xLabel?: string;
  yLabel?: string;
  height?: number;
  testid?: string;
  /** Tooltip title for an x value. */
  title: (x: number) => string;
  emptyLabel?: string;
  /** Zoom / pan along x; the smallest span that can be shown, in x units. */
  zoom?: { minSpan: number; label: (view: View) => string };
  onSelect?: (x: number) => void;
}

export function lineChart(opts: LineChartOpts): ChartHost {
  const height = opts.height ?? 220;
  const format = opts.format ?? fmtNum;
  const legend: LegendItem[] = opts.series.map((se) => ({ name: se.name, color: se.color, line: true }));
  if (opts.xBands?.length) legend.push({ name: opts.emptyLabel ?? 'no entry', color: 'var(--chart-empty)' });
  const zoom = opts.zoom && opts.xMax - opts.xMin > opts.zoom.minSpan ? opts.zoom : undefined;
  return chartHost({
    height,
    legend,
    testid: opts.testid,
    xLabel: opts.xLabel,
    yLabel: opts.yLabel,
    domain: zoom ? { min: opts.xMin, max: opts.xMax, minSpan: zoom.minSpan } : undefined,
    viewLabel: zoom ? zoom.label : undefined,
    build: (width, tip, view, gesture) => {
      const a = zoom ? view.a : opts.xMin;
      const b = zoom ? view.b : opts.xMax;
      const inView = (x: number): boolean => x >= a - 1e-9 && x <= b + 1e-9;
      const ys = opts.series.flatMap((se) => se.points.filter((p) => inView(p.x)).map((p) => p.y));
      const dataMin = ys.length ? Math.min(...ys) : 0;
      const dataMax = ys.length ? Math.max(...ys) : 1;
      const pad = opts.zero ? 0 : (dataMax - dataMin || 1) * 0.15;
      const { ticks, min, max } = niceTicks(opts.zero ? 0 : dataMin - pad, dataMax + pad, 4);
      const plotH = height - MARGIN.top - MARGIN.bottom;
      const yPos = (v: number): number => MARGIN.top + plotH - ((v - min) / (max - min || 1)) * plotH;
      const fr = frame(width, height, ticks, yPos, format, { x: opts.xLabel, y: opts.yLabel });
      const { svg, plot, labels, plotW } = fr;
      const span = Math.max(1e-9, b - a);
      const xPos = (x: number): number => MARGIN.left + ((x - a) / span) * plotW;
      for (const band of opts.xBands ?? []) {
        if (band.x1 < a || band.x0 > b) continue;
        const x0 = xPos(Math.max(a, band.x0));
        const x1 = xPos(Math.min(b, band.x1));
        plot.appendChild(s('rect', { x: x0, y: MARGIN.top, width: Math.max(1, x1 - x0), height: plotH, class: 'chart-empty-col' }));
      }
      // x labels, thinned to the space available
      const labelW = 34;
      const visibleTicks = opts.xTicks.filter((t) => inView(t.x));
      const tickCount = visibleTicks.length;
      const every = tickCount > 1 ? labelEvery(plotW / (tickCount - 1), labelW) : 1;
      visibleTicks.forEach((t, i) => {
        if (i % every !== 0) return;
        labels.appendChild(s('text', { x: xPos(t.x), y: MARGIN.top + plotH + 16, class: 'chart-xlabel', 'text-anchor': 'middle' }, t.label));
      });
      svg.appendChild(s('line', { x1: MARGIN.left, x2: width - MARGIN.right, y1: MARGIN.top + plotH, y2: MARGIN.top + plotH, class: 'chart-baseline' }));
      // lines and markers (smaller when points crowd: dense series read as a line)
      const markers: { x: number; y: number; el: SVGCircleElement; series: LineSeries; p: LinePoint }[] = [];
      const densest = Math.max(1, ...opts.series.map((se) => se.points.filter((p) => inView(p.x)).length));
      const radius = plotW / densest < 12 ? 2.5 : 4;
      for (const se of opts.series) {
        const pts = [...se.points].sort((x, y) => x.x - y.x);
        let d = '';
        let prev: LinePoint | undefined;
        for (const p of pts) {
          const joined = prev && (opts.gap === undefined || p.x - prev.x <= opts.gap);
          d += `${joined ? 'L' : 'M'}${xPos(p.x).toFixed(1)},${yPos(p.y).toFixed(1)} `;
          prev = p;
        }
        if (d) plot.appendChild(s('path', { d: d.trim(), class: 'chart-line', stroke: se.color }));
        for (const p of pts) {
          if (!inView(p.x)) continue;
          const el = s('circle', { cx: xPos(p.x), cy: yPos(p.y), r: radius, class: 'chart-marker', fill: se.color });
          plot.appendChild(el);
          markers.push({ x: xPos(p.x), y: yPos(p.y), el, series: se, p });
        }
      }
      // crosshair + tooltip on the nearest x
      const cross = s('line', { x1: 0, x2: 0, y1: MARGIN.top, y2: MARGIN.top + plotH, class: 'chart-crosshair', visibility: 'hidden' });
      plot.appendChild(cross);
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
        if (gesture.dragged) return;
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
          if (x !== undefined && armed && !gesture.dragged) opts.onSelect?.(x);
        });
      }
      return svg;
    },
  });
}

// ---- Donut chart ----------------------------------------------------------------------

export interface Slice {
  name: string;
  value: number;
  color: string;
  /** Optional detail line in the legend ("12 sets"). */
  detail?: string;
}

export interface DonutOpts {
  slices: Slice[];
  /** Unit for the values ("sets", "days"). */
  unit?: string;
  /** Big number in the hole and its caption; defaults to the total. */
  center?: { value: string; label: string };
  /** Slices beyond this many fold into "Other". */
  maxSlices?: number;
  testid?: string;
  onSelect?: (slice: Slice) => void;
}

/**
 * A donut with its legend beside it (below on narrow screens): every slice
 * is named and numbered, so the picture never relies on colour alone. Slices
 * after `maxSlices` fold into "Other".
 */
export function donutChart(opts: DonutOpts): ChartHost {
  const maxSlices = opts.maxSlices ?? 6;
  const sorted = [...opts.slices].filter((x) => x.value > 0).sort((x, y) => y.value - x.value);
  let slices = sorted;
  if (sorted.length > maxSlices) {
    const rest = sorted.slice(maxSlices - 1);
    slices = [...sorted.slice(0, maxSlices - 1), { name: 'Other', value: rest.reduce((n, x) => n + x.value, 0), color: 'var(--chart-other)', detail: rest.map((x) => x.name).join(', ') }];
  }
  const total = slices.reduce((n, x) => n + x.value, 0);
  const root = h('div', { class: 'donut', dataset: opts.testid ? { testid: opts.testid } : undefined });
  if (!total) {
    root.appendChild(h('p', { class: 'muted' }, 'Nothing in this range.'));
    return { root, redraw: () => undefined };
  }
  const size = 168;
  const r = size / 2;
  const ring = 26;
  const svg = s('svg', { class: 'donut-svg', width: size, height: size, viewBox: `0 0 ${size} ${size}`, role: 'img' });
  const legend = h('div', { class: 'donut-legend' });
  const centerValue = s('text', { x: r, y: r - 2, class: 'donut-center', 'text-anchor': 'middle' }, opts.center?.value ?? fmtNum(total));
  const centerLabel = s('text', { x: r, y: r + 15, class: 'donut-center-label', 'text-anchor': 'middle' }, opts.center?.label ?? opts.unit ?? '');
  const paths: SVGPathElement[] = [];
  const rows: HTMLElement[] = [];
  let angle = -Math.PI / 2;
  const arc = (from: number, to: number): string => {
    const big = to - from > Math.PI ? 1 : 0;
    const ro = r - 2;
    const ri = r - 2 - ring;
    const p = (rad: number, ang: number): string => `${(r + rad * Math.cos(ang)).toFixed(2)},${(r + rad * Math.sin(ang)).toFixed(2)}`;
    return `M${p(ro, from)} A${ro},${ro} 0 ${big} 1 ${p(ro, to)} L${p(ri, to)} A${ri},${ri} 0 ${big} 0 ${p(ri, from)} Z`;
  };
  const highlight = (idx: number | undefined): void => {
    paths.forEach((p, i) => p.classList.toggle('donut-dim', idx !== undefined && i !== idx));
    rows.forEach((row, i) => row.classList.toggle('donut-row-active', i === idx));
    if (idx === undefined) {
      centerValue.textContent = opts.center?.value ?? fmtNum(total);
      centerLabel.textContent = opts.center?.label ?? opts.unit ?? '';
    } else {
      const sl = slices[idx]!;
      centerValue.textContent = `${Math.round((sl.value / total) * 100)} %`;
      centerLabel.textContent = sl.name;
    }
  };
  slices.forEach((sl, i) => {
    const sweep = (sl.value / total) * Math.PI * 2;
    const from = angle;
    const to = angle + sweep - (slices.length > 1 ? 0.03 : 0);
    angle += sweep;
    const path = s('path', { d: sweep >= Math.PI * 2 - 1e-6 ? `M${r},2 A${r - 2},${r - 2} 0 1 1 ${r - 0.01},2 L${r - 0.01},${2 + ring} A${r - 2 - ring},${r - 2 - ring} 0 1 0 ${r},${2 + ring} Z` : arc(from, to), fill: sl.color, class: 'donut-slice' });
    path.addEventListener('pointerenter', () => highlight(i));
    path.addEventListener('pointerleave', () => highlight(undefined));
    path.addEventListener('click', () => opts.onSelect?.(sl));
    svg.appendChild(path);
    paths.push(path);
    const row = h(
      'div',
      { class: 'donut-row', onPointerenter: () => highlight(i), onPointerleave: () => highlight(undefined), onClick: () => opts.onSelect?.(sl) },
      h('span', { class: 'chart-swatch', style: { background: sl.color } }),
      h('span', { class: 'donut-name' }, sl.name),
      h('b', { class: 'donut-value' }, withUnit(Math.round(sl.value * 10) / 10, opts.unit)),
      h('span', { class: 'donut-pct muted' }, `${Math.round((sl.value / total) * 100)} %`),
      sl.detail ? h('span', { class: 'donut-detail muted' }, sl.detail) : null,
    );
    legend.appendChild(row);
    rows.push(row);
  });
  svg.appendChild(centerValue);
  svg.appendChild(centerLabel);
  root.append(svg, legend);
  return { root, redraw: () => undefined };
}
