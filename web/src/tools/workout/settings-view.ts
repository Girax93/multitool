// Workout tool settings: bodyweight tracking, defaults, legend & marks editor,
// import / export of the log.

import { h, replace, svg, uid } from '../../core/dom.js';
import type { ToolContext } from '../../core/registry.js';
import { navigate, toolPath } from '../../core/router.js';
import { icons } from '../../ui/icons.js';
import { WEEKDAYS, exportWeeks, formatSeconds, parseSeconds, parseWorkoutExport, type LegendEntry, type MarkDef, type SessionSettings, type Weekday } from './model.js';
import { openLibraryEditor } from './editors.js';
import { describeEntry } from './library.js';
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

  // ---- workout mode
  const sessionField = (key: 'restSec' | 'stepSec' | 'workSec' | 'prepSec', label: string, hint: string, min = 1): HTMLElement => {
    const input = h('input', { type: 'text', class: 'input input-short', inputMode: 'numeric', value: formatSeconds(s.session[key]), dataset: { testid: `setting-${key}` } });
    input.addEventListener('change', () => {
      const sec = parseSeconds(input.value);
      if (sec !== null && sec >= min) {
        const session: SessionSettings = { ...service.settings.get().session, [key]: sec };
        void service.updateSettings({ session });
        input.value = formatSeconds(sec);
      } else input.value = formatSeconds(service.settings.get().session[key]);
    });
    return h('div', { class: 'field' }, h('span', { class: 'field-label' }, label, h('span', { class: 'field-hint' }, hint)), input);
  };
  const offer = h('input', { type: 'checkbox', role: 'switch', checked: s.session.offerTimed, dataset: { testid: 'setting-offer-timed' } });
  offer.addEventListener('change', () => void service.updateSettings({ session: { ...service.settings.get().session, offerTimed: offer.checked } }));
  const sessionCard = section(
    'Workout mode',
    h('p', { class: 'muted' }, 'Typing a set in workout mode starts the rest countdown (through the Timers tool). Times as m:ss or seconds. An exercise can have its own rest and prep (tap its header).'),
    sessionField('restSec', 'Rest between sets', 'unless the exercise says otherwise, e.g. 1:30'),
    sessionField('stepSec', '+ / − step', 'the +30 s / −30 s buttons'),
    sessionField('workSec', 'Work time for timed sets', 'default for new timed exercises, e.g. handstands'),
    sessionField('prepSec', 'Prep before a timed set', 'time to get into position before the hold counts down', 0),
    h('div', { class: 'list-row' }, h('label', { class: 'list-main' }, h('span', { class: 'list-title' }, 'Offer timed exercises'), h('span', { class: 'list-sub' }, 'After the rest of the exercise before a timed one, ask to start it')), h('label', { class: 'switch' }, offer, h('span', { class: 'switch-track' }))),
  );

  // ---- exercise library
  const libList = h('div', { class: 'list' });
  const renderLibrary = (): void => {
    const lib = [...service.settings.get().library].sort((a, b) => a.name.localeCompare(b.name));
    replace(
      libList,
      ...lib.map((e) =>
        h(
          'button',
          { type: 'button', class: 'list-row list-btn', dataset: { testid: 'library-row', lib: e.id }, onClick: () => openLibraryEditor(service, e.id, renderLibrary) },
          h('span', { class: 'list-main' }, h('span', { class: 'list-title' }, e.name), h('span', { class: 'list-sub' }, describeEntry(e))),
          svg(icons.chevronRight, 'icon icon-sm'),
        ),
      ),
    );
  };
  renderLibrary();
  const removedCount = s.libraryRemoved.length;
  const libraryCard = section(
    'Exercises',
    h('p', { class: 'muted' }, 'The exercises the stats know: which muscles they work (a set counts fully for the main ones, half for the helpers) and how much weight one rep moves — the dumbbell, or a share of your bodyweight. Weeks link their exercises here by name; edit any number.'),
    libList,
    h(
      'div',
      { class: 'row' },
      h('button', { class: 'btn btn-sm', dataset: { testid: 'library-add' }, onClick: () => openLibraryEditor(service, undefined, renderLibrary) }, svg(icons.plus), 'Add exercise'),
      removedCount
        ? h('button', { class: 'btn btn-sm btn-text', onClick: () => void service.updateSettings({ libraryRemoved: [] }).then(renderLibrary) }, `Restore ${removedCount} built-in`)
        : null,
    ),
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
    h('p', { class: 'muted' }, 'Symbols (*, !) go after a set or on a day and combine freely (12!*). A mark that is a word (Pre-workout, Creatine) is a tag you tick on a day — in the day editor or its long-press menu, where "+ New mark" adds one on the spot — so days can be tracked by it.'),
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
      const r = await service.importWeeks(parsed.weeks, parsed.settings, parsed.remove);
      ctx.toast(
        `Imported ${r.added} new week${r.added === 1 ? '' : 's'}${r.replaced ? `, replaced ${r.replaced}` : ''}` +
          (r.removed ? `, removed ${r.removed} old or empty duplicate${r.removed === 1 ? '' : 's'}` : ''),
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
    sessionCard,
    libraryCard,
    legend,
    marks,
    data,
  );
}
