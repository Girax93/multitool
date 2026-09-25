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
  clearDay,
  clearWeek,
  dayHasHappened,
  dayHasMark,
  footnotesFor,
  getSet,
  isNumbered,
  isWordMark,
  moveExercise,
  nextFootnoteNumber,
  numberedFootnotes,
  removeDay,
  removeExercise,
  removeFootnote,
  setDayDate,
  setDayWeekday,
  setExerciseWeight,
  toIsoDate,
  toggleDayMark,
  toggleRef,
  updateDay,
  updateExercise,
  formatSeconds,
  parseSeconds,
  updateExerciseDayStyle,
  weekHasBegun,
  updateFootnote,
  updateSet,
  type CellStyle,
  type Exercise,
  type Week,
} from './model.js';
import { MUSCLE_GROUPS, describeEntry, matchLibrary, muscleLabel, slug, type LibraryExercise, type LoadRule, type MuscleGroup, type MuscleRole } from './library.js';
import type { WorkoutService } from './service.js';

type Scope = 'set' | 'exercise' | 'day';

function field(label: string, input: HTMLElement): HTMLElement {
  return h('label', { class: 'field-col' }, h('span', { class: 'field-label' }, label), input);
}

export function chip(label: string, active: boolean, onClick: () => void, extraClass = ''): HTMLElement {
  return h('button', { type: 'button', class: `chip${active ? ' chip-active' : ''}${extraClass ? ` ${extraClass}` : ''}`, onClick }, label);
}

/**
 * "+ link" for a text field: inserts `[text](https://…)` at the caret (the
 * selection becomes the link text) and fires `input` so the field's handler
 * saves it. Notes render such links as clickable.
 */
export function linkChip(field: HTMLInputElement | HTMLTextAreaElement): HTMLElement {
  return chip('+ link', false, () => {
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? start;
    const selected = field.value.slice(start, end);
    const label = selected || 'text';
    const url = 'https://';
    const insert = `[${label}](${url})`;
    field.value = field.value.slice(0, start) + insert + field.value.slice(end);
    field.focus();
    // leave the caret where the address goes, or select the placeholder label
    if (selected) {
      const at = start + insert.length - 1;
      field.setSelectionRange(at, at);
    } else field.setSelectionRange(start + 1, start + 1 + label.length);
    field.dispatchEvent(new Event('input'));
  }, 'chip-link');
}

/** Small hint under note fields. */
export function linkHint(): HTMLElement {
  return h('p', { class: 'muted field-hint' }, 'Links: paste a URL, or write [text](https://…).');
}

// ---- Marks ----------------------------------------------------------------------
//
// Marks come from the tool's list (Settings → Workout → Marks). Symbols ("*",
// "!") go on set cells, exercise headers and days, concatenated like the
// sheet; word marks ("Pre-workout") are reusable tags ticked on a day so days
// can be tracked by them (Ari, 2026-09-25: "specific marks that I want to add
// for tracking purposes, that I might reuse").

/** What the chips act on: has / toggle for one cell; `words` when word marks apply (a day). */
export interface MarkState {
  has(symbol: string): boolean;
  toggle(symbol: string): void;
  words: boolean;
}

/** Chips for every mark in the list (symbols only unless `state.words`); a day gets "+ New mark", which adds to the list and ticks it. */
export function markChips(service: WorkoutService, state: MarkState, rerender: () => void): HTMLElement {
  const marks = service.settings.get().marks.filter((m) => m.symbol.trim() && (state.words || !isWordMark(m.symbol)));
  const row = h('div', { class: 'chips chips-tight', dataset: { testid: 'mark-chips' } });
  for (const m of marks) {
    const c = chip(m.symbol, state.has(m.symbol), () => {
      state.toggle(m.symbol);
      rerender();
    }, isWordMark(m.symbol) ? 'chip-tag' : 'chip-mark');
    if (m.meaning) c.title = m.meaning;
    row.appendChild(c);
  }
  if (state.words) {
    const input = h('input', {
      type: 'text',
      class: 'input input-sm chip-input',
      placeholder: 'New mark, e.g. Pre-workout',
      hidden: true,
      autocomplete: 'off',
      dataset: { testid: 'mark-new-input' },
    });
    const add = (): void => {
      const sym = service.addMark(input.value);
      input.value = '';
      if (!sym) return;
      if (!state.has(sym)) state.toggle(sym);
      rerender();
    };
    input.addEventListener('keydown', (ev: Event) => {
      const e = ev as KeyboardEvent;
      if (e.key === 'Enter') {
        e.preventDefault();
        add();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        input.value = '';
        input.hidden = true;
      }
    });
    input.addEventListener('blur', () => {
      if (input.value.trim()) add();
      else input.hidden = true;
    });
    const plus = chip('+ New mark', false, () => {
      input.hidden = false;
      input.focus();
    }, 'chip-add');
    plus.dataset['testid'] = 'mark-new';
    row.append(plus, input);
  }
  return row;
}

/** Colour / star swatches from the legend. `current` is the style being edited. */
export function swatches(service: WorkoutService, current: CellStyle, onPick: (style: CellStyle) => void): HTMLElement {
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
    // Marks: tick word marks and symbols from the list (or add a new one); the symbols also sit in a free field.
    const symbols = settings.marks.map((m) => m.symbol);
    const marks = h('input', { type: 'text', class: 'input input-short', placeholder: 'symbols', title: 'Symbol marks as typed in the sheet, e.g. * (bad sleep)', value: day.marks ?? '', dataset: { testid: 'day-marks' } });
    marks.addEventListener('input', () => service.update(weekId, (x) => updateDay(x, dayId, { marks: marks.value })));
    const dayMarks = markChips(
      service,
      {
        words: true,
        has: (m) => dayHasMark(service.get(weekId)?.days.find((d) => d.id === dayId) ?? day, m, symbols),
        toggle: (m) =>
          service.update(weekId, (x) => {
            const cur = x.days.find((d) => d.id === dayId);
            return cur ? updateDay(x, dayId, toggleDayMark(cur, m, symbols)) : x;
          }),
      },
      render,
    );
    dayMarks.appendChild(marks); // the raw symbols, for anything the chips do not cover
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
      h('div', { class: 'field-col' }, h('span', { class: 'field-label' }, 'Marks'), dayMarks),
      field('Notes', notes),
      h('div', { class: 'chips chips-tight' }, linkChip(notes)),
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
        // A day that has happened is never removed: "delete" clears it and marks
        // it red, so the week (and the calendar) keep showing the day off. A day
        // still ahead is simply taken out of the week.
        dayHasHappened(day, toIsoDate(new Date()))
          ? h(
              'button',
              {
                type: 'button',
                class: 'btn btn-text btn-danger-text',
                dataset: { testid: 'day-clear' },
                onClick: async () => {
                  if (await confirmSheet(`Clear ${day.weekday}? Everything logged on it is removed and the day stays in the week, marked as no workout.`, 'Mark as no workout')) {
                    service.update(weekId, (x) => clearDay(x, dayId));
                    sheet.close();
                  }
                },
              },
              'No workout (clear day)',
            )
          : h(
              'button',
              {
                type: 'button',
                class: 'btn btn-text btn-danger-text',
                dataset: { testid: 'day-remove' },
                onClick: async () => {
                  if (await confirmSheet(`Remove ${day.weekday} from this week?`, 'Remove day')) {
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
      h('div', { class: 'chips chips-tight' }, linkChip(notes)),
      linkHint(),
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

// ---- Exercise editors ------------------------------------------------------------
//
// One compact form per exercise, grouped the way Ari asked (2026-09-25):
//   Exercise  name · stats as (library entry, with a shortcut to its muscles) · note under the name
//   Weight    kg · ×1 / ×2 dumbbells or Bodyweight + share · sets · target reps · timed hold
//   Timer     rest after each set (or per set) · prep before a hold
// Tapping an exercise in the grid opens the form for that exercise alone
// (`openExerciseEditor`); the week's list of all exercises, with add / move /
// remove, is `openExercisesEditor` (week menu, "Add exercises").

/** The form for one exercise; `rerender` rebuilds the sheet after a structural change (per-set rests, load rule, sets). */
function exerciseForm(service: WorkoutService, weekId: string, ex: Exercise, rerender: () => void): HTMLElement {
  const settings = service.settings.get();
  const session = settings.session;
  const patch = (p: Partial<Omit<Exercise, 'id'>>): void => {
    service.update(weekId, (x) => updateExercise(x, ex.id, p));
  };
  /** The exercise as it is now (the sheet may not have re-rendered since a change). */
  const current = (): Exercise => service.get(weekId)?.exercises.find((e) => e.id === ex.id) ?? ex;
  const muted = (text: string): HTMLElement => h('span', { class: 'muted-inline' }, text);
  const item = (...children: (HTMLElement | null)[]): HTMLElement => h('span', { class: 'exf-item' }, ...children);

  // ---- Exercise: name, library entry, note
  const name = h('input', { type: 'text', class: 'input exf-grow', placeholder: 'Exercise', value: ex.name, dataset: { ex: ex.id, testid: 'exercise-name' } });
  name.addEventListener('input', () => patch({ name: name.value }));
  const matched = matchLibrary(ex, settings.library);
  const libSel = h(
    'select',
    { class: 'input input-sm ex-lib', 'aria-label': 'Library exercise', title: 'Which library exercise this counts as in the stats (muscle groups, load)', dataset: { testid: 'exercise-lib' } },
    h('option', { value: '' }, matched && !ex.lib ? `↔ ${matched.name} (matched by name)` : 'Not in the library'),
    ...settings.library.map((e) => h('option', { value: e.id }, e.name)),
  );
  libSel.value = ex.lib ?? '';
  libSel.addEventListener('change', () => {
    patch({ lib: libSel.value || undefined });
    rerender();
  });
  const libEdit = h(
    'button',
    {
      type: 'button',
      class: 'iconbtn iconbtn-sm',
      title: matched ? `Muscle groups and load of “${matched.name}” (library)` : 'Add to the library: muscle groups and load for the stats',
      'aria-label': 'Edit in the library',
      dataset: { testid: 'exercise-lib-edit' },
      onClick: () => openLibraryEditor(service, service.ensureLibraryEntry(weekId, current()).id, rerender),
    },
    svg(icons.edit),
  );
  const note = h('input', { type: 'text', class: 'input exf-full', placeholder: 'Note under the name (optional)', value: ex.note ?? '', dataset: { testid: 'exercise-note' } });
  note.addEventListener('input', () => patch({ note: note.value }));

  // ---- Weight: kg, how a rep is weighed (library load rule), sets, reps, timed
  const load: LoadRule = matched?.load ?? { kind: 'external', dumbbells: 1 };
  const bodyweight = load.kind === 'bodyweight';
  // A changed weight turns the header purple (the sheet's "weight increased") and becomes the library's default.
  const weight = h('input', {
    type: 'text',
    class: 'input input-short',
    placeholder: bodyweight ? '+ kg' : 'weight',
    title: bodyweight ? 'Weight added on top of the bodyweight (a dumbbell held), if any' : 'The weight written under the name, e.g. 24kg',
    value: ex.weight,
    dataset: { testid: 'exercise-weight' },
  });
  weight.addEventListener('input', () => {
    const previous = service.previousWeight(weekId, ex);
    service.update(weekId, (x) => setExerciseWeight(x, ex.id, weight.value, previous));
  });
  weight.addEventListener('change', () => service.rememberWeight(current(), weight.value));
  const dumbbells = h(
    'select',
    { class: 'input input-sm exf-select', 'aria-label': 'Dumbbells moved per rep', title: 'A dumbbell in each hand counts the weight twice per rep', hidden: bodyweight, dataset: { testid: 'exercise-dumbbells' } },
    h('option', { value: '1' }, '× 1 dumbbell'),
    h('option', { value: '2' }, '× 2 dumbbells'),
    h('option', { value: 'none' }, 'no load'),
  );
  dumbbells.value = load.kind === 'external' ? String(load.dumbbells) : load.kind === 'none' ? 'none' : '1';
  dumbbells.addEventListener('change', () => {
    service.setExerciseLoad(weekId, current(), dumbbells.value === 'none' ? { kind: 'none' } : { kind: 'external', dumbbells: dumbbells.value === '2' ? 2 : 1 });
    rerender();
  });
  const bwChip = chip(
    'Bodyweight',
    bodyweight,
    () => {
      service.setExerciseLoad(weekId, current(), bodyweight ? { kind: 'external', dumbbells: 1 } : { kind: 'bodyweight', factor: matched?.load.kind === 'bodyweight' ? matched.load.factor : 1 });
      rerender();
    },
    'chip-toggle',
  );
  bwChip.dataset['testid'] = 'exercise-bodyweight';
  bwChip.title = 'The rep moves a share of your bodyweight (from the day’s weigh-in, else the last one logged), plus any kg written';
  const pct = h('input', {
    type: 'number',
    class: 'input input-num input-xs',
    inputMode: 'numeric',
    min: '1',
    max: '150',
    step: '1',
    value: bodyweight ? String(Math.round(load.factor * 100)) : '100',
    'aria-label': 'Share of bodyweight moved per rep',
    dataset: { testid: 'exercise-bw-factor' },
  });
  pct.addEventListener('change', () => {
    const v = parseFloat(pct.value);
    if (v > 0) service.setExerciseLoad(weekId, current(), { kind: 'bodyweight', factor: Math.round(v) / 100 });
    else pct.value = bodyweight ? String(Math.round(load.factor * 100)) : '100';
  });
  const pctItem = item(pct, muted('% of bodyweight'));
  pctItem.hidden = !bodyweight;
  pctItem.title = 'A push-up moves about 64 %, a squat 85 %, a pull-up or a handstand 100 %';
  const sets = h('input', { type: 'number', class: 'input input-num input-xs', inputMode: 'numeric', min: 1, max: 10, value: String(ex.sets), 'aria-label': 'Sets', dataset: { testid: 'exercise-sets' } });
  sets.addEventListener('change', () => {
    const n = Math.min(10, Math.max(1, parseInt(sets.value, 10) || 1));
    patch({ sets: n });
    rerender();
  });
  // Target reps per set ("8–12"), shown on the header's facts line.
  const reps = h('input', { type: 'text', class: 'input input-xs', placeholder: '8–12', value: ex.reps ?? '', 'aria-label': 'Target reps per set', title: 'Target reps per set, e.g. 8–12; shown under the name', dataset: { testid: 'exercise-reps' } });
  reps.addEventListener('input', () => patch({ reps: reps.value }));
  const repsItem = item(muted('Reps'), reps);
  repsItem.hidden = !!ex.timedSec; // a hold has a time, not reps
  // Timed sets (handstand holds): workout mode counts the work time down before the rest.
  const timed = h('input', { type: 'checkbox', checked: !!ex.timedSec, dataset: { testid: 'exercise-timed' } });
  const work = h('input', {
    type: 'text',
    class: 'input input-short',
    inputMode: 'numeric',
    placeholder: '1:30',
    value: ex.timedSec ? formatSeconds(ex.timedSec) : '',
    hidden: !ex.timedSec,
    'aria-label': 'Hold per set',
    title: 'How long each hold lasts',
    dataset: { testid: 'exercise-work' },
  });
  work.addEventListener('change', () => {
    const sec = parseSeconds(work.value);
    if (sec && sec > 0) patch({ timedSec: sec });
    else work.value = current().timedSec ? formatSeconds(current().timedSec ?? 0) : '';
  });

  // ---- Timer: rest after a set (one value, or one per set), prep before a hold
  const restField = (value: number | undefined, label: string, onChange: (sec: number | undefined) => void, testid: string): HTMLElement => {
    const input = h('input', {
      type: 'text',
      class: 'input input-short',
      inputMode: 'numeric',
      placeholder: formatSeconds(session.restSec),
      value: value !== undefined ? formatSeconds(value) : '',
      'aria-label': label,
      dataset: { testid },
    });
    input.addEventListener('change', () => {
      const sec = input.value.trim() ? parseSeconds(input.value) : null;
      const ok = sec !== null && sec > 0;
      onChange(ok ? sec : undefined);
      input.value = ok ? formatSeconds(sec) : '';
    });
    return input;
  };
  let restItem: HTMLElement;
  if (ex.restPerSet?.length) {
    const fields: HTMLElement[] = [];
    for (let k = 0; k < ex.sets; k++) {
      fields.push(
        h(
          'span',
          { class: 'ex-rest-set' },
          muted(`${k + 1}`),
          restField(ex.restPerSet?.[k] ?? ex.restSec, `Rest after set ${k + 1}`, (sec) => {
            service.update(weekId, (x) => {
              const cur = x.exercises.find((e) => e.id === ex.id);
              const list: (number | undefined)[] = Array.from({ length: cur?.sets ?? ex.sets }, (_, j) => cur?.restPerSet?.[j]);
              list[k] = sec;
              return updateExercise(x, ex.id, { restPerSet: list });
            });
          }, 'exercise-rest-set'),
        ),
      );
    }
    restItem = item(
      muted('Rest'),
      ...fields,
      h('button', { type: 'button', class: 'btn btn-sm btn-text', dataset: { testid: 'exercise-rest-same' }, title: 'One rest for every set', onClick: () => { patch({ restPerSet: undefined }); rerender(); } }, 'Same for all'),
    );
  } else {
    restItem = item(
      muted('Rest'),
      restField(ex.restSec, 'Rest after each set', (sec) => patch({ restSec: sec }), 'exercise-rest'),
      muted('after each set'),
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-sm btn-text',
          dataset: { testid: 'exercise-rest-per-set' },
          title: 'A different rest after each set',
          onClick: () => {
            service.update(weekId, (x) => {
              const cur = x.exercises.find((e) => e.id === ex.id);
              return updateExercise(x, ex.id, { restPerSet: Array.from({ length: cur?.sets ?? ex.sets }, () => cur?.restSec ?? session.restSec) });
            });
            rerender();
          },
        },
        'Per set',
      ),
    );
  }
  const prep = h('input', {
    type: 'text',
    class: 'input input-short',
    inputMode: 'numeric',
    placeholder: formatSeconds(session.prepSec),
    value: ex.prepSec !== undefined ? formatSeconds(ex.prepSec) : '',
    'aria-label': 'Prep before each hold',
    dataset: { testid: 'exercise-prep' },
  });
  prep.addEventListener('change', () => {
    const sec = prep.value.trim() ? parseSeconds(prep.value) : null;
    patch({ prepSec: sec !== null && sec >= 0 ? sec : undefined });
    prep.value = sec !== null && sec >= 0 ? formatSeconds(sec) : '';
  });
  const prepItem = item(muted('Prep'), prep, muted('before each hold'));
  prepItem.hidden = !ex.timedSec;
  prepItem.dataset['testid'] = 'exercise-prep-row';
  timed.addEventListener('change', () => {
    const sec = timed.checked ? (parseSeconds(work.value) ?? session.workSec) : undefined;
    patch({ timedSec: sec });
    work.hidden = !timed.checked;
    prepItem.hidden = !timed.checked;
    repsItem.hidden = timed.checked;
    if (timed.checked) {
      work.value = formatSeconds(sec ?? 0);
      work.focus();
    }
  });

  return h(
    'div',
    { class: 'exf', dataset: { testid: 'exercise-form', ex: ex.id } },
    h('span', { class: 'exf-label' }, 'Exercise'),
    h('div', { class: 'exf-fields' }, name, h('span', { class: 'exf-item exf-grow' }, muted('Stats as'), libSel, libEdit), note),
    h('span', { class: 'exf-label' }, 'Weight'),
    h(
      'div',
      { class: 'exf-fields' },
      item(weight, dumbbells, bwChip),
      pctItem,
      item(muted('Sets'), sets),
      repsItem,
      item(h('label', { class: 'check check-inline', title: 'Each set is a timed hold; workout mode counts it down' }, timed, h('span', null, 'Timed')), work),
    ),
    h('span', { class: 'exf-label' }, 'Timer'),
    h('div', { class: 'exf-fields' }, restItem, prepItem),
  );
}

/** One exercise on its own: what a tap on its header cell opens (Ari: "only show that exercise"). */
export function openExerciseEditor(service: WorkoutService, weekId: string, exId: string): Sheet {
  const sheet = openSheet({ title: 'Exercise', class: 'sheet-exercise' });
  const render = (): void => {
    const w = service.get(weekId);
    const ex = w?.exercises.find((e) => e.id === exId);
    if (!w || !ex) {
      sheet.close();
      return;
    }
    sheet.setTitle(ex.name.trim() || 'Exercise');
    const form = exerciseForm(service, weekId, ex, render);
    form.querySelector<HTMLInputElement>('[data-testid="exercise-name"]')?.addEventListener('input', (e) => sheet.setTitle((e.target as HTMLInputElement).value.trim() || 'Exercise'));
    replace(
      sheet.body,
      form,
      h(
        'div',
        { class: 'row row-between sheet-actions' },
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-text btn-danger-text',
            dataset: { testid: 'exercise-remove' },
            onClick: async () => {
              if (await confirmSheet(`Remove “${ex.name || 'this exercise'}” from this week (its sets and notes go too)?`, 'Remove')) {
                service.update(weekId, (x) => removeExercise(x, ex.id));
                sheet.close();
              }
            },
          },
          'Remove from this week',
        ),
        h('button', { type: 'button', class: 'btn btn-primary', dataset: { testid: 'exercise-done' }, onClick: () => sheet.close() }, 'Done'),
      ),
    );
  };
  render();
  return sheet;
}

/** Every exercise of the week: add (from the library or blank), reorder, remove; each with the same form. */
export function openExercisesEditor(service: WorkoutService, weekId: string, focusId?: string): Sheet {
  const sheet = openSheet({ title: 'Exercises this week', class: 'sheet-exercise' });
  let focus = focusId;
  const render = (): void => {
    const w = service.get(weekId);
    if (!w) {
      sheet.close();
      return;
    }
    const rows = w.exercises.map((ex, i) => exerciseRow(w, ex, i));
    const addBlank = (): void => {
      const id = uid('ex');
      service.update(weekId, (x) => addExercise(x, { id, name: '', weight: '', sets: service.settings.get().defaultSets }));
      focus = id;
      render();
    };
    const addBtn = h(
      'button',
      {
        type: 'button',
        class: 'btn',
        dataset: { testid: 'exercise-add' },
        onClick: () => {
          openLibraryPicker(service, (entry) => {
            if (!entry) {
              addBlank();
              return;
            }
            const id = uid('ex');
            service.update(weekId, (x) =>
              addExercise(x, clean({ id, name: entry.name, weight: entry.weight ?? '', sets: entry.sets ?? service.settings.get().defaultSets, timedSec: entry.timedSec, lib: entry.id })),
            );
            render();
          });
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
      // Focus the new row's name a moment later (the sheet is still settling) —
      // unless something else in the sheet got focus in the meantime (a fast
      // typist, or the test runner, already moved on to the weight field).
      setTimeout(() => {
        const active = document.activeElement;
        if (active && active !== document.body && sheet.body.contains(active) && active !== el) return;
        el?.focus();
      }, 30);
    }
  };

  const exerciseRow = (w: Week, ex: Exercise, i: number): HTMLElement =>
    h(
      'div',
      { class: 'ex-row' },
      exerciseForm(service, weekId, ex, render),
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
          const hasData = Object.values(existing.cells).some((ed) => ed.sets.some((s) => (s.v ?? '').trim() !== ''));
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
      h('div', { class: 'chips chips-tight' }, linkChip(notes)),
      h(
        'div',
        { class: 'row row-between sheet-actions' },
        // A week that has begun stays in the log as a no-workout week (Ari
        // tracks the weeks he did not train): "delete" clears it and marks its
        // days red. A week that has not started yet is removed for real.
        weekHasBegun(w, toIsoDate(new Date()))
          ? h(
              'button',
              {
                type: 'button',
                class: 'btn btn-text btn-danger-text',
                dataset: { testid: 'week-clear' },
                onClick: async () => {
                  if (await confirmSheet(`Clear ${w.label}? Everything logged in it is removed; the week stays as a no-workout week with its number and dates.`, 'Mark as no workout')) {
                    service.update(weekId, (x) => clearWeek(x, toIsoDate(new Date())));
                    ctx.toast(`${w.label} marked as no workout`);
                    sheet.close();
                  }
                },
              },
              'No workout (clear week)',
            )
          : h(
              'button',
              {
                type: 'button',
                class: 'btn btn-text btn-danger-text',
                dataset: { testid: 'week-delete' },
                onClick: async () => {
                  if (await confirmSheet(`Delete ${w.label}? It has not started yet, so it is removed entirely.`, 'Delete week')) {
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
    h('div', { class: 'chips chips-tight' }, linkChip(text)),
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

// ---- Exercise library ---------------------------------------------------------------

/** Pick an exercise from the library (or none for a blank row). */
export function openLibraryPicker(service: WorkoutService, onPick: (entry: LibraryExercise | undefined) => void): Sheet {
  const sheet = openSheet({ title: 'Add exercise' });
  const search = h('input', { type: 'search', class: 'input', placeholder: 'Search the library', autocomplete: 'off', dataset: { testid: 'library-search' } });
  const list = h('div', { class: 'list' });
  const render = (): void => {
    const q = search.value.trim().toLowerCase();
    const entries = service.settings.get().library.filter((e) => !q || e.name.toLowerCase().includes(q) || e.muscles.some((m) => muscleLabel(m.group).toLowerCase().includes(q)));
    replace(
      list,
      ...entries.map((e) =>
        h(
          'button',
          { type: 'button', class: 'list-row list-btn', dataset: { testid: 'library-pick', lib: e.id }, onClick: () => sheet.closeThen(() => onPick(e)) },
          h('span', { class: 'list-main' }, h('span', { class: 'list-title' }, e.name), h('span', { class: 'list-sub' }, describeEntry(e))),
        ),
      ),
      entries.length ? null : h('p', { class: 'muted' }, 'Nothing matches.'),
    );
  };
  search.addEventListener('input', render);
  render();
  replace(
    sheet.body,
    search,
    list,
    h(
      'div',
      { class: 'row row-between sheet-actions' },
      h('button', { type: 'button', class: 'btn btn-text', dataset: { testid: 'library-blank' }, onClick: () => sheet.closeThen(() => onPick(undefined)) }, 'Blank exercise'),
      h('button', { type: 'button', class: 'btn', onClick: () => sheet.closeThen(() => openLibraryEditor(service, undefined)) }, svg(icons.plus), 'New in library'),
    ),
  );
  setTimeout(() => search.focus(), 30);
  return sheet;
}

/** Edit one library exercise (or create one): name, muscles, load rule, timing, other names. */
export function openLibraryEditor(service: WorkoutService, id: string | undefined, onDone?: () => void): Sheet {
  const existing = id ? service.settings.get().library.find((e) => e.id === id) : undefined;
  const sheet = openSheet({ title: existing ? existing.name : 'New exercise' });
  const draft: LibraryExercise = existing
    ? structuredClone(existing)
    : { id: '', name: '', muscles: [], load: { kind: 'bodyweight', factor: 1 }, sets: service.settings.get().defaultSets };

  const save = (): void => {
    const library = service.settings.get().library;
    if (!draft.name.trim()) return;
    if (!draft.id) {
      let base = slug(draft.name);
      let candidate = base;
      for (let n = 2; library.some((e) => e.id === candidate); n++) candidate = `${base}-${n}`;
      draft.id = candidate;
      base = candidate;
    }
    const next = library.some((e) => e.id === draft.id) ? library.map((e) => (e.id === draft.id ? clean(draft) : e)) : [...library, clean(draft)];
    void service.updateSettings({ library: next });
  };

  const field = (label: string, input: HTMLElement, hint?: string): HTMLElement =>
    h('label', { class: 'field-col' }, h('span', { class: 'field-label' }, label, hint ? h('span', { class: 'field-hint' }, hint) : null), input);

  const name = h('input', { type: 'text', class: 'input', value: draft.name, placeholder: 'Exercise name', dataset: { testid: 'lib-name' } });
  name.addEventListener('input', () => {
    draft.name = name.value;
    save();
  });

  // muscles: two rows of chips, a group is main or helping (or neither)
  const muscleChips = (role: MuscleRole): HTMLElement =>
    h(
      'div',
      { class: 'chips chips-tight' },
      ...MUSCLE_GROUPS.map((m) => {
        const active = draft.muscles.some((u) => u.group === m.id && u.role === role);
        return chip(
          m.label,
          active,
          () => {
            draft.muscles = draft.muscles.filter((u) => u.group !== m.id);
            if (!active) draft.muscles.push({ group: m.id as MuscleGroup, role });
            save();
            render();
          },
          `chip-${role}`,
        );
      }),
    );

  const loadKinds: { id: LoadRule['kind']; label: string }[] = [
    { id: 'external', label: 'Dumbbell / weight' },
    { id: 'bodyweight', label: 'Bodyweight' },
    { id: 'none', label: 'No load' },
  ];

  const render = (): void => {
    const load = draft.load;
    const kindSeg = h(
      'div',
      { class: 'segmented segmented-sm', role: 'radiogroup' },
      ...loadKinds.map((k) =>
        h(
          'button',
          {
            type: 'button',
            class: `seg${load.kind === k.id ? ' seg-active' : ''}`,
            role: 'radio',
            'aria-checked': String(load.kind === k.id),
            dataset: { testid: `lib-load-${k.id}` },
            onClick: () => {
              draft.load = k.id === 'external' ? { kind: 'external', dumbbells: 1 } : k.id === 'bodyweight' ? { kind: 'bodyweight', factor: load.kind === 'bodyweight' ? load.factor : 1 } : { kind: 'none' };
              save();
              render();
            },
          },
          k.label,
        ),
      ),
    );
    let loadDetail: HTMLElement | null = null;
    if (load.kind === 'external') {
      const dumb = h(
        'div',
        { class: 'segmented segmented-sm', role: 'radiogroup' },
        ...([1, 2] as const).map((n) =>
          h('button', { type: 'button', class: `seg${load.dumbbells === n ? ' seg-active' : ''}`, role: 'radio', 'aria-checked': String(load.dumbbells === n), dataset: { testid: `lib-dumbbells-${n}` }, onClick: () => { draft.load = { kind: 'external', dumbbells: n }; save(); render(); } }, n === 1 ? '1 dumbbell' : '2 dumbbells'),
        ),
      );
      loadDetail = field('Moved at once', dumb, 'A one-arm row moves one dumbbell per rep; a chest press with a dumbbell in each hand moves two, so the written weight counts twice.');
    } else if (load.kind === 'bodyweight') {
      const pct = h('input', { type: 'number', class: 'input input-num input-short', min: '1', max: '150', step: '1', value: String(Math.round(load.factor * 100)), dataset: { testid: 'lib-factor' } });
      pct.addEventListener('change', () => {
        const v = parseFloat(pct.value);
        if (v > 0) {
          draft.load = { kind: 'bodyweight', factor: Math.round(v) / 100 };
          save();
        }
      });
      loadDetail = field('Share of bodyweight moved per rep (%)', h('div', { class: 'row' }, pct, h('span', { class: 'muted-inline' }, '% of the day\u2019s bodyweight, plus any weight written on the exercise')), 'A push-up moves about 64 %, a squat about 85 %, a pull-up 100 %.');
    }
    const timed = h('input', { type: 'checkbox', checked: !!draft.timedSec, dataset: { testid: 'lib-timed' } });
    const work = h('input', { type: 'text', class: 'input input-short', inputMode: 'numeric', placeholder: '1:30', value: draft.timedSec ? formatSeconds(draft.timedSec) : '', hidden: !draft.timedSec, 'aria-label': 'Work time per set' });
    timed.addEventListener('change', () => {
      draft.timedSec = timed.checked ? (parseSeconds(work.value) ?? service.settings.get().session.workSec) : undefined;
      work.hidden = !timed.checked;
      if (timed.checked) work.value = formatSeconds(draft.timedSec ?? 0);
      save();
    });
    work.addEventListener('change', () => {
      const sec = parseSeconds(work.value);
      if (sec && sec > 0) {
        draft.timedSec = sec;
        save();
      }
    });
    const sets = h('input', { type: 'number', class: 'input input-num input-short', min: '1', max: '10', value: String(draft.sets ?? 3) });
    sets.addEventListener('change', () => {
      draft.sets = Math.min(10, Math.max(1, parseInt(sets.value, 10) || 3));
      save();
    });
    // The weight written on the exercise when it is added to a week; follows the last weight typed in a week.
    const defWeight = h('input', { type: 'text', class: 'input input-short', placeholder: 'e.g. 24kg', value: draft.weight ?? '', dataset: { testid: 'lib-weight' } });
    defWeight.addEventListener('change', () => {
      draft.weight = defWeight.value.trim() || undefined;
      save();
    });
    const aliases = h('input', { type: 'text', class: 'input', value: (draft.aliases ?? []).join(', '), placeholder: 'e.g. "NO BENCH: Dumbbell Rows"', dataset: { testid: 'lib-aliases' } });
    aliases.addEventListener('change', () => {
      draft.aliases = aliases.value.split(',').map((x) => x.trim()).filter(Boolean);
      save();
    });
    const note = h('textarea', { class: 'input textarea', rows: 3, value: draft.note ?? '', placeholder: 'Where the numbers come from' });
    note.addEventListener('input', () => {
      draft.note = note.value;
      save();
    });

    replace(
      sheet.body,
      field('Name', name),
      h('div', { class: 'field-col' }, h('span', { class: 'field-label' }, 'Main muscles', h('span', { class: 'field-hint' }, 'a set counts fully for these')), muscleChips('primary')),
      h('div', { class: 'field-col' }, h('span', { class: 'field-label' }, 'Helping muscles', h('span', { class: 'field-hint' }, 'a set counts half for these')), muscleChips('secondary')),
      h('div', { class: 'field-col' }, h('span', { class: 'field-label' }, 'Weight per rep'), kindSeg),
      loadDetail,
      h('div', { class: 'row' }, h('label', { class: 'check check-inline' }, timed, h('span', null, 'Timed sets')), work, h('span', { class: 'muted-inline' }, 'Sets'), sets),
      field('Weight when added to a week', defWeight, 'Follows the last weight you type on the exercise in a week.'),
      field('Other names in the log', aliases, 'Comma separated; older spellings of this exercise land here in the stats.'),
      field('Note', note),
      h(
        'div',
        { class: 'row row-between sheet-actions' },
        draft.id
          ? h(
              'button',
              {
                type: 'button',
                class: 'btn btn-text btn-danger-text',
                dataset: { testid: 'lib-delete' },
                onClick: async () => {
                  if (await confirmSheet(`Remove "${draft.name}" from the library? Weeks that use it keep their sets; the stats just stop knowing its muscles.`, 'Remove')) {
                    const s = service.settings.get();
                    void service.updateSettings({ library: s.library.filter((e) => e.id !== draft.id), libraryRemoved: draft.builtin ? [...s.libraryRemoved, draft.id] : s.libraryRemoved });
                    sheet.close();
                  }
                },
              },
              'Remove',
            )
          : h('span'),
        h('button', { type: 'button', class: 'btn btn-primary', dataset: { testid: 'lib-done' }, onClick: () => { save(); sheet.close(); } }, 'Done'),
      ),
    );
  };
  render();
  if (onDone) {
    const orig = sheet.close.bind(sheet);
    sheet.close = () => {
      orig();
      onDone();
    };
  }
  if (!existing) setTimeout(() => name.focus(), 30);
  return sheet;
}
