import { onLanguageChange, t } from './i18n.js';

let installPrompt = null;
let waitingWorker = null;
let registration = null;
let updateNotificationSent = false;
let online = navigator.onLine;
let initialized = false;

function updateConnectionStatus() {
  const status = document.querySelector('#pwa-offline-status');
  if (!status) return;
  status.textContent = online ? '' : t('pwa.offline');
  status.hidden = online;
  status.setAttribute('aria-hidden', String(online));
}

function updateInstallButton() {
  const button = document.querySelector('#pwa-install');
  if (button) button.hidden = !installPrompt;
}

function setUpdateAvailable(worker) {
  if (!worker) return;
  waitingWorker = worker;
  const button = document.querySelector('#pwa-update');
  if (!button) return;
  button.textContent = t('pwa.updateAvailable');
  button.hidden = false;
  if (!updateNotificationSent) {
    updateNotificationSent = true;
    const notice = document.querySelector('#pwa-update-notice');
    if (notice) {
      notice.textContent = t('pwa.updateNotice');
      notice.hidden = false;
    }
  }
}

function observeRegistration(nextRegistration) {
  registration = nextRegistration;
  if (registration.waiting) setUpdateAvailable(registration.waiting);
  registration.addEventListener('updatefound', () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed' && navigator.serviceWorker.controller) {
        setUpdateAvailable(installing);
      }
    });
  });
}

export function initializePwa() {
  if (initialized) return;
  initialized = true;

  updateConnectionStatus();
  updateInstallButton();
  onLanguageChange(() => {
    updateConnectionStatus();
    updateInstallButton();
    if (waitingWorker) {
      const button = document.querySelector('#pwa-update');
      if (button) button.textContent = t('pwa.updateAvailable');
      const notice = document.querySelector('#pwa-update-notice');
      if (notice && !notice.hidden) notice.textContent = t('pwa.updateNotice');
    }
  });

  window.addEventListener('online', () => {
    online = true;
    updateConnectionStatus();
    registration?.update().catch(() => {});
  });
  window.addEventListener('offline', () => {
    online = false;
    updateConnectionStatus();
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    updateInstallButton();
  });

  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    updateInstallButton();
  });

  document.querySelector('#pwa-install')?.addEventListener('click', async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    updateInstallButton();
  });

  document.querySelector('#pwa-update')?.addEventListener('click', () => {
    if (!waitingWorker) return;
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  });

  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (waitingWorker) window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('../../sw.js', import.meta.url), {
      scope: new URL('../../', import.meta.url).href
    })
      .then(observeRegistration)
      .catch((error) => console.warn('Service Worker を登録できませんでした:', error));
  }, { once: true });
}
