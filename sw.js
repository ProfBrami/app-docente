// Service worker Dashboard Docente.
// Shell: network-first senza cache HTTP (online c'è sempre l'ultima versione), cache solo come riserva offline.
// Dati dall'endpoint Apps Script: network-first con fallback all'ultimo JSON valido (header X-Dashboard-Cache: 1).
// Font Google: cache-first.
const VERSION = 'v9';
const SHELL = 'shell-' + VERSION, DATA = 'data-v1', FONTS = 'fonts-v1';
const FILES = ['./', './index.html', './app.js', './app.css', './industry-styles.css', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];
const SNAP = 'ultimo-snapshot';

self.addEventListener('install', e => e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => ![SHELL, DATA, FONTS].includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim())
));

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  if (url.hostname === 'script.google.com' || url.hostname.endsWith('.googleusercontent.com')) {
    e.respondWith(dati(e.request));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(r => { if (r.ok || r.type === 'opaque') c.put(e.request, r.clone()); return r; }))));
    return;
  }
  if (url.origin !== location.origin || url.pathname.includes('/dev/')) return;

  const key = e.request.mode === 'navigate' ? './index.html' : e.request;
  e.respondWith(caches.open(SHELL).then(c =>
    fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }) // le richieste 'navigate' non accettano opzioni: si usa l'URL
      .then(r => { if (r.ok && !r.redirected) c.put(key, r.clone()); return r; })
      .catch(() => c.match(key, { ignoreSearch: true }).then(hit => hit || Response.error()))
  ));
});

async function dati(req) {
  const c = await caches.open(DATA);
  try {
    const r = await fetch(req);
    if (r.ok) {
      // salva solo snapshot validi (non le risposte {errore: …})
      r.clone().json().then(j => {
        if (j && j.meta && !j.errore) c.put(SNAP, new Response(JSON.stringify(j), { headers: { 'Content-Type': 'application/json' } }));
      }).catch(() => {});
    }
    return r;
  } catch (err) {
    const hit = await c.match(SNAP);
    if (!hit) throw err;
    return new Response(await hit.text(), { headers: { 'Content-Type': 'application/json', 'X-Dashboard-Cache': '1' } });
  }
}
