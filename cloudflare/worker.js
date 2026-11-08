// KAST visit logger: records page views from the KAST website and shows them to the owner.
// Endpoints: POST /hit (log a view), GET /gate (is this visitor blocked?), GET /log?key=... (owner view).
// Bindings: DB (D1 database), VIEW_KEY (secret).
const SITE = 'https://envybreaded.github.io';
const BLOCKED = ['c40d726143ea44f7fadc097b9151e41b840286565f35876b3729c17ebdceb9e7']; // SHA-256 of blocked IPs
let ready = false;

async function sha(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
function cors(req) {
  const o = req.headers.get('Origin') || '';
  return { 'Access-Control-Allow-Origin': o === SITE || o.startsWith('http://localhost') ? o : SITE, 'Vary': 'Origin' };
}
async function setup(env) {
  if (ready) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS visits (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, ip TEXT, page TEXT, ref TEXT, ua TEXT, country TEXT, city TEXT, org TEXT)').run();
  ready = true;
}
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function device(ua) {
  ua = ua || '';
  const os = /Windows/.test(ua) ? 'Windows' : /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Other';
  const br = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /bot|crawl|spider/i.test(ua) ? 'Bot' : 'Other';
  return br + ' / ' + os;
}
const et = ts => new Date(ts).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' });

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const ip = req.headers.get('CF-Connecting-IP') || '';
    if (req.method === 'OPTIONS') return new Response(null, { headers: { ...cors(req), 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type' } });

    if (url.pathname === '/hit' && req.method === 'POST') {
      let body = {};
      try { body = JSON.parse(await req.text()); } catch (e) { body = {}; }
      const cf = req.cf || {};
      ctx.waitUntil((async () => {
        await setup(env);
        await env.DB.prepare('INSERT INTO visits (ts, ip, page, ref, ua, country, city, org) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(new Date().toISOString(), ip, String(body.p || '/').slice(0, 200), String(body.r || '').slice(0, 300),
            (req.headers.get('User-Agent') || '').slice(0, 300), cf.country || '', cf.city || '', cf.asOrganization || '').run();
      })());
      return new Response('ok', { headers: cors(req) });
    }

    if (url.pathname === '/gate') {
      const b = BLOCKED.includes(await sha(ip));
      return new Response(JSON.stringify({ b }), { headers: { ...cors(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    }

    if (url.pathname === '/log') {
      if (!env.VIEW_KEY || url.searchParams.get('key') !== env.VIEW_KEY) return new Response('Not found', { status: 404 });
      await setup(env);
      const rows = (await env.DB.prepare('SELECT * FROM visits ORDER BY id DESC LIMIT 500').all()).results || [];
      const ips = (await env.DB.prepare('SELECT ip, COUNT(*) n, MAX(ts) last, MAX(country) country, MAX(city) city, MAX(org) org FROM visits GROUP BY ip ORDER BY last DESC LIMIT 200').all()).results || [];
      const total = (await env.DB.prepare('SELECT COUNT(*) n FROM visits').first()).n;
      const blockedSet = new Set();
      for (const r of ips) if (BLOCKED.includes(await sha(r.ip))) blockedSet.add(r.ip);
      const ipRows = ips.map(r => `<tr><td class="ip">${esc(r.ip)}${blockedSet.has(r.ip) ? ' <span class="tag">blocked</span>' : ''}</td><td>${esc([r.city, r.country].filter(Boolean).join(', '))}</td><td>${esc(r.org)}</td><td class="num">${r.n}</td><td>${esc(et(r.last))}</td></tr>`).join('');
      const visitRows = rows.map(r => `<tr><td>${esc(et(r.ts))}</td><td class="ip">${esc(r.ip)}</td><td>${esc(r.page)}</td><td>${esc([r.city, r.country].filter(Boolean).join(', '))}</td><td>${esc(device(r.ua))}</td><td>${esc(r.ref)}</td></tr>`).join('');
      const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>KAST visitors</title>
<style>body{margin:0;background:#000;color:#fff;font:15px/1.45 "Segoe UI",Inter,Arial,sans-serif}main{max-width:1200px;margin:0 auto;padding:40px 24px}
h1{font-size:2rem;letter-spacing:.06em;text-transform:uppercase;margin:0 0 4px}h2{color:#C9A24B;font-size:.85rem;letter-spacing:.2em;text-transform:uppercase;margin:40px 0 12px}
.lead{color:#B3B3B3;margin:0 0 8px}table{width:100%;border-collapse:collapse}th{text-align:left;color:#B3B3B3;font-weight:500;font-size:.75rem;letter-spacing:.15em;text-transform:uppercase;padding:10px 12px 10px 0;border-bottom:1px solid #2A2A2A}
td{padding:10px 12px 10px 0;border-bottom:1px solid #1d1d1d;vertical-align:top}.ip{font-family:Consolas,monospace;color:#C9A24B}.num{text-align:right}.tag{border:1px solid #e2483c;color:#e2483c;font-size:.7rem;padding:1px 6px;margin-left:6px;font-family:inherit}</style></head>
<body><main><h1>KAST visitors</h1><p class="lead">${total} page views logged from ${ips.length} IP addresses. Times are Eastern. Newest first.</p>
<h2>By IP address</h2><table><tr><th>IP</th><th>Location</th><th>Network</th><th class="num">Views</th><th>Last seen</th></tr>${ipRows || '<tr><td colspan="5">No visits yet.</td></tr>'}</table>
<h2>Every view (last 500)</h2><table><tr><th>Time</th><th>IP</th><th>Page</th><th>Location</th><th>Browser</th><th>Came from</th></tr>${visitRows}</table></main></body></html>`;
      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
    return new Response('KAST', { headers: { 'Content-Type': 'text/plain' } });
  }
};
