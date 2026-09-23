// Popover: a small panel anchored near a point (right-click / long-press
// menus). One at a time; closes on outside tap, Escape, scroll or resize.
// Unlike a bottom sheet it pushes no history entry — it is a transient menu.

import { h, type Child } from '../core/dom.js';

export interface Popover {
  el: HTMLElement;
  close(): void;
}

let current: Popover | null = null;

export function closePopover(): void {
  current?.close();
}

let keepOpenUntil = 0;

/** A programmatic scroll is about to happen (a re-render restoring its scroll position): do not close the menu for it. */
export function keepPopoverThroughScroll(ms = 150): void {
  keepOpenUntil = performance.now() + ms;
}

export function openPopover(x: number, y: number, ...children: Child[]): Popover {
  closePopover();
  const el = h('div', { class: 'popover', role: 'menu', dataset: { testid: 'popover' } }, ...children);
  el.style.left = '0px';
  el.style.top = '0px';
  document.body.appendChild(el);

  // keep it inside the viewport
  const margin = 8;
  const r = el.getBoundingClientRect();
  const left = Math.max(margin, Math.min(x, window.innerWidth - r.width - margin));
  const top = Math.max(margin, Math.min(y, window.innerHeight - r.height - margin));
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;

  let closed = false;
  const onPointer = (e: Event): void => {
    if (!el.contains(e.target as Node)) close();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };
  const onScroll = (e: Event): void => {
    // A view that re-renders and puts its scroll position back fires a scroll
    // event too; that one keeps the menu where it was, so it stays open.
    if (performance.now() < keepOpenUntil) return;
    if (!el.contains(e.target as Node)) close();
  };
  const close = (): void => {
    if (closed) return;
    closed = true;
    document.removeEventListener('pointerdown', onPointer, true);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', close);
    el.remove();
    if (current === popover) current = null;
  };
  // Listen after the opening pointer event has finished bubbling.
  setTimeout(() => {
    if (closed) return;
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
  }, 0);

  const popover: Popover = { el, close };
  current = popover;
  return popover;
}

/**
 * Right-click on desktop, long-press on touch screens. Chrome on Android
 * fires `contextmenu` for a long press already; the touch fallback covers
 * browsers that do not (iOS Safari), without firing twice.
 */
export function onContextAction(el: HTMLElement, handler: (x: number, y: number) => void): void {
  let touchTimer: ReturnType<typeof setTimeout> | null = null;
  let firedByTouch = false;
  el.addEventListener('contextmenu', (e: MouseEvent) => {
    e.preventDefault();
    if (firedByTouch) {
      firedByTouch = false;
      return;
    }
    handler(e.clientX, e.clientY);
  });
  const cancel = (): void => {
    if (touchTimer) clearTimeout(touchTimer);
    touchTimer = null;
  };
  el.addEventListener(
    'touchstart',
    (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t || e.touches.length > 1) return;
      const { clientX, clientY } = t;
      cancel();
      touchTimer = setTimeout(() => {
        touchTimer = null;
        firedByTouch = true;
        setTimeout(() => {
          firedByTouch = false;
        }, 700);
        handler(clientX, clientY);
      }, 500);
    },
    { passive: true },
  );
  el.addEventListener('touchmove', cancel, { passive: true });
  el.addEventListener('touchend', cancel, { passive: true });
  el.addEventListener('touchcancel', cancel, { passive: true });
}
