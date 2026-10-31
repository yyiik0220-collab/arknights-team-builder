/* Classic Service Worker: cache-first for same-origin GET requests. */
const CACHE_PREFIX = 'arknights-team-builder-static-';
// キャッシュバージョン。アセット（JS/CSS/データ等）を変更した際は必ず値を上げること。
// 上げ忘れると、リピート訪問者が古いJSをキャッシュから受け取り続け、
// 更新済みの不具合修正が反映されない（例: リージョン切替時の ui.js 未ガード参照）。
const CACHE_VERSION = '0.5.0';
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;
const APP_SHELL = new URL('./index.html', self.registration.scope).href;
const APP_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './sw.js',
  './favicon.svg',
  './assets/favicon.ico',
  './assets/favicon.png',
  './assets/apple-touch-icon.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-maskable-192.png',
  './assets/icon-maskable-512.png',
  './css/base.css',
  './css/layout.css',
  './css/components.css',
  './css/database.css',
  './css/materials.css',
  './css/responsive.css',
  './css/pwa.css',
  './data/i18n.json',
  './data/materials.json',
  './data/operators.json',
  './data/regions.json',
  './data/scoring-config.json',
  './data/stages.json',
  './data/templates.json',
  './js/main.js',
  './js/modules/app-state.js',
  './js/modules/data-loader.js',
  './js/modules/database-ui.js',
  './js/modules/database.js',
  './js/modules/growth-advisor.js',
  './js/modules/growth-ui.js',
  './js/modules/i18n.js',
  './js/modules/import-export.js',
  './js/modules/materials-ui.js',
  './js/modules/materials.js',
  './js/modules/navigation.js',
  './js/modules/pwa.js',
  './js/modules/qr.js',
  './js/modules/recommendation.js',
  './js/modules/region.js',
  './js/modules/roster-ui.js',
  './js/modules/roster.js',
  './js/modules/scoring.js',
  './js/modules/stage-memo.js',
  './js/modules/stages.js',
  './js/modules/storage.js',
  './js/modules/synergy-ui.js',
  './js/modules/synergy.js',
  './js/modules/team-share.js',
  './js/modules/templates.js',
  './js/modules/theme.js',
  './js/modules/ui.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_ASSETS.map((asset) => new URL(asset, self.registration.scope)));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;

    // Navigation fallbacks keep deep links and shared-team URLs available offline.
    if (request.mode === 'navigate') {
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(APP_SHELL, response.clone());
        return response;
      } catch {
        const appShell = await cache.match(APP_SHELL);
        if (appShell) return appShell;
        return Response.error();
      }
    }

    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
      return response;
    } catch {
      return Response.error();
    }
  })());
});
