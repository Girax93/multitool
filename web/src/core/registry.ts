// The tool registry. A tool is a self-contained module that registers a
// ToolDefinition; the app shell discovers tools from here, the settings page
// lets the user enable/disable them, and the home screen lists the enabled ones.
//
// Adding a tool = create web/src/tools/<id>/index.ts that calls registerTool()
// and import it from web/src/tools/index.ts. Nothing else to wire up.

import type { KV } from './db.js';
import type { NativeBridge } from './native.js';
import type { Signal } from './store.js';

export interface ToolContext {
  /** Storage scoped to this tool (keys are namespaced automatically). */
  kv: KV;
  native: NativeBridge;
  navigate(path: string): void;
  toast(message: string, opts?: { action?: { label: string; onClick: () => void }; durationMs?: number }): void;
}

export interface ToolInstance {
  unmount(): void;
}

export interface ToolDefinition {
  /** Stable id, used in routes and storage keys. Never rename once shipped. */
  id: string;
  name: string;
  description: string;
  /** SVG markup, 24x24 viewBox, `currentColor` strokes/fills. */
  icon: string;
  /** Lower comes first on the home screen. */
  order?: number;
  /** Optional one-line live status shown on the home card (e.g. "2 running"). */
  status?: Signal<string | null>;
  /**
   * Called once at app start for every enabled tool, even if its view is never
   * opened. Use it for background services (running timers, syncing, …).
   */
  init?(ctx: ToolContext): void | Promise<void>;
  /** Render the tool's UI into `host`. Called every time the user opens it. */
  mount(host: HTMLElement, ctx: ToolContext): ToolInstance;
}

const tools = new Map<string, ToolDefinition>();

export function registerTool(def: ToolDefinition): void {
  if (tools.has(def.id)) throw new Error(`Tool "${def.id}" registered twice`);
  tools.set(def.id, def);
}

export function getTool(id: string): ToolDefinition | undefined {
  return tools.get(id);
}

export function allTools(): ToolDefinition[] {
  return [...tools.values()].sort((a, b) => (a.order ?? 100) - (b.order ?? 100) || a.name.localeCompare(b.name));
}
