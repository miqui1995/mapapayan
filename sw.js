// MapaPayán service worker: app offline + caché de las teselas que ya viste
const APP_CACHE = 'mapapayan-app-v1';
const TILE_CACHE = 'mapapayan-tiles-v1';
const MAX_TILES = 4000;

const APP_FILES = [
  './', './index.html', './styles.css', './app.js', './manifest.webmanifest',
  './vendor/leaflet.js', './vendor/leaflet.css',
  './vendor/images/layers.png', './vendor/images/layers-2x.png',
  './vendor/images/marker-icon.png', './vendor/images/marker-icon-2x.png', './vendor/images/marker-shadow.png',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(APP_CACHE).then(c => c.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k.startsWith('mapapayan-app-') && k !== APP_CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

function isTile(url) {
  return /tile\.openstreetmap\.org|arcgisonline\.com/.test(url.hostname);
}

async function trimTiles() {
  const c = await caches.open(TILE_CACHE);
  const keys = await c.keys();
  if (keys.length > MAX_TILES) {
    for (const k of keys.slice(0, keys.length - MAX_TILES)) await c.delete(k);
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (isTile(url)) {
    e.respondWith((async () => {
      const c = await caches.open(TILE_CACHE);
      const hit = await c.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') { c.put(req, res.clone()); trimTiles(); }
        return res;
      } catch (err) {
        return new Response('', { status: 504 });
      }
    })());
    return;
  }

  if (url.origin === self.location.origin) {
    // App: primero red (para recibir actualizaciones), si no hay señal, caché
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(APP_CACHE)).put(req, res.clone());
        return res;
      } catch (err) {
        const hit = await caches.match(req, { ignoreSearch: true });
        return hit || caches.match('./index.html');
      }
    })());
  }
});
