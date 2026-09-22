// Settings → Sync: turn sync on, link devices with a temporary code, show the
// recovery key, and see what the engine is doing.

import type { App } from '../core/app.js';
import { h, replace, svg } from '../core/dom.js';
import type { DeviceInfo, SyncState } from '../core/sync.js';
import { icons } from './icons.js';
import { confirmSheet, openSheet } from './sheet.js';
import { showToast } from './toast.js';

function section(title: string, ...children: (HTMLElement | null)[]): HTMLElement {
  return h('section', { class: 'card', dataset: { testid: 'sync-settings' } }, h('h2', { class: 'card-title' }, title), ...children);
}

function relative(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const hh = Math.round(m / 60);
  if (hh < 24) return `${hh} h ago`;
  return new Date(ts).toLocaleString();
}

export function describeSync(state: SyncState): string {
  switch (state.status) {
    case 'off':
      return 'Sync is off — data stays on this device.';
    case 'syncing':
      return 'Syncing…';
    case 'offline':
      return `Offline — changes are kept and sent when you are back online${state.lastSyncAt ? ` (last synced ${relative(state.lastSyncAt)})` : ''}.`;
    case 'error':
      return `Sync problem: ${state.error ?? 'unknown error'}`;
    case 'idle':
      return state.lastSyncAt ? `Synced ${relative(state.lastSyncAt)}.` : 'Waiting for the first sync…';
  }
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied');
  } catch {
    showToast('Could not copy — long-press to select it instead');
  }
}

function busy<T>(btn: HTMLButtonElement, fn: () => Promise<T>): Promise<T | undefined> {
  btn.disabled = true;
  return fn()
    .catch((err: unknown) => {
      showToast((err as Error).message || 'Something went wrong', { durationMs: 6000 });
      return undefined;
    })
    .finally(() => {
      btn.disabled = false;
    });
}

export function renderSyncSection(app: App): HTMLElement {
  const status = h('p', { class: 'muted', dataset: { testid: 'sync-status' } });
  const actions = h('div', { class: 'row' });
  const extra = h('div', { class: 'stack-sm' });
  let lastStatus: string | null = null;

  const render = (state: SyncState): void => {
    status.textContent = describeSync(state);
    status.dataset['status'] = state.status;
    if (lastStatus === state.status) return; // only the text changes while syncing
    lastStatus = state.status;
    if (state.status === 'off') {
      replace(
        actions,
        h('button', { class: 'btn btn-primary', dataset: { testid: 'sync-enable' }, onClick: () => void enable() }, svg(icons.cloud), 'Turn on sync'),
        h('button', { class: 'btn', dataset: { testid: 'sync-join' }, onClick: () => openJoinSheet(app) }, svg(icons.link), 'Link to an existing account…'),
      );
      replace(extra, state.notice ? h('div', { class: 'notice', dataset: { testid: 'sync-notice' } }, h('span', null, state.notice)) : null);
    } else {
      replace(
        actions,
        h('button', { class: 'btn btn-primary', dataset: { testid: 'sync-link' }, onClick: () => void openLinkCodeSheet(app) }, svg(icons.link), 'Link another device'),
        h('button', { class: 'btn', dataset: { testid: 'sync-now' }, onClick: () => void app.sync.syncNow() }, svg(icons.refresh), 'Sync now'),
      );
      replace(
        extra,
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn btn-sm', dataset: { testid: 'sync-recovery' }, onClick: () => openRecoverySheet(app) }, svg(icons.key), 'Recovery key'),
          h(
            'button',
            {
              class: 'btn btn-sm',
              dataset: { testid: 'sync-disable' },
              onClick: async () => {
                if (!(await confirmSheet('Turn off sync on this device? Your data stays here and on your other devices; this device just stops sharing changes.', 'Turn off'))) return;
                await app.sync.disable();
                showToast('Sync is off on this device');
              },
            },
            svg(icons.cloudOff),
            'Turn off on this device',
          ),
        ),
        renderDevices(app),
        h(
          'details',
          { class: 'danger-zone' },
          h('summary', { class: 'muted' }, 'Delete everything on the server'),
          h('p', { class: 'muted' }, 'Removes the account and all synced data from the server. Data already on your devices is kept, and sync is turned off on this device; other devices will report an error until you turn sync off there too.'),
          h(
            'button',
            {
              class: 'btn btn-sm btn-danger',
              onClick: async (e: Event) => {
                const btn = e.currentTarget as HTMLButtonElement;
                if (!(await confirmSheet('Delete the account and all synced data on the server? This cannot be undone.', 'Delete'))) return;
                const ok = await busy(btn, async () => {
                  await app.sync.deleteRemote();
                  return true;
                });
                if (ok) showToast('Server data deleted');
              },
            },
            svg(icons.trash),
            'Delete server data',
          ),
        ),
      );
    }
  };

  const enable = async (): Promise<void> => {
    const btn = actions.querySelector<HTMLButtonElement>("[data-testid='sync-enable']");
    if (!btn) return;
    const ok = await busy(btn, async () => {
      await app.sync.enable();
      return true;
    });
    if (ok) void openLinkCodeSheet(app); // the sheet with the code is the confirmation
  };

  app.sync.state.subscribe(render);
  // Keep "synced 3 min ago" fresh while the page is open.
  const ticker = setInterval(() => {
    if (!status.isConnected) clearInterval(ticker);
    else status.textContent = describeSync(app.sync.state.get());
  }, 15_000);

  return section(
    'Sync',
    h('p', { class: 'muted' }, 'Keep the whole toolbox the same on every device. Everything is encrypted on your devices before it is uploaded; the server only ever sees scrambled data.'),
    status,
    actions,
    extra,
  );
}

// ---- linked devices ---------------------------------------------------------

function renderDevices(app: App): HTMLElement {
  const list = h('ul', { class: 'list', dataset: { testid: 'device-list' } });
  const hint = h('p', { class: 'muted' }, 'Loading…');
  const box = h('div', { class: 'devices' }, h('h3', { class: 'subtitle' }, 'Linked devices'), hint, list);

  const load = async (): Promise<void> => {
    try {
      const devices = await app.sync.listDevices();
      hint.textContent = devices.length === 1 ? 'Only this device so far. Anything linked with a code shows up here.' : 'Every device that can read this account. Remove any you do not recognise.';
      replace(list, ...devices.map((d) => deviceRow(app, d, load)));
    } catch (err) {
      hint.textContent = `Could not load the device list: ${(err as Error).message}`;
    }
  };
  void load();
  return box;
}

function deviceRow(app: App, d: DeviceInfo, reload: () => Promise<void>): HTMLElement {
  const sub = `${d.current ? 'This device · ' : ''}last seen ${relative(d.lastSeenAt)} · linked ${new Date(d.createdAt).toLocaleDateString()}`;
  const renameBtn = h(
    'button',
    {
      class: 'iconbtn iconbtn-sm',
      'aria-label': 'Rename device',
      title: 'Rename',
      onClick: () => openRenameSheet(app, d, reload),
    },
    svg(icons.edit),
  );
  const removeBtn = d.current
    ? null
    : h(
        'button',
        {
          class: 'iconbtn iconbtn-sm',
          'aria-label': 'Remove device',
          title: 'Remove from the account',
          dataset: { testid: 'device-remove' },
          onClick: async (e: Event) => {
            const btn = e.currentTarget as HTMLButtonElement;
            if (!(await confirmSheet(`Remove "${d.name}" from the account? It stops syncing immediately; the data already on it stays there.`, 'Remove'))) return;
            const ok = await busy(btn, async () => {
              await app.sync.removeDevice(d.id);
              return true;
            });
            if (ok) {
              showToast(`${d.name} removed`);
              await reload();
            }
          },
        },
        svg(icons.trash),
      );
  return h(
    'li',
    { class: `list-row${d.current ? ' list-current' : ''}`, dataset: { device: d.id } },
    h('span', { class: 'list-icon' }, svg(/android|iphone|ipad|phone|tablet/i.test(d.name) ? icons.phone : icons.monitor)),
    h('span', { class: 'list-main' }, h('span', { class: 'list-title' }, d.name), h('span', { class: 'list-sub' }, sub)),
    renameBtn,
    removeBtn,
  );
}

function openRenameSheet(app: App, d: DeviceInfo, reload: () => Promise<void>): void {
  const sheet = openSheet({ title: 'Rename device' });
  const input = h('input', { class: 'input', value: d.name, maxlength: '60', autocomplete: 'off', dataset: { testid: 'device-name' } });
  const save = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save');
  const form = h(
    'form',
    {
      onSubmit: (e: Event) => {
        e.preventDefault();
        void busy(save as HTMLButtonElement, async () => {
          await app.sync.renameDevice(d.id, input.value);
          sheet.close();
          await reload();
        });
      },
    },
    h('p', { class: 'muted' }, 'The name is shown in the device list on all linked devices.'),
    input,
    h('div', { class: 'row row-end sheet-actions' }, save),
  );
  replace(sheet.body, form);
  input.focus();
  input.select();
}

// ---- sheets -----------------------------------------------------------------

async function openLinkCodeSheet(app: App): Promise<void> {
  let expiryTimer: number | undefined;
  const sheet = openSheet({ title: 'Link another device', onClose: () => expiryTimer !== undefined && clearInterval(expiryTimer) });
  const code = h('div', { class: 'link-code', dataset: { testid: 'link-code' } }, '…');
  const note = h('p', { class: 'muted' });
  const newBtn = h('button', { class: 'btn', onClick: () => void refresh() }, svg(icons.refresh), 'New code');

  const refresh = async (): Promise<void> => {
    code.textContent = '…';
    note.textContent = 'Getting a code…';
    await busy(newBtn as HTMLButtonElement, async () => {
      const r = await app.sync.createLinkCode();
      code.textContent = r.code;
      const tick = (): void => {
        const left = Math.max(0, Math.round((r.expiresAt - Date.now()) / 1000));
        note.textContent = left > 0 ? `Valid for ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} — can be used once.` : 'This code has expired — get a new one.';
        if (left <= 0 && expiryTimer !== undefined) clearInterval(expiryTimer);
      };
      if (expiryTimer !== undefined) clearInterval(expiryTimer);
      expiryTimer = window.setInterval(tick, 1000);
      tick();
    });
  };

  replace(
    sheet.body,
    h('p', null, 'On the other device open ', h('b', null, 'Settings → Sync → Link to an existing account'), ' and type this code:'),
    code,
    note,
    h(
      'div',
      { class: 'row sheet-actions' },
      h('button', { class: 'btn btn-sm', onClick: () => void copyText(code.textContent ?? '') }, svg(icons.copy), 'Copy'),
      newBtn,
    ),
  );
  await refresh();
}

function openJoinSheet(app: App): void {
  const sheet = openSheet({ title: 'Link this device' });
  const input = h('input', {
    class: 'input link-code-input',
    placeholder: 'XXXX-XXXX',
    autocomplete: 'off',
    autocapitalize: 'characters',
    spellcheck: false,
    maxlength: '9',
    dataset: { testid: 'join-code' },
  });
  input.addEventListener('input', () => {
    const raw = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    input.value = raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
  });
  const joinBtn = h(
    'button',
    {
      class: 'btn btn-primary',
      type: 'submit',
      dataset: { testid: 'join-submit' },
    },
    svg(icons.link),
    'Link',
  );
  const recoveryLink = h(
    'button',
    { class: 'btn btn-sm', type: 'button', dataset: { testid: 'join-use-recovery' }, onClick: () => sheet.closeThen(() => openRecoveryJoinSheet(app)) },
    svg(icons.key),
    'Use a recovery key instead',
  );
  const form = h(
    'form',
    {
      onSubmit: (e: Event) => {
        e.preventDefault();
        void busy(joinBtn as HTMLButtonElement, async () => {
          await app.sync.joinWithCode(input.value);
          showToast('Linked — your data is syncing');
          sheet.close();
        });
      },
    },
    h('p', null, 'On a device that already syncs, open ', h('b', null, 'Settings → Sync → Link another device'), ' and type the code it shows:'),
    input,
    h('p', { class: 'muted' }, 'Anything already on this device is kept and merged into the account.'),
    h('div', { class: 'row row-between sheet-actions' }, recoveryLink, joinBtn),
  );
  replace(sheet.body, form);
  input.focus();
}

function openRecoveryJoinSheet(app: App): void {
  const sheet = openSheet({ title: 'Recovery key' });
  const input = h('textarea', { class: 'input textarea mono', rows: 3, placeholder: 'XXXX-XXXX-XXXX-…', autocomplete: 'off', spellcheck: false, dataset: { testid: 'recovery-input' } });
  const btn = h('button', { class: 'btn btn-primary', type: 'submit', dataset: { testid: 'recovery-submit' } }, svg(icons.key), 'Link');
  const form = h(
    'form',
    {
      onSubmit: (e: Event) => {
        e.preventDefault();
        void busy(btn as HTMLButtonElement, async () => {
          await app.sync.joinWithRecoveryKey(input.value);
          showToast('Linked — your data is syncing');
          sheet.close();
        });
      },
    },
    h('p', null, 'Type or paste the recovery key shown under Settings → Sync on a linked device.'),
    input,
    h('div', { class: 'row row-end sheet-actions' }, btn),
  );
  replace(sheet.body, form);
  input.focus();
}

function openRecoverySheet(app: App): void {
  const key = app.sync.recoveryKey();
  if (!key) return;
  const sheet = openSheet({ title: 'Recovery key' });
  replace(
    sheet.body,
    h('p', null, 'This key is the only way to reach your synced data if every linked device is lost. Write it down somewhere safe; anyone who has it can read your data.'),
    h('div', { class: 'recovery-key', dataset: { testid: 'recovery-key' } }, key),
    h('div', { class: 'row row-end sheet-actions' }, h('button', { class: 'btn', onClick: () => void copyText(key) }, svg(icons.copy), 'Copy')),
  );
}
