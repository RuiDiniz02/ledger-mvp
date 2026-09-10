// Offline shell for Ledger. The ledger itself lives in localStorage, so all
// this has to do is make sure the app can start with no network at all.
const CACHE = 'ledger-shell-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/'])).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const put = async (req, res) => {
  if (!res || !res.ok || res.type === 'opaque') return res;
  try { (await caches.open(CACHE)).put(req, res.clone()); } catch {}
  return res;
};

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network first so a new deploy is picked up, cache as backup.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => put(req, res))
        .catch(async () => (await caches.match(req)) || (await caches.match('/')) || Response.error())
    );
    return;
  }

  // Build output is content-hashed, so a cache hit is always correct.
  if (url.pathname.startsWith('/_next/static/')) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => put(req, res)))
    );
    return;
  }

  e.respondWith(
    fetch(req)
      .then((res) => put(req, res))
      .catch(async () => (await caches.match(req)) || Response.error())
  );
});
