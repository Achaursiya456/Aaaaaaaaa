'use strict';
/* /api/dl?u=<audio url>  -> app ke "Download" button ke liye audio proxy (browser CORS block kare to).
   Open proxy na ban jaye isliye sirf JioSaavn ke CDN hosts allowed hain. Range requests bhi chalte hain. */
const { Readable } = require('stream');

const HOST_OK = /(^|\.)(saavncdn\.com|jiosaavn\.com|jio\.com|saavn\.com)$/i;

function bad(res, code, msg) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: false, message: msg }));
}

module.exports = async function dl(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return bad(res, 405, 'GET only');
  let target;
  try { target = new URL(url.searchParams.get('u') || ''); } catch (e) { return bad(res, 400, 'bad url'); }
  if (!/^https?:$/.test(target.protocol) || !HOST_OK.test(target.hostname)) return bad(res, 403, 'host not allowed');

  const ctl = new AbortController();
  res.on('close', () => ctl.abort());
  const h = { 'user-agent': 'Mozilla/5.0 Singify' };
  if (req.headers.range) h.range = req.headers.range;
  if (req.headers['if-range']) h['if-range'] = req.headers['if-range'];

  try {
    const up = await fetch(target, { headers: h, signal: ctl.signal, redirect: 'follow' });
    if (!HOST_OK.test(new URL(up.url).hostname)) { ctl.abort(); return bad(res, 403, 'redirect not allowed'); }
    if (!up.ok && up.status !== 206) return bad(res, up.status === 404 ? 404 : 502, 'upstream ' + up.status);

    let ct = up.headers.get('content-type') || '';
    if (!/audio|octet/i.test(ct)) ct = /\.(mp4|m4a)(\?|$)/i.test(target.pathname) ? 'audio/mp4' : 'audio/mpeg';
    const out = { 'Content-Type': ct, 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=3600' };
    for (const k of ['content-length', 'content-range', 'etag', 'last-modified']) { const v = up.headers.get(k); if (v) out[k] = v; }
    res.writeHead(up.status, out);
    if (req.method === 'HEAD' || !up.body) return res.end();
    Readable.fromWeb(up.body).on('error', () => res.destroy()).pipe(res);
  } catch (e) {
    if (!res.headersSent) bad(res, 502, 'download failed');
    else res.destroy();
  }
};
