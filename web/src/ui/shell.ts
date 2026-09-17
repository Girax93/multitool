// The app shell: top bar, content host, and routing between home, tools and settings.

import type { App } from '../core/app.js';
import { h, replace, svg } from '../core/dom.js';
import { getTool, type ToolInstance } from '../core/registry.js';
import { back, navigate, onRouteChange, type Route } from '../core/router.js';
import { icons } from './icons.js';
import { renderHome } from './home.js';
import { renderSettings } from './settings.js';

export function mountShell(root: HTMLElement, app: App): void {
  const backBtn = h('button', { class: 'iconbtn', 'aria-label': 'Back', hidden: true, onClick: () => back() }, svg(icons.back));
  const title = h('h1', { class: 'title' }, 'MultiTool');
  const settingsBtn = h(
    'button',
    { class: 'iconbtn', 'aria-label': 'Settings', onClick: () => navigate('#/settings') },
    svg(icons.settings),
  );
  const host = h('main', { class: 'host' });
  replace(root, h('header', { class: 'topbar' }, backBtn, title, settingsBtn), host);

  let current: ToolInstance | null = null;
  let currentKey = '';

  const show = (route: Route): void => {
    const key = route.name === 'tool' ? `tool:${route.toolId}` : route.name;
    if (key === currentKey) return;
    current?.unmount();
    current = null;
    currentKey = key;
    host.scrollTop = 0;

    if (route.name === 'home') {
      title.textContent = 'MultiTool';
      backBtn.hidden = true;
      settingsBtn.hidden = false;
      replace(host, renderHome(app));
      document.title = 'MultiTool';
      return;
    }
    if (route.name === 'settings') {
      title.textContent = 'Settings';
      backBtn.hidden = false;
      settingsBtn.hidden = true;
      replace(host, renderSettings(app));
      document.title = 'Settings · MultiTool';
      return;
    }
    const tool = getTool(route.toolId);
    if (!tool) {
      navigate('#/');
      return;
    }
    title.textContent = tool.name;
    backBtn.hidden = false;
    settingsBtn.hidden = false;
    document.title = `${tool.name} · MultiTool`;
    const toolHost = h('section', { class: 'tool', dataset: { tool: tool.id } });
    replace(host, toolHost);
    void app.initTool(tool).then(() => {
      if (currentKey !== key) return;
      current = tool.mount(toolHost, app.contextFor(tool));
    });
  };

  onRouteChange(show);
}
