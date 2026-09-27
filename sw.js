// Service worker: keeps the whole app on the device so it runs with the network off.
//
// Cache-first for everything. BUMP VERSION ON EVERY RELEASE, or installed copies keep running
// the old files. Activity modules are read from content/plans.json at install time, so adding an
// activity only means a new file plus its line in plans.json.

const VERSION = 'll-2026-09-27-v1';

const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './theme.css',
  './css/letterlab.css',
  './css/kid.css',
  './fonts/Andika-Regular.woff2',
  './fonts/Andika-Bold.woff2',
  './fonts/Cinzel-Variable.woff2',
  './fonts/Inter-Variable.woff2',
  './fonts/PlayfairDisplay-Variable.woff2',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './content/curriculum.json',
  './content/kid-words.json',
  './content/go-play.json',
  './content/stages.json',
  './content/letter-sounds.json',
  './content/plans.json',
  './js/main.js',
  './js/storage.js',
  './js/content.js',
  './js/text.js',
  './js/speech.js',
  './js/voice.js',
  './js/sounds.js',
  './js/choose-next.js',
  './js/kid/kid.js',
  './js/kid/ui.js',
  './js/kid/idle.js',
  './js/kid/registry.js',
  './js/kid/choice.js',
  './js/kid/distractors.js',
  './js/parent/parent.js',
  './js/parent/voice-check.js',
  './js/parent/install.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(CORE.map((u) => new Request(u, { cache: 'reload' })));
    const plans = await (await fetch('./content/plans.json', { cache: 'reload' })).json();
    await cache.addAll(Object.values(plans.activities || {}).map((p) => new Request('./' + p, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (e) {
      if (req.mode === 'navigate') {
        const shell = await cache.match('./index.html');
        if (shell) return shell;
      }
      throw e;
    }
  })());
});
