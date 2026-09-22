// Bottom-sheet editors for the workout grid: set cell, day, notes, exercises,
// week, footnote. They mutate through the service and re-render themselves
// from the current week so the sheet stays in sync with the grid.

import { h, replace, svg, uid } from '../../core/dom.js';
import type { ToolContext } from '../../core/registry.js';
import { icons } from '../../ui/icons.js';
import { confirmSheet, openSheet, type Sheet } from '../../ui/sheet.js';
import {
  WEEKDAYS,
  addDay,
  addExercise,
  addFootnote,
  clean,
  footnotesFor,
  getSet,
  isNumbered,
  moveExercise,
  nextFootnoteNumber,
  numberedFootnotes,
  removeDay,
  removeExercise,
  removeFootnote,
  setDayDate,
  setDayWeekday,
  toggleRef,
  updateDay,
  updateExercise,
  updateExerciseDayStyle,
  updateFootnote,
  updateSet,
  type CellStyle,
  type Exercise,
  type Week,
} from './model.js';
import type { WorkoutService } from './service.js';

type Scope = 'set' | 'exercise' | 'day';

function field(label: string, input: HTMLElement): HTMLElement {
  return h('label', { class: 'field-col' }, h('span', { class: 'field-label' }, label), input);
}

function chip(label: string, active: boolean, onClick: () => void, extraClass = ''): HTMLElement {
  return h('button', { type: 'button', class: `chip${active ? ' chip-active' : ''}${extraClass ? ` ${extraClass}` : ''}`, onClick }, label);
}

/** Colour / star swatches from the legend. `current` is the style being edited. */
function swatches(service: WorkoutService, current: CellStyle, onPick: (style: CellStyle) => void): HTMLElement {
  const legend = service.settings.get().legend;
  const row = h('div', { class: 'swatches' });
  for (const entry of legend) {
    const isStar = entry.color === 'star';
    const active = isStar ? !!current.star : current.c === entry.id;
    const btn = h('button', {
      type: 'button',
      class: `swatch${active ? ' swatch-active' : ''}${isStar ? ' swatch-star' : ''}`,
      title: entry.label,
      'aria-label': entry.label,
      'aria-pressed': String(active),
      onClick: () => {
        if (isStar) onPick({ star: !current.star });
        else onPick({ c: active ? undefined : entry.id });
      },
    });
    if (isStar) btn.appendChild(svg(icons.star));
    else btn.style.background = entry.color;
    row.appendChild(btn);
  }
  row.appendChild(
    h('button', { type: 'button', class: 'swatch swatch-none', title: 'No colour', 'aria-label': 'No colour', onClick: () => onPick({ c: undefined, star: false }) }, svg(icons.close)),
  );
  return row;
}

// ---- Set cell editor ---------------------------------------------------------

export interface SetTarget {
  dayId: string;
  exId: string;
  index: number;
}

export function openSetEditor(service: WorkoutService, ctx: ToolContext, weekId: string, start: SetTarget): Sheet {
  let target = start;
  let scope: Scope = 'set';
  let addingNote = false;
  const promptedDays = new Set<string>();
  const sheet = openSheet({ class: 'sheet-set' });

  const input = h('input', {
    type: 'text',
    class: 'input input-set',
    placeholder: 'reps',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: false,
    enterKeyHint: 'next',
    dataset: { testid: 'set-input' },
  });
  input.addEventListener('input', () => {
    service.update(weekId, (w) => updateSet(w, target.dayId, target.exId, target.index, { v: input.value }));
    maybePromptBodyweight();
  });
  input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      step(1);
    }
  });

  const week = (): Week | undefined => service.get(weekId);

  /** All (exercise, set) positions of the current day, in grid order. */
  const positions = (): SetTarget[] => {
    const w = week();
    if (!w) return [];
    const out: SetTarget[] = [];
    for (const ex of w.exercises) for (let i = 0; i < ex.sets; i++) out.push({ dayId: target.dayId, exId: ex.id, index: i });
    return out;
  };
  const posIndex = (): number => positions().findIndex((p) => p.exId === target.exId && p.index === target.index);

  const step = (dir: -1 | 1): void => {
    const list = positions();
    const next = list[posIndex() + dir];
    if (!next) {
      if (dir === 1) sheet.close();
      return;
    }
    target = next;
    render(true);
  };

  const maybePromptBodyweight = (): void => {
    const w = week();
    const day = w?.days.find((d) => d.id === target.dayId);
    if (!w || !day || !service.settings.get().trackBodyweight || day.bodyweight !== undefined || promptedDays.has(day.id)) return;
    promptedDays.add(day.id);
    ctx.toast(`Log bodyweight for ${day.weekday}?`, {
      action: { label: 'Add', onClick: () => openDayEditor(service, weekId, day.id) },
      durationMs: 6000,
    });
  };

  const render = (focus = false): void => {
    const w = week();
    if (!w) {
      sheet.close();
      return;
    }
    const ex = w.exercises.find((e) => e.id === target.exId);
    const day = w.days.find((d) => d.id === target.dayId);
    if (!ex || !day) {
      sheet.close();
      return;
    }
    const cell = getSet(w, day.id, ex.id, target.index);
    const exDay = day.cells[ex.id];
    const styleFor = (s: Scope): CellStyle => (s === 'set' ? cell : s === 'exercise' ? (exDay ?? {}) : day);
    const applyStyle = (style: CellStyle): void => {
      service.update(weekId, (x) => {
        if (scope === 'set') return updateSet(x, day.id, ex.id, target.index, style);
        if (scope === 'exercise') return updateExerciseDayStyle(x, day.id, ex.id, style);
        return updateDay(x, day.id, style);
      });
      render();
    };

    sheet.setTitle(`${ex.name} · ${day.weekday}`);
    if (input.value !== cell.v) input.value = cell.v;

    const marks = service.settings.get().marks;
    const markChips = h(
      'div',
      { class: 'chips' },
      ...marks.map((m) =>
        chip(m.symbol, false, () => {
          const v = input.value;
          input.value = v.endsWith(m.symbol) ? v.slice(0, -m.symbol.length) : v + m.symbol;
          input.dispatchEvent(new Event('input'));
          input.focus();
        }, 'chip-mark'),
      ),
    );

    // Only numbered notes can be attached to a set; plain notes live in the notes row.
    const notes = numberedFootnotes(w, ex.id);
    const noteChips = h(
      'div',
      { class: 'chips' },
      ...notes.map((f) =>
        chip(`${f.n} ${f.text.length > 18 ? `${f.text.slice(0, 18)}…` : f.text}`, !!cell.fn?.includes(f.n), () => {
          service.update(weekId, (x) => updateSet(x, day.id, ex.id, target.index, toggleRef(getSet(x, day.id, ex.id, target.index), f.n)));
          render();
        }),
      ),
      chip('+ note', addingNote, () => {
        addingNote = !addingNote;
        render();
      }),
    );
    let noteForm: HTMLElement | null = null;
    if (addingNote) {
      const noteInput = h('input', { type: 'text', class: 'input', placeholder: `Note ${nextFootnoteNumber(w, ex.id)} for ${ex.name} this week`, dataset: { testid: 'note-input' } });
      const save = (): void => {
        const text = noteInput.value.trim();
        if (!text) return;
        service.update(weekId, (x) => {
          const r = addFootnote(x, ex.id, text);
          return updateSet(r.week, day.id, ex.id, target.index, toggleRef(getSet(r.week, day.id, ex.id, target.index), r.n));
        });
        addingNote = false;
        render();
      };
      noteInput.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          save();
        }
      });
      noteForm = h('div', { class: 'row' }, noteInput, h('button', { type: 'button', class: 'btn btn-sm', dataset: { testid: 'note-save' }, onClick: save }, 'Add'));
      setTimeout(() => noteInput.focus(), 50);
    }

    const scopeCtl = h(
      'div',
      { class: 'segmented segmented-sm', role: 'radiogroup' },
      ...(
        [
          ['set', 'Set'],
          ['exercise', 'Exercise'],
          ['day', 'Day'],
        ] as [Scope, string][]
      ).map(([s, label]) =>
        h(
          'button',
          {
            type: 'button',
            class: `seg${scope === s ? ' seg-active' : ''}`,
            role: 'radio',
            'aria-checked': String(scope === s),
            onClick: () => {
              scope = s;
              render();
            },
          },
          label,
        ),
      ),
    );

    const pos = posIndex();
    const total = positions().length;
    replace(
      sheet.body,
      h(
        'div',
        { class: 'set-nav' },
        h('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Previous set', disabled: pos <= 0, onClick: () => step(-1) }, svg(icons.chevronLeft)),
        h('span', { class: 'set-pos' }, `Set ${target.index + 1} of ${ex.sets}`, h('span', { class: 'muted-inline' }, ` · ${pos + 1}/${total}`)),
        h('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Next set', disabled: pos >= total - 1, onClick: () => step(1) }, svg(icons.chevronRight)),
      ),
      input,
      h('div', { class: 'editor-row' }, h('span', { class: 'editor-label' }, 'Marks'), markChips),
      h('div', { class: 'editor-row' }, h('span', { class: 'editor-label' }, 'Notes'), noteChips, noteForm),
      h(
        'div',
        { class: 'editor-row' },
        h('div', { class: 'row row-between' }, h('span', { class: 'editor-label' }, 'Colour'), scopeCtl),
        swatches(service, styleFor(scope), applyStyle),
      ),
      h(
        'div',
        { class: 'row row-between sheet-actions' },
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-text',
            onClick: () => {
              service.update(weekId, (x) => updateSet(x, day.id, ex.id, target.index, { v: '', fn: [], c: undefined, star: false }));
              render(true);
            },
          },
          'Clear',
        ),
        h(
          'div',
          { class: 'row' },
          h('button', { type: 'button', class: 'btn', onClick: () => sheet.close() }, 'Done'),
          h('button', { type: 'button', class: 'btn btn-primary', dataset: { testid: 'set-next' }, onClick: () => step(1) }, 'Next', svg(icons.chevronRight)),
        ),
      ),
    );
    if (focus) setTimeout(() => input.focus(), 30);
  };

  render(true);
  return sheet;
}

// ---- Day editor ----------------------------------------------------------------

export function openDayEditor(service: WorkoutService, weekId: string, dayId: string): Sheet {
  const sheet = openSheet({ title: 'Day' });
  const render = (): void => {
    const w = service.get(weekId);
    const day = w?.days.find((d) => d.id === dayId);
    if (!w || !day) {
      sheet.close();
      return;
    }
    const settings = service.settings.get();
    sheet.setTitle(`${day.weekday}${day.date ? ` · ${day.date}` : ''}`);
    // Trained on another day than planned: pick the weekday, the date follows.
    const weekdayChips = h(
      'div',
      { class: 'chips', role: 'radiogroup', 'aria-label': 'Weekday', dataset: { testid: 'day-weekday' } },
      ...WEEKDAYS.map((wd) =>
        chip(wd, wd === day.weekday, () => {
          if (wd === day.weekday) return;
          service.update(weekId, (x) => setDayWeekday(x, dayId, wd));
          render();
        }),
      ),
    );
    const dateInput = h('input', { type: 'date', class: 'input', value: day.date ?? '', dataset: { testid: 'day-date' } });
    dateInput.addEventListener('change', () => {
      service.update(weekId, (x) => setDayDate(x, dayId, dateInput.value || undefined));
      render();
    });
    const bw = h('input', {
      type: 'number',
      class: 'input',
      inputMode: 'decimal',
      step: '0.1',
      placeholder: settings.unit,
      value: day.bodyweight !== undefined ? String(day.bodyweight) : '',
      dataset: { testid: 'day-bodyweight' },
    });
    bw.addEventListener('change', () => {
      const n = parseFloat(bw.value);
      service.update(weekId, (x) => updateDay(x, dayId, { bodyweight: Number.isFinite(n) ? n : undefined }));
    });
    const marks = h('input', { type: 'text', class: 'input', placeholder: 'e.g. * (bad sleep)', value: day.marks ?? '' });
    marks.addEventListener('input', () => service.update(weekId, (x) => updateDay(x, dayId, { marks: marks.value })));
    const markChips = h(
      'div',
      { class: 'chips' },
      ...settings.marks.map((m) =>
        chip(m.symbol, false, () => {
          marks.value = marks.value.endsWith(m.symbol) ? marks.value.slice(0, -m.symbol.length) : marks.value + m.symbol;
          marks.dispatchEvent(new Event('input'));
        }, 'chip-mark'),
      ),
    );
    const notes = h('textarea', { class: 'input textarea', rows: 3, placeholder: 'Notes for this day', value: day.notes ?? '' });
    notes.addEventListener('input', () => service.update(weekId, (x) => updateDay(x, dayId, { notes: notes.value })));
    // Worked out, but not with the tracked exercises: name it and the row shows that instead of the sets.
    const alt = h('input', {
      type: 'text',
      class: 'input',
      placeholder: 'e.g. 40 min full body (YouTube), 5 km run',
      value: day.alt ?? '',
      autocomplete: 'off',
      dataset: { testid: 'day-alt' },
    });
    const altHint = h('p', { class: 'muted field-hint' });
    const altHintText = (): string =>
      alt.value.trim() ? 'Shown across the exercise columns; clear it to log sets again (they are kept).' : 'Leave empty when you did the exercises above.';
    altHint.textContent = altHintText();
    // No sheet re-render here: `change` also fires on blur, and replacing the
    // sheet while the input loses focus would re-enter the DOM update.
    alt.addEventListener('change', () => {
      service.update(weekId, (x) => updateDay(x, dayId, { alt: alt.value.trim() }));
      altHint.textContent = altHintText();
    });

    replace(
      sheet.body,
      h('div', { class: 'field-col' }, h('span', { class: 'field-label' }, 'Weekday'), weekdayChips),
      field('Date', dateInput),
      settings.trackBodyweight ? field(`Bodyweight (${settings.unit})`, bw) : null,
      field('Marks', marks),
      markChips,
      field('Notes', notes),
      h(
        'div',
        { class: 'field-col' },
        h('span', { class: 'field-label' }, 'Did something else instead?'),
        alt,
        altHint,
      ),
      h('div', { class: 'editor-row' }, h('span', { class: 'editor-label' }, 'Colour (whole day)'), swatches(service, day, (style) => {
        service.update(weekId, (x) => updateDay(x, dayId, style));
        render();
      })),
      h(
        'div',
        { class: 'row row-between sheet-actions' },
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-text btn-danger-text',
            onClick: async () => {
              if (await confirmSheet(`Remove ${day.weekday} from this week? Its sets will be lost.`, 'Remove day')) {
                service.update(weekId, (x) => removeDay(x, dayId));
                sheet.close();
              }
            },
          },
          'Remove day',
        ),
        h('button', { type: 'button', class: 'btn btn-primary', onClick: () => sheet.close() }, 'Done'),
      ),
    );
  };
  render();
  return sheet;
}

// ---- Notes cell editor -----------------------------------------------------------

export function openNotesEditor(service: WorkoutService, weekId: string, dayId: string): Sheet {
  const sheet = openSheet({ title: 'Notes' });
  const render = (): void => {
    const w = service.get(weekId);
    const day = w?.days.find((d) => d.id === dayId);
    if (!w || !day) {
      sheet.close();
      return;
    }
    sheet.setTitle(`Notes · ${day.weekday}`);
    const notes = h('textarea', { class: 'input textarea', rows: 4, placeholder: 'Anything about this session', value: day.notes ?? '', dataset: { testid: 'notes-input' } });
    notes.addEventListener('input', () => service.update(weekId, (x) => updateDay(x, dayId, { notes: notes.value })));
    replace(
      sheet.body,
      notes,
      h('div', { class: 'editor-row' }, h('span', { class: 'editor-label' }, 'Colour'), swatches(service, day.notesStyle ?? {}, (style) => {
        service.update(weekId, (x) => {
          const merged = clean({ ...(x.days.find((d) => d.id === dayId)?.notesStyle ?? {}), ...style });
          return updateDay(x, dayId, { notesStyle: Object.keys(merged).length ? merged : undefined });
        });
        render();
      })),
      h('div', { class: 'row row-end sheet-actions' }, h('button', { type: 'button', class: 'btn btn-primary', onClick: () => sheet.close() }, 'Done')),
    );
    setTimeout(() => notes.focus(), 30);
  };
  render();
  return sheet;
}

// ---- Exercises editor ------------------------------------------------------------

export function openExercisesEditor(service: WorkoutService, weekId: string, focusId?: string): Sheet {
  const sheet = openSheet({ title: 'Exercises this week' });
  let focus = focusId;
  const render = (): void => {
    const w = service.get(weekId);
    if (!w) {
      sheet.close();
      return;
    }
    const rows = w.exercises.map((ex, i) => exerciseRow(w, ex, i));
    const addBtn = h(
      'button',
      {
        type: 'button',
        class: 'btn',
        dataset: { testid: 'exercise-add' },
        onClick: () => {
          const id = uid('ex');
          service.update(weekId, (x) => addExercise(x, { id, name: '', weight: '', sets: service.settings.get().defaultSets }));
          focus = id;
          render();
        },
      },
      svg(icons.plus),
      'Add exercise',
    );
    replace(
      sheet.body,
      rows.length ? h('div', { class: 'ex-list' }, ...rows) : h('p', { class: 'muted' }, 'No exercises yet. Add the ones you train this week.'),
      h('div', { class: 'row row-between sheet-actions' }, addBtn, h('button', { type: 'button', class: 'btn btn-primary', onClick: () => sheet.close() }, 'Done')),
    );
    if (focus) {
      const el = sheet.body.querySelector<HTMLInputElement>(`input[data-ex="${focus}"]`);
      focus = undefined;
      setTimeout(() => el?.focus(), 30);
    }
  };

  const exerciseRow = (w: Week, ex: Exercise, i: number): HTMLElement => {
    const name = h('input', { type: 'text', class: 'input', placeholder: 'Exercise', value: ex.name, dataset: { ex: ex.id, testid: 'exercise-name' } });
    name.addEventListener('input', () => service.update(weekId, (x) => updateExercise(x, ex.id, { name: name.value })));
    const weight = h('input', { type: 'text', class: 'input input-short', placeholder: 'weight', value: ex.weight, dataset: { testid: 'exercise-weight' } });
    weight.addEventListener('input', () => service.update(weekId, (x) => updateExercise(x, ex.id, { weight: weight.value })));
    const sets = h('input', { type: 'number', class: 'input input-num input-short', inputMode: 'numeric', min: 1, max: 10, value: String(ex.sets), 'aria-label': 'Sets' });
    sets.addEventListener('change', () => {
      const n = Math.min(10, Math.max(1, parseInt(sets.value, 10) || 1));
      service.update(weekId, (x) => updateExercise(x, ex.id, { sets: n }));
      render();
    });
    return h(
      'div',
      { class: 'ex-row' },
      h('div', { class: 'ex-fields' }, name, h('div', { class: 'row' }, weight, h('span', { class: 'muted-inline' }, '×'), sets, h('span', { class: 'muted-inline' }, 'sets'))),
      h(
        'div',
        { class: 'ex-actions' },
        h('button', { type: 'button', class: 'iconbtn iconbtn-sm', 'aria-label': 'Move up', disabled: i === 0, onClick: () => { service.update(weekId, (x) => moveExercise(x, ex.id, -1)); render(); } }, svg(icons.arrowUp)),
        h('button', { type: 'button', class: 'iconbtn iconbtn-sm', 'aria-label': 'Move down', disabled: i === w.exercises.length - 1, onClick: () => { service.update(weekId, (x) => moveExercise(x, ex.id, 1)); render(); } }, svg(icons.arrowDown)),
        h(
          'button',
          {
            type: 'button',
            class: 'iconbtn iconbtn-sm',
            'aria-label': 'Remove',
            onClick: async () => {
              if (await confirmSheet(`Remove “${ex.name || 'this exercise'}” from this week (its sets and notes go too)?`, 'Remove')) {
                service.update(weekId, (x) => removeExercise(x, ex.id));
                render();
              }
            },
          },
          svg(icons.trash),
        ),
      ),
    );
  };
  render();
  return sheet;
}

// ---- Week editor -----------------------------------------------------------------

export function openWeekEditor(service: WorkoutService, ctx: ToolContext, weekId: string): Sheet {
  const sheet = openSheet({ title: 'Week' });
  const render = (): void => {
    const w = service.get(weekId);
    if (!w) {
      sheet.close();
      return;
    }
    const label = h('input', { type: 'text', class: 'input', value: w.label, placeholder: 'Week 22' });
    label.addEventListener('input', () => service.update(weekId, (x) => ({ ...x, label: label.value })));
    const start = h('input', { type: 'date', class: 'input', value: w.startDate ?? '' });
    start.addEventListener('change', () => {
      service.update(weekId, (x) => ({ ...x, startDate: start.value || undefined }));
      render();
    });
    const dayBoxes = WEEKDAYS.map((wd) => {
      const existing = w.days.find((d) => d.weekday === wd);
      const box = h('input', { type: 'checkbox', checked: !!existing });
      box.addEventListener('change', async () => {
        if (box.checked) {
          service.update(weekId, (x) => addDay(x, uid('d'), wd));
        } else if (existing) {
          const hasData = Object.values(existing.cells).some((ed) => ed.sets.some((s) => s.v.trim() !== ''));
          if (hasData && !(await confirmSheet(`${wd} has sets logged. Remove it anyway?`, 'Remove day'))) {
            box.checked = true;
            return;
          }
          service.update(weekId, (x) => removeDay(x, existing.id));
        }
        render();
      });
      return h('label', { class: 'check check-inline' }, box, h('span', null, wd));
    });
    const notes = h('textarea', { class: 'input textarea', rows: 2, placeholder: 'Anything about this week (plan, discoveries)', value: w.notes ?? '', dataset: { testid: 'week-notes-input' } });
    notes.addEventListener('input', () => service.update(weekId, (x) => clean({ ...x, notes: notes.value })));
    replace(
      sheet.body,
      field('Label', label),
      field('Week starts (Monday)', start),
      h('div', { class: 'field-col' }, h('span', { class: 'field-label' }, 'Training days'), h('div', { class: 'chips' }, ...dayBoxes)),
      field('Week notes', notes),
      h(
        'div',
        { class: 'row row-between sheet-actions' },
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-text btn-danger-text',
            onClick: async () => {
              if (await confirmSheet(`Delete ${w.label} and everything logged in it?`, 'Delete week')) {
                await service.deleteWeek(weekId);
                ctx.toast('Week deleted');
                sheet.close();
              }
            },
          },
          'Delete week',
        ),
        h('button', { type: 'button', class: 'btn btn-primary', onClick: () => sheet.close() }, 'Done'),
      ),
    );
  };
  render();
  return sheet;
}

// ---- Footnote editor -------------------------------------------------------------

export function openFootnoteEditor(service: WorkoutService, weekId: string, exId: string, n: number): Sheet {
  const sheet = openSheet({ title: 'Note' });
  const w = service.get(weekId);
  const ex = w?.exercises.find((e) => e.id === exId);
  const note = w ? footnotesFor(w, exId).find((f) => f.n === n) : undefined;
  if (!w || !ex || !note) {
    sheet.close();
    return sheet;
  }
  const numbered = isNumbered(note);
  sheet.setTitle(numbered ? `${ex.name} · note ${n}` : `${ex.name} · note`);
  const text = h('textarea', { class: 'input textarea', rows: 3, value: note.text, dataset: { testid: 'footnote-text' } });
  text.addEventListener('input', () => service.update(weekId, (x) => updateFootnote(x, exId, n, text.value)));
  replace(
    sheet.body,
    text,
    h(
      'div',
      { class: 'row row-between sheet-actions' },
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-text btn-danger-text',
          onClick: async () => {
            if (await confirmSheet(numbered ? 'Delete this note? References to it are removed from the sets.' : 'Delete this note?', 'Delete note')) {
              service.update(weekId, (x) => removeFootnote(x, exId, n));
              sheet.close();
            }
          },
        },
        'Delete',
      ),
      h('button', { type: 'button', class: 'btn btn-primary', onClick: () => sheet.close() }, 'Done'),
    ),
  );
  setTimeout(() => text.focus(), 30);
  return sheet;
}
