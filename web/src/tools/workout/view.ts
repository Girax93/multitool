// Workout log UI: week bar, the spreadsheet-style grid, footnotes and legend.
// Sub-route "settings" renders the tool's own settings page instead.

import { h, replace, svg } from '../../core/dom.js';
import type { ToolContext, ToolInstance } from '../../core/registry.js';
import { currentRoute, navigate, onRouteChange, toolPath } from '../../core/router.js';
import { icons } from '../../ui/icons.js';
import { closeAllSheets, openSheet } from '../../ui/sheet.js';
import { openDayEditor, openExercisesEditor, openFootnoteEditor, openNotesEditor, openSetEditor, openWeekEditor } from './editors.js';
import { footnotesFor, legendColor, weekSummary, type CellStyle, type SetCell, type Week, type WorkoutSettings } from './model.js';
import type { WorkoutService } from './service.js';
import { renderWorkoutSettings } from './settings-view.js';

export function mountWorkoutView(host: HTMLElement, ctx: ToolContext, service: WorkoutService): ToolInstance {
  const unsubs: (() => void)[] = [];
  let sub = '';

  const render = (): void => {
    if (sub === 'settings') {
      replace(host, renderWorkoutSettings(service, ctx));
      return;
    }
    replace(host, renderLog(service, ctx));
  };

  unsubs.push(
    onRouteChange((r) => {
      if (r.name !== 'tool' || r.toolId !== 'workout') return;
      sub = r.sub;
      render();
    }),
  );
  // Re-render the log whenever data changes (cheap: grids are small).
  unsubs.push(service.weeks.subscribe(() => sub === '' && render(), false));
  unsubs.push(service.currentWeekId.subscribe(() => sub === '' && render(), false));
  unsubs.push(service.settings.subscribe(() => sub === '' && render(), false));

  return {
    unmount: () => {
      for (const u of unsubs) u();
      closeAllSheets();
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

  const idx = weeks.findIndex((w) => w.id === week.id);
  const prev = weeks[idx - 1];
  const next = weeks[idx + 1];

  const weekBar = h(
    'div',
    { class: 'wk-bar' },
    h('button', { class: 'iconbtn', 'aria-label': 'Previous week', disabled: !prev, onClick: () => prev && service.select(prev.id) }, svg(icons.chevronLeft)),
    h(
      'button',
      { class: 'wk-label', dataset: { testid: 'week-label' }, onClick: () => openWeekPicker(service) },
      h('span', { class: 'wk-label-title' }, week.label),
      h('span', { class: 'wk-label-sub' }, week.startDate ? `${week.startDate} · ${weekSummary(week)}` : weekSummary(week)),
    ),
    h('button', { class: 'iconbtn', 'aria-label': 'Next week', disabled: !next, onClick: () => next && service.select(next.id) }, svg(icons.chevronRight)),
    h('button', { class: 'iconbtn', 'aria-label': 'Week menu', dataset: { testid: 'week-menu' }, onClick: () => openWeekMenu(service, ctx, week.id) }, svg(icons.more)),
  );

  const grid = renderGrid(service, ctx, week, settings);
  const footnotes = renderFootnotes(service, ctx, week);
  const legend = renderLegend(settings);

  return h('div', { class: 'wk', dataset: { testid: 'workout' } }, weekBar, h('div', { class: 'wk-scroll' }, grid, footnotes, legend));
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
  const out: (Node | string)[] = [cell.v];
  if (cell.fn?.length) out.push(h('sup', null, cell.fn.join(',')));
  return out;
}

function renderGrid(service: WorkoutService, ctx: ToolContext, week: Week, settings: WorkoutSettings): HTMLElement {
  const unit = settings.unit;
  const headRow = h(
    'tr',
    null,
    h(
      'th',
      { class: 'wk-corner' },
      h('button', { class: 'wk-hbtn', dataset: { testid: 'week-edit' }, onClick: () => openWeekEditor(service, ctx, week.id) }, 'Day'),
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
    const tr = h('tr', { dataset: { day: day.id } });
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

    for (const ex of week.exercises) {
      const ed = day.cells[ex.id];
      for (let i = 0; i < ex.sets; i++) {
        const cell = ed?.sets[i] ?? { v: '' };
        const td = h(
          'td',
          { class: `wk-cell${i === 0 ? ' wk-cell-first' : ''}${i === ex.sets - 1 ? ' wk-cell-last' : ''}`, dataset: { day: day.id, ex: ex.id, set: String(i) } },
          h('button', { class: 'wk-cbtn', onClick: () => openSetEditor(service, ctx, week.id, { dayId: day.id, exId: ex.id, index: i }) }, ...setContent(cell)),
        );
        applyStyle(td, settings, cell, ed, day);
        tr.appendChild(td);
      }
    }
    const notesTd = h(
      'td',
      { class: 'wk-notes' },
      h('button', { class: 'wk-cbtn wk-cbtn-notes', dataset: { testid: 'notes-cell' }, onClick: () => openNotesEditor(service, week.id, day.id) }, day.notes ?? ''),
    );
    applyStyle(notesTd, settings, day.notesStyle, day);
    tr.appendChild(notesTd);
    body.appendChild(tr);
  }
  if (week.days.length === 0) {
    body.appendChild(h('tr', null, h('td', { colSpan: 99, class: 'wk-empty-row' }, 'No training days — add some via the week menu.')));
  }

  const table = h('table', { class: 'wk-table', dataset: { testid: 'workout-grid' } }, h('thead', null, headRow), body);
  return h('div', { class: 'wk-grid' }, table);
}

function renderFootnotes(service: WorkoutService, ctx: ToolContext, week: Week): HTMLElement | null {
  const blocks: HTMLElement[] = [];
  if (week.notes?.trim()) {
    blocks.push(
      h(
        'div',
        { class: 'wk-fn-ex', dataset: { testid: 'week-notes' } },
        h('span', { class: 'wk-fn-name' }, 'Week'),
        h('button', { class: 'wk-fn', onClick: () => openWeekEditor(service, ctx, week.id) }, week.notes),
      ),
    );
  }
  for (const ex of week.exercises) {
    const notes = footnotesFor(week, ex.id);
    if (!notes.length) continue;
    blocks.push(
      h(
        'div',
        { class: 'wk-fn-ex' },
        h('span', { class: 'wk-fn-name' }, ex.name || 'Exercise'),
        ...notes.map((f) =>
          h(
            'button',
            { class: 'wk-fn', onClick: () => openFootnoteEditor(service, week.id, ex.id, f.n) },
            h('sup', null, String(f.n)),
            ' ',
            f.text,
          ),
        ),
      ),
    );
  }
  if (!blocks.length) return null;
  return h('section', { class: 'card wk-side', dataset: { testid: 'footnotes' } }, h('h2', { class: 'card-title' }, 'Notes this week'), ...blocks);
}

function renderLegend(settings: WorkoutSettings): HTMLElement {
  const details = h('details', { class: 'card wk-side wk-legend' });
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
  details.appendChild(colours);
  details.appendChild(marks);
  details.appendChild(h('p', { class: 'muted' }, 'Numbers after a set (¹ ²) point to the notes above. Edit colours and marks in the tool settings.'));
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
