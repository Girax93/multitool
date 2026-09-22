// Workout tool settings: bodyweight tracking, defaults, legend & marks editor,
// import / export of the log.

import { h, replace, svg, uid } from '../../core/dom.js';
import type { ToolContext } from '../../core/registry.js';
import { navigate, toolPath } from '../../core/router.js';
import { icons } from '../../ui/icons.js';
import { WEEKDAYS, exportWeeks, parseWorkoutExport, type LegendEntry, type MarkDef, type Weekday } from './model.js';
import type { WorkoutService } from './service.js';

function section(title: string, ...children: (HTMLElement | null)[]): HTMLElement {
  return h('section', { class: 'card' }, h('h2', { class: 'card-title' }, title), ...children);
}

export function renderWorkoutSettings(service: WorkoutService, ctx: ToolContext): HTMLElement {
  const s = service.settings.get();

  // ---- general
  const bw = h('input', { type: 'checkbox', role: 'switch', checked: s.trackBodyweight, dataset: { testid: 'setting-bodyweight' } });
  bw.addEventListener('change', () => void service.updateSettings({ trackBodyweight: bw.checked }));
  const unit = h('select', { class: 'input input-short' }, h('option', { value: 'kg' }, 'kg'), h('option', { value: 'lb' }, 'lb'));
  unit.value = s.unit;
  unit.addEventListener('change', () => void service.updateSettings({ unit: unit.value as 'kg' | 'lb' }));
  const sets = h('input', { type: 'number', class: 'input input-num input-short', min: 1, max: 10, value: String(s.defaultSets) });
  sets.addEventListener('change', () => void service.updateSettings({ defaultSets: Math.min(10, Math.max(1, parseInt(sets.value, 10) || 3)) }));
  const dayBoxes = WEEKDAYS.map((wd) => {
    const box = h('input', { type: 'checkbox', checked: s.defaultDays.includes(wd) });
    box.addEventListener('change', () => {
      const next = WEEKDAYS.filter((d) => (d === wd ? box.checked : service.settings.get().defaultDays.includes(d)));
      void service.updateSettings({ defaultDays: next as Weekday[] });
    });
    return h('label', { class: 'check check-inline' }, box, h('span', null, wd));
  });
  const general = section(
    'Tracking',
    h('div', { class: 'list-row' }, h('label', { class: 'list-main' }, h('span', { class: 'list-title' }, 'Bodyweight per training day'), h('span', { class: 'list-sub' }, 'Prompted when you log the first set of a day')), h('label', { class: 'switch' }, bw, h('span', { class: 'switch-track' }))),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Unit'), unit),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Sets per new exercise'), sets),
    h('div', { class: 'field-col' }, h('span', { class: 'field-label' }, 'Training days for new weeks'), h('div', { class: 'chips' }, ...dayBoxes)),
  );

  // ---- legend
  const legendList = h('div', { class: 'ex-list' });
  const renderLegend = (): void => {
    const entries = service.settings.get().legend;
    replace(
      legendList,
      ...entries.map((entry, i) => {
        const label = h('input', { type: 'text', class: 'input', value: entry.label, placeholder: 'Meaning' });
        label.addEventListener('input', () => updateLegend(i, { label: label.value }));
        let colourCtl: HTMLElement;
        if (entry.color === 'star') {
          colourCtl = h('span', { class: 'swatch swatch-sm swatch-star' }, svg(icons.star));
        } else {
          const c = h('input', { type: 'color', class: 'colour-input', value: entry.color, 'aria-label': 'Colour' });
          c.addEventListener('input', () => updateLegend(i, { color: c.value }));
          colourCtl = c;
        }
        return h(
          'div',
          { class: 'ex-row' },
          colourCtl,
          label,
          entry.color === 'star'
            ? h('span', { class: 'iconbtn iconbtn-sm' })
            : h('button', { class: 'iconbtn iconbtn-sm', 'aria-label': 'Remove', onClick: () => removeLegend(i) }, svg(icons.trash)),
        );
      }),
    );
  };
  const updateLegend = (i: number, patch: Partial<LegendEntry>): void => {
    const legend = service.settings.get().legend.map((e, j) => (j === i ? { ...e, ...patch } : e));
    void service.updateSettings({ legend });
  };
  const removeLegend = (i: number): void => {
    void service.updateSettings({ legend: service.settings.get().legend.filter((_, j) => j !== i) }).then(renderLegend);
  };
  renderLegend();
  const legend = section(
    'Colour legend',
    h('p', { class: 'muted' }, 'Tap a colour in any cell editor to apply it. Rename these to whatever they mean to you.'),
    legendList,
    h(
      'button',
      {
        class: 'btn btn-sm',
        onClick: () => {
          void service.updateSettings({ legend: [...service.settings.get().legend, { id: uid('c'), label: '', color: '#3b82f6' }] }).then(renderLegend);
        },
      },
      svg(icons.plus),
      'Add colour',
    ),
  );

  // ---- marks
  const markList = h('div', { class: 'ex-list' });
  const renderMarks = (): void => {
    replace(
      markList,
      ...service.settings.get().marks.map((m, i) => {
        const sym = h('input', { type: 'text', class: 'input input-short', value: m.symbol, placeholder: '*' });
        sym.addEventListener('input', () => updateMark(i, { symbol: sym.value }));
        const meaning = h('input', { type: 'text', class: 'input', value: m.meaning, placeholder: 'Meaning' });
        meaning.addEventListener('input', () => updateMark(i, { meaning: meaning.value }));
        return h('div', { class: 'ex-row' }, sym, meaning, h('button', { class: 'iconbtn iconbtn-sm', 'aria-label': 'Remove', onClick: () => removeMark(i) }, svg(icons.trash)));
      }),
    );
  };
  const updateMark = (i: number, patch: Partial<MarkDef>): void => {
    void service.updateSettings({ marks: service.settings.get().marks.map((m, j) => (j === i ? { ...m, ...patch } : m)) });
  };
  const removeMark = (i: number): void => {
    void service.updateSettings({ marks: service.settings.get().marks.filter((_, j) => j !== i) }).then(renderMarks);
  };
  renderMarks();
  const marks = section(
    'Marks',
    h('p', { class: 'muted' }, 'Short symbols you can add to any set, day or note. They combine freely (e.g. 12!*).'),
    markList,
    h(
      'button',
      {
        class: 'btn btn-sm',
        onClick: () => void service.updateSettings({ marks: [...service.settings.get().marks, { symbol: '', meaning: '' }] }).then(renderMarks),
      },
      svg(icons.plus),
      'Add mark',
    ),
  );

  // ---- import / export
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, dataset: { testid: 'workout-import-file' } });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const parsed = parseWorkoutExport(JSON.parse(await file.text()));
      const r = await service.importWeeks(parsed.weeks, parsed.settings);
      ctx.toast(
        `Imported ${r.added} new week${r.added === 1 ? '' : 's'}${r.replaced ? `, replaced ${r.replaced}` : ''}` +
          (r.removed ? `, removed ${r.removed} empty duplicate${r.removed === 1 ? '' : 's'}` : ''),
      );
    } catch (err) {
      ctx.toast(`Import failed: ${(err as Error).message}`, { durationMs: 6000 });
    }
  });
  const data = section(
    'Import / export',
    h('p', { class: 'muted' }, 'Export the whole log as a file, or import one (weeks with the same id are replaced, others added).'),
    h(
      'div',
      { class: 'row' },
      h(
        'button',
        {
          class: 'btn',
          onClick: () => {
            const blob = new Blob([JSON.stringify(exportWeeks(service.weeks.get(), service.settings.get()), null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = h('a', { href: url, download: `multitool-workout-${new Date().toISOString().slice(0, 10)}.json` });
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 10_000);
          },
        },
        svg(icons.download),
        'Export log',
      ),
      h('button', { class: 'btn', dataset: { testid: 'workout-import' }, onClick: () => fileInput.click() }, svg(icons.upload), 'Import…'),
      fileInput,
    ),
  );

  return h(
    'div',
    { class: 'stack', dataset: { testid: 'workout-settings' } },
    h('button', { class: 'btn btn-text btn-back', onClick: () => navigate(toolPath('workout')) }, svg(icons.back), 'Back to the log'),
    general,
    legend,
    marks,
    data,
  );
}
