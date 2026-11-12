// Uygulama dosyalarını önbelleğe alır: internetsiz açılır, kitaplıktaki şarkılar çalar.
const CACHE = 'melodim-v3';
const FILES = ['./', './index.html', './app.js', './playlists.js', './manifest.json', './icon.svg', './icon-180.png', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // dış adresler doğrudan gider
  // Önce ağ (güncellemeler hemen gelsin), yoksa önbellek
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
