'use strict';
/* /api/music?p=/api/search/songs&query=...&limit=30
   Singify ka saara song traffic yahin se guzarta hai. Ye request ko jio.shnwaz.dev
   (ya env MUSIC_API_URL) par forward karta hai aur JSON wapas deta hai.
   Fayde: CORS ka tension nahi, short cache (tez + upstream par kam load), fallback servers. */

const PRIMARY = (process.env.MUSIC_API_URL || 'https://jio.shnwaz.dev').replace(/\/+$/, '');
const EXTRA = (process.env.MUSIC_API_FALLBACKS || '').split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean);
const BASES = [PRIMARY, ...EXTRA];
const TIMEOUT_MS = +process.env.MUSIC_API_TIMEOUT || 10000;
const MAX_CACHE_BYTES = (+process.env.MUSIC_CACHE_MB || 32) * 1024 * 1024;   // memory cap
const MAX_ITEM_BYTES = 1.5 * 1024 * 1024;                                  // bahut bade response cache nahi hote
let cacheBytes = 0;

/* sirf saavn-style paths allowed: /api/... aur purana /result/ */
const OK_PATH = /^\/(?:api(?:\/[A-Za-z0-9_.\-~%]+)+|result\/?)$/;

const cache = new Map();      // key -> {t, ttl, text}  (raw JSON text, parsed object nahi: memory kam)
const inflight = new Map();   // key -> Promise

function ttlFor(p) {
  /* stream links jaldi purane ho sakte hain -> song details ka cache chhota */
  if (/^\/api\/songs(\/[^/]+)?$/.test(p)) return 3 * 60e3;
  return 10 * 60e3;
}

function cacheDel(k) {
  const c = cache.get(k);
  if (c) { cacheBytes -= c.size; cache.delete(k); }
}
function cacheGet(k) {
  const c = cache.get(k);
  if (!c) return null;
  if (Date.now() - c.t > c.ttl) { cacheDel(k); return null; }
  cache.delete(k); cache.set(k, c);              // LRU: haal hi me use hua -> aage
  return c.text;
}
function cacheSet(k, text, ttl) {
  const size = text.length * 2;
  if (size > MAX_ITEM_BYTES) return;
  cacheDel(k);
  while (cacheBytes + size > MAX_CACHE_BYTES && cache.size) cacheDel(cache.keys().next().value);
  cache.set(k, { t: Date.now(), ttl, text, size });
  cacheBytes += size;
}

async function callUpstream(base, p, qs) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(base + p + (qs ? '?' + qs : ''), {
      signal: ctl.signal,
      headers: { accept: 'application/json', 'user-agent': 'Singify/1.0 (+personal use)' }
    });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { /* HTML error page etc. */ }
    return { status: r.status, json, text };
  } finally { clearTimeout(timer); }
}

async function fetchAny(p, qs) {
  let last = { status: 502, json: null };
  for (const base of BASES) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await callUpstream(base, p, qs);
        if (r.json && r.status < 500 && r.status !== 429) return r;   // 200 / 400 / 404 -> as it is
        last = r;
      } catch (e) { last = { status: 502, json: null, err: e.message }; }
      await new Promise(z => setTimeout(z, 200));
    }
  }
  return last;
}

function send(res, status, obj, extra) {
  const body = typeof obj === 'string' ? obj : JSON.stringify(obj);
  res.writeHead(status, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  }, extra || {}));
  res.end(body);
}

module.exports = async function music(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { success: false, message: 'GET only' });

  const p = url.searchParams.get('p') || '';
  if (!OK_PATH.test(p) || p.includes('..')) return send(res, 400, { success: false, message: 'bad path' });

  const q = new URLSearchParams();
  [...url.searchParams.entries()].filter(([k]) => k !== 'p').sort(([a], [b]) => a.localeCompare(b)).forEach(([k, v]) => q.append(k, v));
  const qs = q.toString();
  const key = p + '?' + qs;

  const hit = cacheGet(key);
  if (hit) return send(res, 200, hit, { 'X-Cache': 'HIT', 'Cache-Control': 'private, max-age=60' });

  let job = inflight.get(key);
  if (!job) {
    job = fetchAny(p, qs).finally(() => inflight.delete(key));
    inflight.set(key, job);
  }
  const r = await job;

  if (r.json) {
    if (r.status === 200 && r.json.success !== false) cacheSet(key, r.text, ttlFor(p));
    return send(res, r.status, r.text, { 'X-Cache': 'MISS' });
  }
  return send(res, 502, { success: false, message: 'music server not reachable' + (r.err ? ': ' + r.err : '') });
};
