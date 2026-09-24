// Inline editing for the workout grid: an input laid over a cell (or put in
// place of an element) so a value can be typed straight into the sheet.
// Enter / Tab commit and let the caller move on; Escape cancels; losing
// focus commits. Only one inline editor is open at a time. A field can carry
// suggestions (earlier day-note pieces): a small list under the field offers
// them, filtered by what is being typed after the last comma.

import { h } from '../../core/dom.js';

export type CommitVia = 'enter' | 'tab' | 'shift-tab' | 'blur';

export interface InlineOptions {
  value: string;
  /** `overlay` fills the anchor (a table cell); `inplace` swaps the anchor element out. */
  mode: 'overlay' | 'inplace';
  /** Multi-line text (notes). Enter still commits; Shift+Enter inserts a line break. */
  multiline?: boolean;
  mono?: boolean;
  placeholder?: string;
  testid?: string;
  /** Things typed before, offered under the field (comma-separated pieces; the current piece filters them). */
  suggestions?: string[];
  /** Called exactly once, after the editor is gone. Not called on Escape. */
  onCommit(text: string, via: CommitVia): void;
}

interface Active {
  anchor: HTMLElement;
  finish(via: CommitVia | 'escape'): void;
}

let active: Active | null = null;

/** The element currently being edited inline, if any. */
export function inlineTarget(): HTMLElement | null {
  return active?.anchor ?? null;
}

/** Commit whatever is being edited (before the grid re-renders under it). */
export function commitInline(): void {
  active?.finish('blur');
}

export function cancelInline(): void {
  active?.finish('escape');
}

export function editInline(anchor: HTMLElement, opts: InlineOptions): void {
  if (active?.anchor === anchor) return;
  commitInline();

  const cls = `inline-edit${opts.mono ? ' inline-mono' : ''}${opts.mode === 'inplace' ? ' inline-inplace' : ''}`;
  const field = opts.multiline
    ? h('textarea', { class: `${cls} inline-edit-text`, rows: 2, placeholder: opts.placeholder ?? '' })
    : h('input', {
        type: 'text',
        class: cls,
        placeholder: opts.placeholder ?? '',
        autocomplete: 'off',
        autocapitalize: 'off',
        spellcheck: false,
        enterKeyHint: 'next',
      });
  field.value = opts.value;
  if (opts.testid) field.dataset['testid'] = opts.testid;
  const suggest = opts.suggestions?.length ? openSuggestions(field, opts.suggestions) : null;

  let done = false;
  const finish = (via: CommitVia | 'escape'): void => {
    if (done) return;
    done = true;
    const text = field.value;
    field.removeEventListener('blur', onBlur);
    suggest?.close();
    if (opts.mode === 'overlay') {
      anchor.classList.remove('wk-editing');
      field.remove();
    } else {
      field.replaceWith(anchor);
    }
    if (active?.anchor === anchor) active = null;
    if (via !== 'escape') opts.onCommit(text, via);
  };
  const onBlur = (): void => finish('blur');

  field.addEventListener('keydown', (ev: Event) => {
    const e = ev as KeyboardEvent;
    if (suggest?.onKey(e)) return;
    if (e.key === 'Enter' && !(opts.multiline && e.shiftKey)) {
      e.preventDefault();
      finish('enter');
    } else if (e.key === 'Tab') {
      e.preventDefault();
      finish(e.shiftKey ? 'shift-tab' : 'tab');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finish('escape');
    }
  });
  field.addEventListener('blur', onBlur);

  if (opts.mode === 'overlay') {
    anchor.classList.add('wk-editing');
    anchor.appendChild(field);
  } else {
    anchor.replaceWith(field);
  }
  active = { anchor, finish };
  field.focus();
  field.select();
  suggest?.update();
}

// ---- Suggestions ------------------------------------------------------------------

interface Suggestions {
  update(): void;
  /** True when the key was used for the list (the editor leaves it alone). */
  onKey(e: KeyboardEvent): boolean;
  close(): void;
}

const MAX_SHOWN = 6;

/**
 * The piece being typed: from the last comma / line break before the caret
 * to the caret. A selection counts as part of the piece, so accepting an
 * entry replaces it the way typing would (the editor opens with everything selected).
 */
function currentPiece(field: HTMLInputElement | HTMLTextAreaElement): { start: number; end: number; text: string } {
  const caret = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? caret;
  const before = field.value.slice(0, caret);
  const cut = Math.max(before.lastIndexOf(','), before.lastIndexOf('\n')) + 1;
  const raw = before.slice(cut);
  const start = cut + (raw.length - raw.trimStart().length);
  return { start, end, text: raw.trim() };
}

/**
 * A floating list under the field (on the body, so the grid's scroll box
 * cannot clip it). Pointer picks keep the field focused; ↑ ↓ move, Enter or
 * Tab take the highlighted entry. Pieces already in the field are not offered.
 */
function openSuggestions(field: HTMLInputElement | HTMLTextAreaElement, all: string[]): Suggestions {
  const box = h('div', { class: 'suggest', role: 'listbox', dataset: { testid: 'note-suggest' } });
  document.body.appendChild(box);
  let items: string[] = [];
  let highlighted = -1;

  const place = (): void => {
    const r = field.getBoundingClientRect();
    box.style.minWidth = `${Math.max(180, Math.round(r.width))}px`;
    box.style.left = `${Math.max(4, Math.min(Math.round(r.left), window.innerWidth - box.offsetWidth - 4))}px`;
    const below = r.bottom + 2;
    const fits = below + box.offsetHeight <= window.innerHeight - 4;
    box.style.top = `${Math.round(fits ? below : Math.max(4, r.top - box.offsetHeight - 2))}px`;
  };

  const accept = (item: string): void => {
    const piece = currentPiece(field);
    const head = field.value.slice(0, piece.start);
    const sep = head.trimEnd().endsWith(',') && !head.endsWith(' ') ? ' ' : '';
    field.value = `${head}${sep}${item}${field.value.slice(piece.end)}`;
    const caret = head.length + sep.length + item.length;
    field.setSelectionRange(caret, caret);
    highlighted = -1;
    field.dispatchEvent(new Event('input')); // the field's own handler saves; onInput refreshes the list
  };

  const render = (): void => {
    box.replaceChildren(
      ...items.map((item, i) => {
        const row = h('button', { type: 'button', class: `suggest-item${i === highlighted ? ' suggest-item-active' : ''}`, role: 'option', 'aria-selected': String(i === highlighted), tabIndex: -1 }, item);
        // pointerdown, not click: the field must not lose focus (blur commits the cell)
        row.addEventListener('pointerdown', (e: Event) => {
          e.preventDefault();
          accept(item);
        });
        return row;
      }),
    );
    box.hidden = items.length === 0;
    if (items.length) place();
  };

  const update = (): void => {
    const piece = currentPiece(field);
    const q = piece.text.toLowerCase();
    // pieces the field already holds (the one being typed included: once it is
    // complete there is nothing left to offer for it)
    const present = new Set(
      field.value
        .split(/[,\n]/)
        .map((p) => p.trim().toLowerCase())
        .filter((p) => p !== ''),
    );
    // what starts with the typed text first, then what merely contains it; recency within each
    const starts: string[] = [];
    const contains: string[] = [];
    for (const s of all) {
      const l = s.toLowerCase();
      if (present.has(l)) continue;
      if (q === '' || l.startsWith(q)) starts.push(s);
      else if (l.includes(q)) contains.push(s);
    }
    items = [...starts, ...contains].slice(0, MAX_SHOWN);
    if (highlighted >= items.length) highlighted = items.length - 1;
    render();
  };

  const onKey = (e: KeyboardEvent): boolean => {
    if (!items.length || box.hidden) return false;
    if (e.key === 'ArrowDown') {
      highlighted = Math.min(items.length - 1, highlighted + 1);
      render();
    } else if (e.key === 'ArrowUp') {
      highlighted = Math.max(-1, highlighted - 1);
      render();
    } else if ((e.key === 'Enter' || e.key === 'Tab') && highlighted >= 0) {
      const item = items[highlighted];
      if (item !== undefined) accept(item);
    } else return false;
    e.preventDefault();
    return true;
  };

  const onInput = (): void => update();
  const onScroll = (): void => {
    if (!box.hidden) place();
  };
  field.addEventListener('input', onInput);
  field.addEventListener('click', onInput);
  document.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onScroll);

  return {
    update,
    onKey,
    close: () => {
      field.removeEventListener('input', onInput);
      field.removeEventListener('click', onInput);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      box.remove();
    },
  };
}
