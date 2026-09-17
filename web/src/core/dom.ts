// Tiny DOM helpers. The whole app renders real DOM nodes directly — no virtual
// DOM, no framework — so `h()` is the one function every view is built from.

export type Child = Node | string | number | boolean | null | undefined | Child[];

export interface Props {
  [key: string]: unknown;
  class?: string;
  style?: Partial<CSSStyleDeclaration> | string;
  dataset?: Record<string, string>;
  ref?: (el: HTMLElement) => void;
}

/** Create an element. Event handlers are `onClick`, `onInput`, … (any `on*`). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) applyProps(el, props);
  append(el, children);
  return el;
}

function applyProps(el: HTMLElement, props: Props): void {
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null) continue;
    if (key === 'ref') {
      (value as (el: HTMLElement) => void)(el);
    } else if (key === 'class' || key === 'className') {
      el.className = String(value);
    } else if (key === 'style') {
      if (typeof value === 'string') el.setAttribute('style', value);
      else Object.assign(el.style, value as Partial<CSSStyleDeclaration>);
    } else if (key === 'dataset') {
      Object.assign(el.dataset, value as Record<string, string>);
    } else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (typeof value === 'boolean') {
      if (value) el.setAttribute(key, '');
      else el.removeAttribute(key);
      if (key in el) (el as unknown as Record<string, unknown>)[key] = value;
    } else if (key in el && key !== 'list' && key !== 'form') {
      (el as unknown as Record<string, unknown>)[key] = value;
    } else {
      el.setAttribute(key, String(value));
    }
  }
}

export function append(parent: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || typeof c === 'boolean') continue;
    if (Array.isArray(c)) {
      append(parent, c);
    } else if (c instanceof Node) {
      parent.appendChild(c);
    } else {
      parent.appendChild(document.createTextNode(String(c)));
    }
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** Replace all children of `host`. */
export function replace(host: Element, ...children: Child[]): void {
  clear(host);
  append(host, children);
}

/** Turn an SVG markup string into an element (used for icons). */
export function svg(markup: string, cls = 'icon'): SVGElement {
  const tpl = document.createElement('template');
  tpl.innerHTML = markup.trim();
  const el = tpl.content.firstElementChild as SVGElement;
  el.classList.add(cls);
  el.setAttribute('aria-hidden', 'true');
  return el;
}

/** A short, safe-enough random id. */
export function uid(prefix = ''): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return prefix ? `${prefix}_${rnd}` : rnd;
}
