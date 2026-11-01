// Nur statische App-Dateien werden gecacht, niemals Tagebuchinhalte oder API-Antworten.
const CACHE = 'tend-v18';
const FILES = ['./', 'index.html', 'boot.js', 'style.css', 'app.js', 'crypto.js', 'vault.js', 'crisis.js', 'ai.js', 'garden.js', 'config.js', 'reflect.js', 'tree.js', 'art.js', 'bio.js', 'fonts/figtree-latin-wght-normal.woff2', 'fonts/figtree-latin-ext-wght-normal.woff2', 'icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'manifest.webmanifest'];

self.addEventListener('install', (e) => {
  self.skipWaiting(); // Neue Versionen sofort übernehmen, statt bis zum Schließen aller Tabs zu warten
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))));
});
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  // Immer beim Server nachfragen, sonst liefert der Browser-Zwischenspeicher alten Code aus. Offline bleibt der Cache.
  e.respondWith(fetch(e.request.url, { cache: 'no-cache' }).catch(() => caches.match(e.request)));
});
