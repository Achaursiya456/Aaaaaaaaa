/* Singify service worker: offline shell + downloaded songs ('sg-audio' cache) ko Range support ke saath play karna */
const SHELL = 'singify-v8', AUDIO = 'sg-audio';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

async function audioFromCache(req) {
  const c = await caches.open(AUDIO);
  const hit = await c.match(req.url);
  if (!hit) return fetch(req);
  const range = req.headers.get('range');
  if (!range) return hit;
  const buf = await hit.arrayBuffer(), len = buf.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
  let s = m[1] ? +m[1] : 0, e = m[2] ? +m[2] : len - 1;
  e = Math.min(e, len - 1);
  return new Response(buf.slice(s, e + 1), { status: 206, headers: {
    'Content-Type': hit.headers.get('Content-Type') || 'audio/mp4',
    'Content-Range': 'bytes ' + s + '-' + e + '/' + len,
    'Content-Length': String(e - s + 1), 'Accept-Ranges': 'bytes' } });
}

async function shell(req) {
  try {
    const net = await fetch(req);
    if (net.ok) { const c = await caches.open(SHELL); c.put(req, net.clone()); }
    return net;
  } catch (err) {
    const m = await caches.match(req, { ignoreSearch: true });
    if (m) return m;
    if (req.mode === 'navigate') { const i = (await caches.match('/index.html')) || (await caches.match('/')); if (i) return i; }
    throw err;
  }
}

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== location.origin) {
    if (r.destination === 'audio' || r.destination === 'video' || r.headers.has('range') || /\.(mp4|m4a|mp3)(\?|$)/i.test(u.pathname)) e.respondWith(audioFromCache(r));
    return;
  }
  if (u.pathname.startsWith('/api/') || u.pathname === '/version.json') return;
  e.respondWith(shell(r));
});
