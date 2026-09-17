import './tools/index.js';
import { App } from './core/app.js';
import { mountShell } from './ui/shell.js';
import { showToast } from './ui/toast.js';
import { displayVersion } from './core/version.js';

async function boot(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) throw new Error('#app missing');
  const app = new App();
  await app.start();
  mountShell(root, app);
  root.dataset.ready = 'true';
  console.info(`MultiTool web ${displayVersion()} on ${app.info.platform}`);
  registerServiceWorker();
}

function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker
    .register('./sw.js')
    .then((reg) => {
      const notify = (): void =>
        void showToast('Update ready', {
          action: { label: 'Reload', onClick: () => location.reload() },
          durationMs: 15_000,
        });
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) notify();
        });
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void reg.update();
      });
    })
    .catch((err) => console.warn('Service worker registration failed', err));
}

void boot().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML(
    'beforeend',
    `<pre class="fatal">MultiTool failed to start:\n${String((err as Error)?.stack ?? err)}</pre>`,
  );
});
