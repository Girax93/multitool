// Inline editing for the workout grid: an input laid over a cell (or put in
// place of an element) so a value can be typed straight into the sheet.
// Enter / Tab commit and let the caller move on; Escape cancels; losing
// focus commits. Only one inline editor is open at a time.

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

  let done = false;
  const finish = (via: CommitVia | 'escape'): void => {
    if (done) return;
    done = true;
    const text = field.value;
    field.removeEventListener('blur', onBlur);
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
}
