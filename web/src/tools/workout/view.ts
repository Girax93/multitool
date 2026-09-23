// Workout log UI: the spreadsheet-style grid with inline editing, context
// menus, notes row and legend. Sub-route "settings" renders the tool's own
// settings page instead.

import { h, replace, svg, type Child } from '../../core/dom.js';
import type { ToolContext, ToolInstance } from '../../core/registry.js';
import { currentRoute, navigate, onRouteChange, toolPath } from '../../core/router.js';
import { icons } from '../../ui/icons.js';
import { closePopover, onContextAction, openPopover } from '../../ui/popover.js';
import { closeAllSheets, confirmSheet, openSheet } from '../../ui/sheet.js';
import { chip, openDayEditor, openExercisesEditor, openFootnoteEditor, openNotesEditor, openSetEditor, openWeekEditor, swatches } from './editors.js';
import { cancelInline, commitInline, editInline, inlineTarget, type CommitVia } from './inline.js';
import {
  addFootnote,
  clean,
  displayFootnotes,
  getSet,
  isNumbered,
  legendColor,
  removeFootnote,
  splitLinks,
  toTypedCell,
  typeSet,
  updateDay,
  updateExerciseDayStyle,
  updateFootnote,
  pageTabLabel,
  updateSet,
  weekNumbers,
  weekSummary,
  type CellStyle,
  type SetCell,
  type Week,
  type WorkoutSettings,
} from './model.js';
import type { ViewPref, WorkoutService } from './service.js';
import { disposeSession, renderSession } from './session.js';
import { renderWorkoutSettings } from './settings-view.js';
import { renderStats, resetStatsView } from './stats-view.js';

/** The mounted root, so inline editing can find cells again after a re-render. */
let root: HTMLElement | null = null;

export function mountWorkoutView(host: HTMLElement, ctx: ToolContext, service: WorkoutService): ToolInstance {
  const unsubs: (() => void)[] = [];
  let sub = '';
  let rendering = false;
  let again = false;
  // Set when the user moved to another week (tabs, arrows, picker, new week):
  // the next render scrolls that week into view. Data edits keep the scroll.
  let navigated = true;
  root = host;

  // Re-entrancy guard: replacing the DOM can fire change/blur handlers that
  // update the service and ask for another render while this one is running.
  const render = (): void => {
    if (rendering) {
      again = true;
      return;
    }
    rendering = true;
    try {
      commitInline();
      const before = host.querySelector<HTMLElement>('.wk-scroll');
      const scroll = before ? { top: before.scrollTop, left: before.scrollLeft } : null;
      replace(host, sub === 'settings' ? renderWorkoutSettings(service, ctx) : sub === 'session' ? renderSession(service, ctx) : sub === 'stats' ? renderStats(service) : renderLog(service, ctx));
      const after = host.querySelector<HTMLElement>('.wk-scroll');
      if (after) {
        if (navigated) {
          const id = service.currentWeekId.get();
          const section = id ? after.querySelector<HTMLElement>(`.wk-week[data-week="${CSS.escape(id)}"]`) : null;
          if (section) after.scrollTop = Math.max(0, section.offsetTop - after.offsetTop - 4);
          navigated = false;
        } else if (scroll) {
          after.scrollTop = scroll.top;
          after.scrollLeft = scroll.left;
        }
      }
    } finally {
      rendering = false;
    }
    if (again) {
      again = false;
      render();
    }
  };

  unsubs.push(
    onRouteChange((r) => {
      if (r.name !== 'tool' || r.toolId !== 'workout') return;
      sub = r.sub;
      navigated = true;
      render();
    }),
  );
  // Re-render the log (workout mode, stats) whenever data changes (cheap: grids are small).
  const live = (): boolean => sub === '' || sub === 'session' || sub === 'stats';
  unsubs.push(service.weeks.subscribe(() => live() && render(), false));
  unsubs.push(service.stats.subscribe(() => sub === 'stats' && render(), false));
  unsubs.push(
    service.currentWeekId.subscribe(() => {
      navigated = true;
      if (sub === '') render();
    }, false),
  );
  unsubs.push(service.settings.subscribe(() => live() && render(), false));
  unsubs.push(
    service.view.subscribe(() => {
      navigated = true;
      if (sub === '') render();
    }, false),
  );

  // Clicking another set cell while one is being edited: commit first (which
  // may re-render the grid), then start editing the cell that was clicked.
  host.addEventListener(
    'pointerdown',
    (e: Event) => {
      const cur = inlineTarget();
      if (!cur) return;
      const target = e.target as HTMLElement | null;
      if (!target || cur.contains(target)) return;
      const td = target.closest<HTMLElement>('td.wk-cell[data-set]');
      const weekId = td?.closest<HTMLElement>('.wk-week')?.dataset['week'];
      if (!td || !weekId) return;
      e.preventDefault();
      const pos: SetPos = { dayId: td.dataset['day'] ?? '', exId: td.dataset['ex'] ?? '', index: Number(td.dataset['set']) };
      commitInline();
      editSetCell(service, weekId, pos);
    },
    true,
  );

  return {
    unmount: () => {
      cancelInline();
      closePopover();
      for (const u of unsubs) u();
      closeAllSheets();
      disposeSession();
      resetStatsView();
      if (root === host) root = null;
    },
  };
}

// ---- Log page ----------------------------------------------------------------------

function renderLog(service: WorkoutService, ctx: ToolContext): HTMLElement {
  const weeks = service.weeks.get();
  const week = service.current();
  const settings = service.settings.get();

  if (!week) {
    return h(
      'div',
      { class: 'empty', dataset: { testid: 'workout-empty' } },
      svg(icons.dumbbell, 'icon icon-xl'),
      h('p', null, 'No weeks yet.'),
      h('p', { class: 'muted' }, 'Start a week, add your exercises, then tap any cell to log a set.'),
      h(
        'button',
        {
          class: 'btn btn-primary',
          dataset: { testid: 'workout-start' },
          onClick: () => {
            const w = service.createWeek();
            openExercisesEditor(service, w.id);
          },
        },
        'Start this week',
      ),
      h('button', { class: 'btn btn-text', onClick: () => navigate(toolPath('workout', 'settings')) }, 'Settings & import'),
    );
  }

  const view = service.view.get();
  const visible = visibleWeeks(weeks, week, view);
  const top = h(
    'div',
    { class: 'wk-top' },
    renderLegend(settings),
    h(
      'div',
      { class: 'wk-top-right' },
      h(
        'button',
        { class: 'btn btn-primary btn-sm wk-session-btn', dataset: { testid: 'session-open' }, title: 'Workout mode: today\'s row, rest timers', onClick: () => navigate(toolPath('workout', 'session')) },
        svg(icons.play, 'icon icon-sm'),
        'Workout',
      ),
      h('button', { class: 'btn btn-sm wk-session-btn', dataset: { testid: 'stats-open' }, title: 'Stats: activity map, calendar, progression', onClick: () => navigate(toolPath('workout', 'stats')) }, svg(icons.chart, 'icon icon-sm'), 'Stats'),
      renderViewControl(service, view),
    ),
  );
  const tabs = view.mode === 'some' && weeks.length > view.per ? renderPageTabs(service, weeks, week, view.per) : null;
  const blocks = visible.map((w) => renderWeekBlock(service, ctx, w, weeks, settings, view.mode === 'one'));

  return h(
    'div',
    { class: `wk wk-mode-${view.mode}`, dataset: { testid: 'workout' } },
    top,
    tabs,
    h('div', { class: 'wk-scroll' }, h('div', { class: 'wk-weeks' }, ...blocks)),
  );
}

/** Which weeks the log shows for the current view preference (ascending). */
export function visibleWeeks(weeks: Week[], current: Week, view: ViewPref): Week[] {
  if (view.mode === 'all') return weeks;
  if (view.mode === 'one') return [current];
  const idx = Math.max(0, weeks.findIndex((w) => w.id === current.id));
  const start = Math.floor(idx / view.per) * view.per;
  return weeks.slice(start, start + view.per);
}

function renderPageTabs(service: WorkoutService, weeks: Week[], current: Week, per: number): HTMLElement {
  const idx = Math.max(0, weeks.findIndex((w) => w.id === current.id));
  const active = Math.floor(idx / per);
  const numbers = weekNumbers(weeks);
  const tabs = h('div', { class: 'wk-tabs', role: 'tablist', dataset: { testid: 'week-tabs' } });
  for (let start = 0, page = 0; start < weeks.length; start += per, page++) {
    const slice = weeks.slice(start, start + per);
    const first = slice[0];
    if (!first) continue;
    const label = pageTabLabel(numbers, slice);
    tabs.appendChild(
      h(
        'button',
        {
          class: `wk-tab${page === active ? ' wk-tab-active' : ''}`,
          role: 'tab',
          'aria-selected': String(page === active),
          onClick: () => service.select(first.id),
        },
        label,
      ),
    );
  }
  // keep the active tab in view on narrow screens
  requestAnimationFrame(() => tabs.querySelector('.wk-tab-active')?.scrollIntoView({ block: 'nearest', inline: 'center' }));
  return tabs;
}

function renderViewControl(service: WorkoutService, view: ViewPref): HTMLElement {
  const seg = (mode: ViewPref['mode'], label: string): HTMLElement =>
    h(
      'button',
      {
        class: `seg${view.mode === mode ? ' seg-active' : ''}`,
        role: 'radio',
        'aria-checked': String(view.mode === mode),
        dataset: { testid: `view-${mode}` },
        onClick: () => service.setView({ mode }),
      },
      label,
    );
  const per = h('input', {
    type: 'number',
    class: 'input input-num wk-per',
    min: '2',
    max: '20',
    value: String(view.per),
    'aria-label': 'Weeks per page',
    dataset: { testid: 'view-per' },
    onChange: () => service.setView({ per: parseInt(per.value, 10) }),
  });
  return h(
    'div',
    { class: 'wk-viewctl' },
    h('div', { class: 'segmented segmented-sm', role: 'radiogroup' }, seg('one', '1 week'), seg('some', `${view.per} weeks`), seg('all', 'All')),
    view.mode === 'some' ? h('label', { class: 'wk-per-label' }, 'per page', per) : null,
  );
}

/**
 * One week. The label lives in the grid's corner cell and the menu in its
 * bottom-right cell. Wide screens (≥ 1200 px, see app.css) flank the grid with
 * the ‹ › arrows in 1-week mode; narrower screens keep a slim bar above the
 * grid instead, where the arrows and the menu stay reachable without
 * scrolling the grid.
 */
function renderWeekBlock(service: WorkoutService, ctx: ToolContext, week: Week, weeks: Week[], settings: WorkoutSettings, single: boolean): HTMLElement {
  const idx = weeks.findIndex((w) => w.id === week.id);
  const prev = weeks[idx - 1];
  const next = weeks[idx + 1];
  const arrow = (dir: -1 | 1, cls: string): HTMLElement => {
    const target = dir < 0 ? prev : next;
    return h(
      'button',
      { class: `iconbtn ${cls}`, 'aria-label': dir < 0 ? 'Previous week' : 'Next week', disabled: !target, onClick: () => target && service.select(target.id) },
      svg(dir < 0 ? icons.chevronLeft : icons.chevronRight),
    );
  };
  const bar = h(
    'div',
    { class: `wk-bar${single ? '' : ' wk-bar-multi'}` },
    single ? arrow(-1, 'wk-bar-arrow') : null,
    h(
      'button',
      { class: 'wk-label', dataset: { testid: 'week-bar-label' }, onClick: () => openWeekPicker(service) },
      h('span', { class: 'wk-label-title' }, week.label),
      week.startDate ? h('span', { class: 'wk-label-sub' }, week.startDate) : null,
    ),
    single ? arrow(1, 'wk-bar-arrow') : null,
    h('button', { class: 'iconbtn', 'aria-label': 'Week menu', dataset: { testid: 'week-menu' }, onClick: () => openWeekMenu(service, ctx, week.id) }, svg(icons.more)),
  );
  const row = h(
    'div',
    { class: 'wk-row' },
    single ? arrow(-1, 'wk-side-arrow') : null,
    renderGrid(service, ctx, week, settings),
    single ? arrow(1, 'wk-side-arrow') : null,
  );
  return h('section', { class: 'wk-week', dataset: { week: week.id } }, bar, row);
}

function styleAttrs(settings: WorkoutSettings, ...layers: (CellStyle | undefined)[]): { bg?: string; star: boolean } {
  let bg: string | undefined;
  let star = false;
  for (const s of layers) {
    if (!s) continue;
    if (!bg) bg = legendColor(settings, s.c);
    if (s.star) star = true;
  }
  return { bg, star };
}

function applyStyle(el: HTMLElement, settings: WorkoutSettings, ...layers: (CellStyle | undefined)[]): void {
  const { bg, star } = styleAttrs(settings, ...layers);
  if (bg) el.style.setProperty('--cell-bg', bg);
  el.classList.toggle('wk-tinted', !!bg);
  if (star) el.appendChild(svg(icons.star, 'icon wk-star'));
}

function setContent(cell: SetCell): (Node | string)[] {
  const out: (Node | string)[] = [cell.v ?? ''];
  if (cell.fn?.length) out.push(h('sup', null, cell.fn.join(',')));
  return out;
}

/** Note text with `[label](url)` and bare URLs as links (opened through the native bridge on Android). */
function rich(text: string, ctx: ToolContext): Child[] {
  return splitLinks(text).map((part) =>
    'url' in part
      ? h(
          'a',
          {
            class: 'link wk-link',
            href: part.url,
            target: '_blank',
            rel: 'noopener',
            title: part.url,
            onClick: (e: Event) => {
              e.preventDefault();
              e.stopPropagation();
              ctx.native.openUrl(part.url);
            },
          },
          part.label,
        )
      : part.text,
  );
}

// ---- Inline editing --------------------------------------------------------------

export interface SetPos {
  dayId: string;
  exId: string;
  index: number;
}

function findSetCell(weekId: string, pos: SetPos): HTMLElement | null {
  if (!root) return null;
  const week = root.querySelector<HTMLElement>(`.wk-week[data-week="${CSS.escape(weekId)}"]`);
  return week?.querySelector<HTMLElement>(`td.wk-cell[data-day="${CSS.escape(pos.dayId)}"][data-ex="${CSS.escape(pos.exId)}"][data-set="${pos.index}"]`) ?? null;
}

/** All set positions of a day in grid order (for Enter / Tab to move on). */
function setPositions(week: Week, dayId: string): SetPos[] {
  const out: SetPos[] = [];
  for (const ex of week.exercises) for (let i = 0; i < ex.sets; i++) out.push({ dayId, exId: ex.id, index: i });
  return out;
}

function neighbourSet(week: Week, pos: SetPos, dir: -1 | 1): SetPos | undefined {
  const list = setPositions(week, pos.dayId);
  const i = list.findIndex((p) => p.exId === pos.exId && p.index === pos.index);
  return i < 0 ? undefined : list[i + dir];
}

/** Type straight into a set cell; Enter / Tab go to the next set of the day. */
export function editSetCell(service: WorkoutService, weekId: string, pos: SetPos): void {
  const td = findSetCell(weekId, pos);
  const w = service.get(weekId);
  if (!td || !w) return;
  const before = toTypedCell(getSet(w, pos.dayId, pos.exId, pos.index));
  editInline(td, {
    value: before,
    mode: 'overlay',
    mono: true,
    testid: 'set-inline',
    onCommit: (text: string, via: CommitVia) => {
      if (text.trim() !== before.trim()) {
        service.update(weekId, (x) => typeSet(x, pos.dayId, pos.exId, pos.index, text));
        if (text.trim()) service.setTyped.emit({ weekId, ...pos, text: text.trim() });
      }
      const cur = service.get(weekId);
      if (!cur || via === 'blur') return;
      const next = neighbourSet(cur, pos, via === 'shift-tab' ? -1 : 1);
      if (next) editSetCell(service, weekId, next);
    },
  });
}

/** Right-click / long-press menu for a set cell: colour (set / exercise / day), star, marks, clear, full editor. */
function openSetMenu(x: number, y: number, service: WorkoutService, ctx: ToolContext, weekId: string, pos: SetPos): void {
  let scope: 'set' | 'exercise' | 'day' = 'set';
  const pop = openPopover(x, y);
  const render = (): void => {
    const w = service.get(weekId);
    const day = w?.days.find((d) => d.id === pos.dayId);
    const ex = w?.exercises.find((e) => e.id === pos.exId);
    if (!w || !day || !ex) {
      pop.close();
      return;
    }
    const cell = getSet(w, day.id, ex.id, pos.index);
    const exDay = day.cells[ex.id];
    const styleFor = (): CellStyle => (scope === 'set' ? cell : scope === 'exercise' ? (exDay ?? {}) : day);
    const applyStyle = (style: CellStyle): void => {
      service.update(weekId, (x) => {
        if (scope === 'set') return updateSet(x, day.id, ex.id, pos.index, style);
        if (scope === 'exercise') return updateExerciseDayStyle(x, day.id, ex.id, style);
        return updateDay(x, day.id, style);
      });
      render();
    };
    const seg = (s: typeof scope, label: string): HTMLElement =>
      h(
        'button',
        {
          type: 'button',
          class: `seg${scope === s ? ' seg-active' : ''}`,
          onClick: () => {
            scope = s;
            render();
          },
        },
        label,
      );
    const marks = service.settings.get().marks;
    replace(
      pop.el,
      h(
        'div',
        { class: 'pop-row' },
        h('span', { class: 'pop-label' }, 'Colour'),
        h('div', { class: 'segmented segmented-xs' }, seg('set', 'Set'), seg('exercise', ex.name.split(' ')[0] || 'Exercise'), seg('day', day.weekday)),
      ),
      swatches(service, styleFor(), applyStyle),
      h(
        'div',
        { class: 'pop-row' },
        h('span', { class: 'pop-label' }, 'Marks'),
        h(
          'div',
          { class: 'chips chips-tight' },
          ...marks.map((m) =>
            chip(m.symbol, (cell.v ?? '').endsWith(m.symbol), () => {
              const v = cell.v ?? '';
              const nv = v.endsWith(m.symbol) ? v.slice(0, -m.symbol.length) : v + m.symbol;
              service.update(weekId, (x) => updateSet(x, day.id, ex.id, pos.index, { v: nv }));
              render();
            }, 'chip-mark'),
          ),
        ),
      ),
      h(
        'div',
        { class: 'pop-actions' },
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-sm btn-text',
            onClick: () => {
              service.update(weekId, (x) => updateSet(x, day.id, ex.id, pos.index, { v: '', fn: [], c: undefined, star: false }));
              pop.close();
            },
          },
          'Clear',
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-sm',
            dataset: { testid: 'menu-set-editor' },
            onClick: () => {
              pop.close();
              openSetEditor(service, ctx, weekId, pos);
            },
          },
          'Edit in sheet…',
        ),
      ),
    );
  };
  render();
}

/** Menu for a notes cell (day notes) — colour and the sheet editor. */
function openNotesMenu(x: number, y: number, service: WorkoutService, weekId: string, dayId: string): void {
  const pop = openPopover(x, y);
  const render = (): void => {
    const w = service.get(weekId);
    const day = w?.days.find((d) => d.id === dayId);
    if (!w || !day) {
      pop.close();
      return;
    }
    replace(
      pop.el,
      h('div', { class: 'pop-row' }, h('span', { class: 'pop-label' }, 'Colour')),
      swatches(service, day.notesStyle ?? {}, (style) => {
        service.update(weekId, (x) => {
          const merged = clean({ ...(x.days.find((d) => d.id === dayId)?.notesStyle ?? {}), ...style });
          return updateDay(x, dayId, { notesStyle: Object.keys(merged).length ? merged : undefined });
        });
        render();
      }),
      h(
        'div',
        { class: 'pop-actions' },
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-sm',
            onClick: () => {
              pop.close();
              openNotesEditor(service, weekId, dayId);
            },
          },
          'Edit in sheet…',
        ),
      ),
    );
  };
  render();
}

function openFootnoteMenu(x: number, y: number, service: WorkoutService, weekId: string, exId: string, n: number): void {
  const pop = openPopover(x, y);
  replace(
    pop.el,
    h(
      'div',
      { class: 'pop-actions' },
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-sm btn-text btn-danger-text',
          onClick: async () => {
            pop.close();
            if (await confirmSheet(n > 0 ? 'Delete this note? References to it are removed from the sets.' : 'Delete this note?', 'Delete note')) {
              service.update(weekId, (x) => removeFootnote(x, exId, n));
            }
          },
        },
        'Delete',
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-sm',
          onClick: () => {
            pop.close();
            openFootnoteEditor(service, weekId, exId, n);
          },
        },
        'Edit in sheet…',
      ),
    ),
  );
}

export function renderGrid(service: WorkoutService, ctx: ToolContext, week: Week, settings: WorkoutSettings, opts: { highlightDayId?: string } = {}): HTMLElement {
  const unit = settings.unit;
  const headRow = h(
    'tr',
    null,
    h(
      'th',
      { class: 'wk-corner' },
      // The week's label and start date sit where the sheet had "Day"; tapping opens the week list.
      h(
        'button',
        { class: 'wk-hbtn wk-corner-btn', dataset: { testid: 'week-label' }, title: 'Jump to another week', onClick: () => openWeekPicker(service) },
        h('span', { class: 'wk-label-title' }, week.label),
        week.startDate ? h('span', { class: 'wk-corner-date' }, week.startDate) : null,
      ),
    ),
  );
  for (const ex of week.exercises) {
    const th = h(
      'th',
      { colSpan: ex.sets, class: 'wk-ex' },
      h(
        'button',
        { class: 'wk-hbtn', dataset: { ex: ex.id, testid: 'exercise-header' }, onClick: () => openExercisesEditor(service, week.id, ex.id) },
        h('span', { class: 'wk-ex-name' }, ex.name || 'Exercise'),
        ex.weight ? h('span', { class: 'wk-ex-weight' }, ex.weight) : null,
      ),
    );
    applyStyle(th, settings, ex);
    headRow.appendChild(th);
  }
  headRow.appendChild(h('th', { class: 'wk-notes-h' }, 'Notes'));
  if (week.exercises.length === 0) {
    headRow.appendChild(
      h('th', { class: 'wk-ex' }, h('button', { class: 'wk-hbtn wk-hbtn-add', dataset: { testid: 'exercise-add-header' }, onClick: () => openExercisesEditor(service, week.id) }, svg(icons.plus), 'Add exercises')),
    );
  }

  const body = h('tbody');
  for (const day of week.days) {
    const tr = h('tr', { class: day.id === opts.highlightDayId ? 'wk-today' : undefined, dataset: { day: day.id } });
    const dayBtn = h(
      'button',
      { class: 'wk-hbtn wk-day', dataset: { testid: 'day-header' }, onClick: () => openDayEditor(service, week.id, day.id) },
      h('span', { class: 'wk-day-name' }, day.weekday, day.marks ? h('span', { class: 'wk-marks' }, ` ${day.marks}`) : null),
      settings.trackBodyweight
        ? h('span', { class: `wk-day-bw${day.bodyweight === undefined ? ' wk-day-bw-empty' : ''}` }, day.bodyweight === undefined ? `— ${unit}` : `${day.bodyweight} ${unit}`)
        : day.date
          ? h('span', { class: 'wk-day-bw' }, day.date.slice(5))
          : null,
    );
    const th = h('th', { class: 'wk-dayh' }, dayBtn);
    applyStyle(th, settings, day);
    tr.appendChild(th);

    if (day.alt?.trim()) {
      // Worked out, but not with these exercises: one cell across all set columns.
      const span = week.exercises.reduce((n, ex) => n + ex.sets, 0) || 1;
      const td = h(
        'td',
        { colSpan: span, class: 'wk-cell wk-cell-first wk-alt', dataset: { day: day.id, testid: 'alt-cell' } },
        h(
          'button',
          { class: 'wk-cbtn wk-cbtn-alt', title: 'Another workout — tap to edit the day', onClick: () => openDayEditor(service, week.id, day.id) },
          svg(icons.dumbbell, 'icon icon-sm'),
          h('span', null, ...rich(day.alt.trim(), ctx)),
        ),
      );
      // The day's colour stays on the day cell; the other-workout cell is plain.
      tr.appendChild(td);
    } else {
      for (const ex of week.exercises) {
        const ed = day.cells[ex.id];
        for (let i = 0; i < ex.sets; i++) {
          const cell = ed?.sets[i] ?? { v: '' };
          const pos: SetPos = { dayId: day.id, exId: ex.id, index: i };
          const td = h(
            'td',
            { class: `wk-cell${i === 0 ? ' wk-cell-first' : ''}${i === ex.sets - 1 ? ' wk-cell-last' : ''}`, dataset: { day: day.id, ex: ex.id, set: String(i) } },
            h('button', { class: 'wk-cbtn', title: 'Type reps and marks; . .. … add notes; right-click or hold for colours', onClick: () => editSetCell(service, week.id, pos) }, ...setContent(cell)),
          );
          onContextAction(td, (x, y) => openSetMenu(x, y, service, ctx, week.id, pos));
          // A colour marks exactly what it was put on: the set, or the exercise for
          // the day. A red day colours only the "Wed" cell, so a day off and a
          // skipped exercise can be told apart (Ari, 2026-09-23).
          applyStyle(td, settings, cell, ed);
          tr.appendChild(td);
        }
      }
    }
    const notesTd = h('td', { class: 'wk-notes' });
    notesTd.appendChild(
      h(
        'button',
        {
          class: 'wk-cbtn wk-cbtn-notes',
          dataset: { testid: 'notes-cell' },
          onClick: () =>
            editInline(notesTd, {
              value: day.notes ?? '',
              mode: 'overlay',
              multiline: true,
              placeholder: 'Notes for this day',
              testid: 'notes-inline',
              onCommit: (text) => {
                if (text.trim() !== (day.notes ?? '').trim()) service.update(week.id, (x) => updateDay(x, day.id, { notes: text.trim() }));
              },
            }),
        },
        ...rich(day.notes ?? '', ctx),
      ),
    );
    onContextAction(notesTd, (x, y) => openNotesMenu(x, y, service, week.id, day.id));
    applyStyle(notesTd, settings, day.notesStyle);
    tr.appendChild(notesTd);
    body.appendChild(tr);
  }
  if (week.days.length === 0) {
    body.appendChild(h('tr', null, h('td', { colSpan: 99, class: 'wk-empty-row' }, 'No training days — add some via the week menu.')));
  }

  const table = h('table', { class: 'wk-table', dataset: { testid: 'workout-grid' } }, h('thead', null, headRow), body, renderNotesRow(service, ctx, week));
  return h('div', { class: 'wk-grid' }, table);
}

/**
 * The notes row under the grid, like the footnote row of the original sheet:
 * each exercise's notes sit under its own columns (numbered ones first, then
 * plain notes added with +), the week's note under the Notes column, and the
 * week menu in the bottom-right corner. Notes are edited in place.
 */
function renderNotesRow(service: WorkoutService, ctx: ToolContext, week: Week): HTMLElement {
  const tr = h('tr', { class: 'wk-fnrow', dataset: { testid: 'footnotes' } });
  tr.appendChild(h('th', { class: 'wk-dayh wk-fnh' }, h('span', { class: 'wk-fnh-text' }, 'Notes')));
  for (const ex of week.exercises) {
    const notes = displayFootnotes(week, ex.id);
    const cell = h(
      'td',
      { colSpan: ex.sets, class: 'wk-fncell', dataset: { ex: ex.id } },
      h(
        'div',
        { class: 'wk-fnwrap' },
        ...notes.map((f) => {
          const btn = h(
            'button',
            { class: `wk-fn${isNumbered(f) ? '' : ' wk-fn-plain'}${f.text.trim() ? '' : ' wk-fn-empty'}`, title: 'Tap to edit, right-click or hold for more', dataset: { note: String(f.n) } },
            isNumbered(f) ? h('sup', null, String(f.n)) : null,
            isNumbered(f) ? ' ' : null,
            ...(f.text.trim() ? rich(f.text, ctx) : ['write the note…']),
          );
          btn.addEventListener('click', () =>
            editInline(btn, {
              value: f.text,
              mode: 'inplace',
              multiline: true,
              placeholder: isNumbered(f) ? `Note ${f.n} for ${ex.name}` : `Note for ${ex.name}`,
              testid: 'footnote-inline',
              onCommit: (text) => {
                if (text.trim() !== f.text.trim()) service.update(week.id, (x) => updateFootnote(x, ex.id, f.n, text.trim()));
              },
            }),
          );
          onContextAction(btn, (x, y) => openFootnoteMenu(x, y, service, week.id, ex.id, f.n));
          return btn;
        }),
        h(
          'button',
          { class: 'wk-fn-add', 'aria-label': `Add a note for ${ex.name}`, title: 'Add a note (without a number)', dataset: { testid: 'footnote-add' }, onClick: () => openAddNoteSheet(service, week.id, ex.id) },
          svg(icons.plus, 'icon icon-sm'),
        ),
      ),
    );
    tr.appendChild(cell);
  }
  const last = h('td', { class: 'wk-notes wk-fncell wk-fnlast' });
  last.appendChild(
    h(
      'button',
      {
        class: 'wk-cbtn wk-cbtn-notes',
        dataset: { testid: 'week-notes' },
        title: 'Notes for the whole week — tap to edit',
        onClick: () =>
          editInline(last, {
            value: week.notes ?? '',
            mode: 'overlay',
            multiline: true,
            placeholder: 'Notes for the whole week',
            testid: 'week-notes-inline',
            onCommit: (text) => {
              if (text.trim() !== (week.notes ?? '').trim()) service.update(week.id, (x) => clean({ ...x, notes: text.trim() }));
            },
          }),
      },
      ...rich(week.notes ?? '', ctx),
    ),
  );
  last.appendChild(
    h(
      'button',
      { class: 'iconbtn iconbtn-sm wk-corner-menu', 'aria-label': 'Week menu', title: 'Week menu', dataset: { testid: 'week-menu-corner' }, onClick: () => openWeekMenu(service, ctx, week.id) },
      svg(icons.more),
    ),
  );
  tr.appendChild(last);
  return h('tfoot', null, tr);
}

/** "+" in the notes row: a plain note about the exercise this week, no number. */
function openAddNoteSheet(service: WorkoutService, weekId: string, exId: string): void {
  const w = service.get(weekId);
  const ex = w?.exercises.find((e) => e.id === exId);
  if (!w || !ex) return;
  const sheet = openSheet({ title: `Note for ${ex.name || 'exercise'}` });
  const input = h('input', { type: 'text', class: 'input', placeholder: 'e.g. felt strong all week', dataset: { testid: 'footnote-add-input' } });
  const form = h(
    'form',
    {
      onSubmit: (e: Event) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        service.update(weekId, (x) => addFootnote(x, exId, text, false).week);
        sheet.close();
      },
    },
    h('p', { class: 'muted' }, 'A general note for this exercise this week — it gets no number. For a numbered note, type a dot after the set (12. or 12..) and the note appears here to fill in.'),
    input,
    h('div', { class: 'row row-end sheet-actions' }, h('button', { class: 'btn btn-primary', type: 'submit', dataset: { testid: 'footnote-add-save' } }, 'Add')),
  );
  replace(sheet.body, form);
  input.focus();
}

/** Collapsed until opened; colours in one column, marks in a second, both left aligned. */
function renderLegend(settings: WorkoutSettings): HTMLElement {
  const details = h('details', { class: 'wk-legend', dataset: { testid: 'legend' } });
  details.appendChild(h('summary', { class: 'card-title' }, 'Legend'));
  const colours = h('div', { class: 'wk-legend-list' });
  for (const entry of settings.legend) {
    const sw = h('span', { class: 'swatch swatch-sm' });
    if (entry.color === 'star') {
      sw.classList.add('swatch-star');
      sw.appendChild(svg(icons.star));
    } else sw.style.background = entry.color;
    colours.appendChild(h('div', { class: 'wk-legend-item' }, sw, h('span', null, entry.label)));
  }
  const marks = h('div', { class: 'wk-legend-list' }, ...settings.marks.map((m) => h('div', { class: 'wk-legend-item' }, h('code', { class: 'wk-mark' }, m.symbol), h('span', null, m.meaning))));
  details.appendChild(h('div', { class: 'wk-legend-cols' }, colours, marks));
  details.appendChild(h('p', { class: 'muted wk-legend-hint' }, 'Numbers after a set (¹ ²) point to the notes row under each week. Edit colours and marks in the tool settings.'));
  return details;
}

// ---- Week picker / menu ---------------------------------------------------------------

function openWeekPicker(service: WorkoutService): void {
  const sheet = openSheet({ title: 'Weeks' });
  const weeks = [...service.weeks.get()].reverse();
  const current = service.currentWeekId.get();
  replace(
    sheet.body,
    h(
      'div',
      { class: 'list' },
      ...weeks.map((w) =>
        h(
          'button',
          {
            class: `list-row list-btn${w.id === current ? ' list-current' : ''}`,
            onClick: () => {
              service.select(w.id);
              sheet.close();
            },
          },
          h('span', { class: 'list-main' }, h('span', { class: 'list-title' }, w.label), h('span', { class: 'list-sub' }, `${w.startDate ?? 'undated'} · ${weekSummary(w)}`)),
          w.id === current ? svg(icons.check) : null,
        ),
      ),
    ),
    h(
      'div',
      { class: 'row row-end sheet-actions' },
      h(
        'button',
        {
          class: 'btn btn-primary',
          dataset: { testid: 'week-new' },
          onClick: () => {
            service.createWeek();
            sheet.close();
          },
        },
        svg(icons.plus),
        'New week',
      ),
    ),
  );
}

function openWeekMenu(service: WorkoutService, ctx: ToolContext, weekId: string): void {
  const sheet = openSheet({ title: service.get(weekId)?.label ?? 'Week' });
  const item = (label: string, icon: string, onClick: () => void, testid?: string): HTMLElement =>
    h(
      'button',
      {
        class: 'list-row list-btn',
        dataset: testid ? { testid } : undefined,
        onClick: () => sheet.closeThen(onClick),
      },
      h('span', { class: 'list-icon' }, svg(icon)),
      h('span', { class: 'list-title' }, label),
    );
  replace(
    sheet.body,
    h(
      'div',
      { class: 'list' },
      item('Workout mode (today, rest timers)', icons.play, () => navigate(toolPath('workout', 'session')), 'menu-session'),
      item('New week (copies exercises)', icons.plus, () => service.createWeek(), 'menu-new-week'),
      item('Edit exercises', icons.dumbbell, () => openExercisesEditor(service, weekId), 'menu-exercises'),
      item('Edit week: label, dates, days', icons.edit, () => openWeekEditor(service, ctx, weekId), 'menu-week'),
      item('Workout settings & import', icons.settings, () => navigate(toolPath('workout', 'settings')), 'menu-settings'),
    ),
  );
}

export function currentSub(): string {
  const r = currentRoute();
  return r.name === 'tool' ? r.sub : '';
}
