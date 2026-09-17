import { h } from '../core/dom.js';

export interface ToastOptions {
  action?: { label: string; onClick: () => void };
  durationMs?: number;
}

let container: HTMLElement | null = null;

function getContainer(): HTMLElement {
  if (!container) {
    container = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(container);
  }
  return container;
}

export function showToast(message: string, opts: ToastOptions = {}): () => void {
  const el = h('div', { class: 'toast' }, h('span', { class: 'toast-text' }, message));
  let timer: number | undefined;
  const dismiss = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    el.classList.add('toast-out');
    setTimeout(() => el.remove(), 200);
  };
  if (opts.action) {
    const { label, onClick } = opts.action;
    el.appendChild(
      h(
        'button',
        {
          class: 'btn btn-text',
          onClick: () => {
            onClick();
            dismiss();
          },
        },
        label,
      ),
    );
  }
  getContainer().appendChild(el);
  timer = window.setTimeout(dismiss, opts.durationMs ?? (opts.action ? 8000 : 3500));
  return dismiss;
}
