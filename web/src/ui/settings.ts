import type { App } from '../core/app.js';
import { exportBackup, importBackup, isBackup } from '../core/db.js';
import { h, replace, svg } from '../core/dom.js';
import { allTools } from '../core/registry.js';
import type { Theme } from '../core/settings.js';
import { fetchLatestShellRelease, isNewerShell, RELEASES_URL } from '../core/update.js';
import { displayVersion } from '../core/version.js';
import { icons } from './icons.js';
import { showToast } from './toast.js';

function section(title: string, ...children: HTMLElement[]): HTMLElement {
  return h('section', { class: 'card' }, h('h2', { class: 'card-title' }, title), ...children);
}

export function renderSettings(app: App): HTMLElement {
  return h(
    'div',
    { class: 'stack', dataset: { testid: 'settings' } },
    renderToolsSection(app),
    renderAppearance(app),
    renderData(app),
    renderAbout(app),
  );
}

function renderToolsSection(app: App): HTMLElement {
  const list = h('ul', { class: 'list' });
  for (const tool of allTools()) {
    const input = h('input', {
      type: 'checkbox',
      role: 'switch',
      checked: app.settings.isEnabled(tool.id),
      dataset: { tool: tool.id },
      onChange: async () => {
        await app.settings.setEnabled(tool.id, input.checked);
        if (input.checked) await app.initTool(tool);
      },
    });
    list.appendChild(
      h(
        'li',
        { class: 'list-row' },
        h('span', { class: 'list-icon' }, svg(tool.icon)),
        h('label', { class: 'list-main' }, h('span', { class: 'list-title' }, tool.name), h('span', { class: 'list-sub' }, tool.description)),
        h('label', { class: 'switch' }, input, h('span', { class: 'switch-track' })),
      ),
    );
  }
  return section('Tools', h('p', { class: 'muted' }, 'Choose which tools appear in your toolbox.'), list);
}

function renderAppearance(app: App): HTMLElement {
  const themes: { value: Theme; label: string }[] = [
    { value: 'system', label: 'System' },
    { value: 'dark', label: 'Dark' },
    { value: 'light', label: 'Light' },
  ];
  const group = h('div', { class: 'segmented', role: 'radiogroup' });
  const render = (): void => {
    const current = app.settings.value.get().theme;
    replace(
      group,
      ...themes.map((t) =>
        h(
          'button',
          {
            class: `seg${t.value === current ? ' seg-active' : ''}`,
            role: 'radio',
            'aria-checked': String(t.value === current),
            onClick: () => void app.settings.patch({ theme: t.value }).then(render),
          },
          t.label,
        ),
      ),
    );
  };
  render();
  return section('Appearance', h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Theme'), group));
}

function renderData(app: App): HTMLElement {
  const exportBtn = h(
    'button',
    {
      class: 'btn',
      onClick: async () => {
        const backup = await exportBackup(app.kv);
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = h('a', { href: url, download: `multitool-backup-${backup.exportedAt.slice(0, 10)}.json` });
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      },
    },
    svg(icons.download),
    'Export backup',
  );
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const data: unknown = JSON.parse(await file.text());
      if (!isBackup(data)) throw new Error('Not a MultiTool backup file');
      const replaceAll = confirm(`Restore ${data.entries.length} entries from ${data.exportedAt.slice(0, 10)}?\n\nOK = replace all current data\nCancel = abort`);
      if (!replaceAll) return;
      const n = await importBackup(app.kv, data, true);
      showToast(`Restored ${n} entries — reloading`);
      setTimeout(() => location.reload(), 800);
    } catch (err) {
      showToast(`Import failed: ${(err as Error).message}`);
    }
  });
  const importBtn = h('button', { class: 'btn', onClick: () => fileInput.click() }, 'Restore backup…');
  return section(
    'Data',
    h('p', { class: 'muted' }, 'All data lives on this device. Export a backup before reinstalling or switching phones.'),
    h('div', { class: 'row' }, exportBtn, importBtn, fileInput),
  );
}

function renderAbout(app: App): HTMLElement {
  const info = app.info;
  const rows: [string, string][] = [['Web app', displayVersion()]];
  if (info.platform === 'android') {
    rows.push(['Android shell', `${info.shellVersion ?? '?'} (${info.shellVersionCode ?? '?'})`]);
    rows.push(['Android', `API ${info.sdkInt ?? '?'}`]);
  } else {
    rows.push(['Platform', 'Browser']);
  }
  const table = h(
    'dl',
    { class: 'kv' },
    ...rows.flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)]),
  );

  const updateStatus = h('p', { class: 'muted' });
  const updateBtn = h(
    'button',
    {
      class: 'btn',
      onClick: async () => {
        updateBtn.disabled = true;
        updateStatus.textContent = 'Checking…';
        try {
          const latest = await fetchLatestShellRelease();
          if (!latest) {
            updateStatus.textContent = 'No shell release published yet.';
          } else if (info.platform !== 'android') {
            updateStatus.textContent = `Latest shell: ${latest.version}.`;
            if (latest.apkUrl) updateStatus.appendChild(h('a', { href: latest.apkUrl, class: 'link' }, ' Download APK'));
          } else if (isNewerShell(latest, info.shellVersion)) {
            updateStatus.textContent = `Shell ${latest.version} is available.`;
            if (latest.apkUrl) {
              const url = latest.apkUrl;
              updateStatus.appendChild(
                h('button', { class: 'btn btn-primary btn-sm', onClick: () => app.native.installUpdate(url) }, 'Install update'),
              );
            }
          } else {
            updateStatus.textContent = 'Shell is up to date.';
          }
        } catch (err) {
          updateStatus.textContent = `Could not check: ${(err as Error).message}`;
        } finally {
          updateBtn.disabled = false;
        }
      },
    },
    'Check for shell update',
  );

  const children: HTMLElement[] = [table, h('div', { class: 'row' }, updateBtn), updateStatus];

  if (info.platform === 'android') {
    const problems: string[] = [];
    if (info.notificationsGranted === false) problems.push('notifications are off');
    if (info.canScheduleExactAlarms === false) problems.push('exact alarms are not allowed');
    if (info.canUseFullScreenIntent === false) problems.push('full-screen alerts are off');
    if (problems.length) {
      children.push(
        h(
          'div',
          { class: 'notice' },
          h('span', null, `Timers may not ring reliably: ${problems.join(', ')}.`),
          h('button', { class: 'btn btn-sm', onClick: () => app.native.requestPermissions() }, 'Fix permissions'),
        ),
      );
    }
  } else if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    children.push(
      h(
        'div',
        { class: 'notice' },
        h('span', null, 'Allow notifications so timers can alert you while this tab is in the background.'),
        h('button', { class: 'btn btn-sm', onClick: () => app.native.requestPermissions() }, 'Allow'),
      ),
    );
  }

  children.push(
    h('p', { class: 'muted' }, h('a', { class: 'link', href: RELEASES_URL, target: '_blank', rel: 'noopener' }, 'All releases on GitHub')),
  );
  return section('About', ...children);
}
