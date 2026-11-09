// MandaoYa service worker: la app abre sin señal; los datos los maneja Firestore (con caché propia)
const APP_CACHE = 'mandaoya-app-v10';
const TILE_CACHE = 'mandaoya-tiles-v1';
const FILES = ['./', './index.html', './styles.css', './config.js', './manifest.webmanifest',
  './js/app.js', './js/db.js', './js/ui.js', './js/cliente.js', './js/tienda.js', './js/domi.js', './js/admin.js', './js/seguir.js', './js/catalogo.js', './js/recargas.js', './js/native.js', './js/carreras.js',
  './vendor/firebase/firebase-app.js', './vendor/firebase/firebase-auth.js', './vendor/firebase/firebase-firestore.js',
  './vendor/leaflet.js', './vendor/leaflet.css', './vendor/images/marker-icon.png', './vendor/images/marker-shadow.png',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(APP_CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x.startsWith('mandaoya-app-') && x !== APP_CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (/tile\.openstreetmap\.org/.test(url.hostname)) {
    e.respondWith(caches.open(TILE_CACHE).then(async c => {
      const hit = await c.match(req); if (hit) return hit;
      try { const r = await fetch(req); if (r.ok) c.put(req, r.clone()); return r; } catch (err) { return new Response('', { status: 504 }); }
    }));
    return;
  }
  if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    e.respondWith(caches.open(APP_CACHE).then(async c => (await c.match(req)) || fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; })));
    return;
  }
  if (url.origin === location.origin) {
    e.respondWith(fetch(req).then(r => { if (r.ok) { const cp = r.clone(); caches.open(APP_CACHE).then(c => c.put(req, cp)); } return r; })
      .catch(async () => (await caches.match(req, { ignoreSearch: true })) || caches.match('./index.html')));
  }
});
