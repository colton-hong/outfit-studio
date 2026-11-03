const CACHE = 'outfit-studio-v2';
const SHELL = ['index.html','styles.css','app.js','manifest.webmanifest','icon-180.png','icon-192.png','icon-512.png','icon-maskable-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).catch(() =>
    req.mode === 'navigate' ? caches.match('index.html') : Response.error())));
});
