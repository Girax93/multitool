import type { App } from '../core/app.js';
import { h, svg } from '../core/dom.js';
import { navigate, toolPath } from '../core/router.js';
import { icons } from './icons.js';

export function renderHome(app: App): HTMLElement {
  const tools = app.enabledTools();
  if (tools.length === 0) {
    return h(
      'div',
      { class: 'empty', dataset: { testid: 'home' } },
      svg(icons.toolbox, 'icon icon-xl'),
      h('p', null, 'Your toolbox is empty.'),
      h('button', { class: 'btn btn-primary', onClick: () => navigate('#/settings') }, 'Choose tools'),
    );
  }
  const grid = h('div', { class: 'tool-grid', dataset: { testid: 'home' } });
  for (const tool of tools) {
    const status = h('span', { class: 'tool-card-status' });
    tool.status?.subscribe((s) => {
      status.textContent = s ?? '';
      status.hidden = !s;
    });
    grid.appendChild(
      h(
        'button',
        { class: 'tool-card', dataset: { tool: tool.id }, onClick: () => navigate(toolPath(tool.id)) },
        h('span', { class: 'tool-card-icon' }, svg(tool.icon)),
        h('span', { class: 'tool-card-name' }, tool.name),
        h('span', { class: 'tool-card-desc' }, tool.description),
        status,
      ),
    );
  }
  return grid;
}
