import type { KV } from './db.js';
import { signal, type Signal } from './store.js';

export type Theme = 'system' | 'dark' | 'light';

export interface Settings {
  /** Tools the user switched off. New tools are enabled by default. */
  disabledTools: string[];
  theme: Theme;
}

const DEFAULTS: Settings = { disabledTools: [], theme: 'system' };
const KEY = 'settings';

export class SettingsStore {
  readonly value: Signal<Settings> = signal<Settings>(DEFAULTS);

  constructor(private readonly kv: KV) {}

  async load(): Promise<void> {
    const stored = await this.kv.get<Partial<Settings>>(KEY);
    if (stored) this.value.set({ ...DEFAULTS, ...stored });
  }

  async patch(changes: Partial<Settings>): Promise<void> {
    const next = { ...this.value.get(), ...changes };
    this.value.set(next);
    await this.kv.set(KEY, next);
  }

  isEnabled(toolId: string): boolean {
    return !this.value.get().disabledTools.includes(toolId);
  }

  async setEnabled(toolId: string, enabled: boolean): Promise<void> {
    const disabled = new Set(this.value.get().disabledTools);
    if (enabled) disabled.delete(toolId);
    else disabled.add(toolId);
    await this.patch({ disabledTools: [...disabled] });
  }
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0f1216' : '#f6f7f9');
}
