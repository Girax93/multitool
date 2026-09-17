// Minimal reactive primitives: a Signal holds a value and notifies subscribers;
// an Emitter is a typed event bus. Enough for this app; no framework needed.

export type Unsubscribe = () => void;

export class Signal<T> {
  private listeners = new Set<(value: T) => void>();

  constructor(private value: T) {}

  get(): T {
    return this.value;
  }

  set(next: T): void {
    if (Object.is(next, this.value)) return;
    this.value = next;
    this.emit();
  }

  update(fn: (current: T) => T): void {
    this.set(fn(this.value));
  }

  /** Subscribe; by default the callback is invoked immediately with the current value. */
  subscribe(fn: (value: T) => void, immediate = true): Unsubscribe {
    this.listeners.add(fn);
    if (immediate) fn(this.value);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit(): void {
    for (const l of [...this.listeners]) l(this.value);
  }
}

export function signal<T>(value: T): Signal<T> {
  return new Signal(value);
}

export class Emitter<T> {
  private listeners = new Set<(payload: T) => void>();

  on(fn: (payload: T) => void): Unsubscribe {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  emit(payload: T): void {
    for (const l of [...this.listeners]) {
      try {
        l(payload);
      } catch (err) {
        console.error('listener failed', err);
      }
    }
  }

  get size(): number {
    return this.listeners.size;
  }
}
