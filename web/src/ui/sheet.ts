// Bottom sheet: a modal panel sliding up from the bottom, phone-friendly.
// Opening pushes a history entry so the Android back button (and browser
// back) closes the sheet instead of leaving the tool.

import { h, replace, svg } from '../core/dom.js';
import { icons } from './icons.js';

export interface Sheet {
  el: HTMLElement;
  body: HTMLElement;
  setTitle(title: string): void;
  close(): void;
  /**
   * Close, then run `fn` once the sheet's history entry is really gone. Use
   * this whenever the next step navigates or opens another sheet: closing
   * pops a history entry asynchronously, and a hash change or pushState made
   * before that pop lands would be undone by it.
   */
  closeThen(fn: () => void): void;
}

export interface SheetOptions {
  title?: string;
  /** Called once the sheet is gone (any reason). */
  onClose?: () => void;
  /** Extra class on the panel. */
  class?: string;
}

interface Entry {
  sheet: Sheet;
  pushed: boolean;
  afterClose: (() => void)[];
  destroy(): void;
}

const stack: Entry[] = [];
let listening = false;

function ensureListener(): void {
  if (listening) return;
  listening = true;
  window.addEventListener('popstate', () => {
    const top = stack[stack.length - 1];
    if (top && top.pushed) {
      top.pushed = false;
      top.destroy();
    }
  });
}

export function openSheet(opts: SheetOptions = {}): Sheet {
  ensureListener();
  const title = h('h2', { class: 'sheet-title' }, opts.title ?? '');
  const body = h('div', { class: 'sheet-body' });
  const closeBtn = h('button', { class: 'iconbtn', 'aria-label': 'Close', type: 'button' }, svg(icons.close));
  const panel = h(
    'div',
    { class: `sheet-panel${opts.class ? ` ${opts.class}` : ''}`, role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'sheet-handle' }),
    h('div', { class: 'sheet-head' }, title, closeBtn),
    body,
  );
  const backdrop = h('div', { class: 'sheet-backdrop' });
  const el = h('div', { class: 'sheet' }, backdrop, panel);
  document.body.appendChild(el);
  document.body.classList.add('sheet-open');
  requestAnimationFrame(() => el.classList.add('sheet-in'));

  let destroyed = false;
  const entry: Entry = {
    pushed: true,
    sheet: null as unknown as Sheet,
    afterClose: [],
    destroy() {
      if (destroyed) return;
      destroyed = true;
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      el.classList.remove('sheet-in');
      setTimeout(() => el.remove(), 180);
      if (stack.length === 0) document.body.classList.remove('sheet-open');
      opts.onClose?.();
      const fns = entry.afterClose.splice(0);
      for (const fn of fns) setTimeout(fn, 0);
    },
  };
  const sheet: Sheet = {
    el,
    body,
    setTitle: (t) => {
      title.textContent = t;
    },
    close() {
      if (destroyed) return;
      // Our history entry is on top: going back pops it and the popstate
      // handler destroys the sheet. Otherwise destroy directly.
      if (entry.pushed) history.back();
      else entry.destroy();
    },
    closeThen(fn) {
      if (destroyed) {
        setTimeout(fn, 0);
        return;
      }
      entry.afterClose.push(fn);
      sheet.close();
    },
  };
  entry.sheet = sheet;
  history.pushState({ sheet: true }, '');
  stack.push(entry);
  backdrop.addEventListener('click', () => sheet.close());
  closeBtn.addEventListener('click', () => sheet.close());
  return sheet;
}

/** Close every open sheet without touching history (used when a tool unmounts). */
export function closeAllSheets(): void {
  for (const e of [...stack]) {
    e.pushed = false;
    e.destroy();
  }
}

/** Simple confirm dialog rendered as a sheet. Resolves true when confirmed. */
export function confirmSheet(message: string, confirmLabel = 'Delete'): Promise<boolean> {
  return new Promise((resolve) => {
    let result = false;
    const sheet = openSheet({ title: 'Are you sure?', onClose: () => resolve(result) });
    replace(
      sheet.body,
      h('p', null, message),
      h(
        'div',
        { class: 'row row-end' },
        h('button', { class: 'btn', type: 'button', onClick: () => sheet.close() }, 'Cancel'),
        h(
          'button',
          {
            class: 'btn btn-danger',
            type: 'button',
            onClick: () => {
              result = true;
              sheet.close();
            },
          },
          confirmLabel,
        ),
      ),
    );
  });
}
