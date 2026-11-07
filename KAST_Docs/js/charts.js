/* KAST Docs charts: small hand-drawn SVG line charts and ground tracks, no libraries. */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  function s(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function niceStep(span, count) {
    const raw = span / Math.max(1, count), mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / mag;
    return (f >= 5 ? 10 : f >= 2 ? 5 : f >= 1 ? 2 : 1) * mag;
  }
  function ticks(lo, hi, count) {
    const st = niceStep(hi - lo || 1, count), out = [];
    for (let v = Math.ceil(lo / st) * st; v <= hi + st * 1e-9; v += st) out.push(+v.toFixed(10));
    return out;
  }
  const fmtNum = v => Math.abs(v) >= 100 ? Math.round(v).toLocaleString() : (+v.toFixed(1)).toString();

  function line(host, o) {
    const W = 640, H = 280, L = 52, R = 16, T = 30, B = 34;
    const x = o.x, n = x.length;
    let ys = [];
    o.series.forEach(sr => sr.y.forEach(v => { if (v != null && isFinite(v)) ys.push(o.clipMin != null ? Math.max(o.clipMin, v) : v); }));
    let y0 = o.yMin != null ? o.yMin : Math.min(...ys), y1 = o.yMax != null ? o.yMax : Math.max(...ys);
    if (y1 === y0) y1 = y0 + 1;
    const yt = ticks(y0, y1, 5); y1 = Math.max(y1, yt[yt.length - 1]);
    const x0 = x[0], x1 = x[n - 1] === x0 ? x0 + 1 : x[n - 1];
    const X = v => L + (v - x0) / (x1 - x0) * (W - L - R);
    const Y = v => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);

    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'kc-svg', role: 'img', 'aria-label': o.series.map(r => r.name).join(', ') + ' against time' });
    // phase bands
    (o.bands || []).forEach((b, i) => {
      const a = X(Math.max(x0, b.from)), z = X(Math.min(x1, b.to));
      if (z - a < 1) return;
      s('rect', { x: a, y: T, width: z - a, height: H - T - B, style: `fill:${i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.015)'}` }, svg);
      if (z - a > 46) { const t = s('text', { x: a + 6, y: T - 10 }, svg); t.textContent = b.label; }
    });
    yt.forEach(v => {
      s('line', { x1: L, x2: W - R, y1: Y(v), y2: Y(v), class: 'kc-grid' }, svg);
      const t = s('text', { x: L - 8, y: Y(v) + 4, 'text-anchor': 'end' }, svg); t.textContent = fmtNum(v);
    });
    ticks(x0, x1, 6).forEach(v => {
      const t = s('text', { x: X(v), y: H - B + 18, 'text-anchor': 'middle' }, svg); t.textContent = fmtNum(v);
    });
    s('line', { x1: L, x2: W - R, y1: H - B, y2: H - B, class: 'kc-axis' }, svg);
    const yl = s('text', { x: 4, y: T - 10 }, svg); yl.textContent = o.yLabel || '';
    const xl = s('text', { x: W - R, y: H - 4, 'text-anchor': 'end' }, svg); xl.textContent = o.xLabel ? 'time (' + o.xLabel + ')' : '';

    o.series.forEach(sr => {
      let d = '';
      sr.y.forEach((v, i) => {
        if (v == null || !isFinite(v)) return;
        const vv = o.clipMin != null ? Math.max(o.clipMin, v) : v;
        d += (d ? 'L' : 'M') + X(x[i]).toFixed(1) + ' ' + Y(Math.min(y1, vv)).toFixed(1);
      });
      s('path', { d, style: `fill:none;stroke:${sr.color};stroke-width:2${sr.dash ? ';stroke-dasharray:6 5' : ''}` }, svg);
    });
    // legend
    if (o.series.length > 1) {
      let lx = W - R;
      o.series.slice().reverse().forEach(sr => {
        const t = s('text', { x: lx, y: T - 10, 'text-anchor': 'end' }, svg); t.textContent = sr.name;
        lx -= sr.name.length * 6.2 + 8;
        s('line', { x1: lx - 16, x2: lx, y1: T - 14, y2: T - 14, style: `stroke:${sr.color};stroke-width:2${sr.dash ? ';stroke-dasharray:4 3' : ''}` }, svg);
        lx -= 30;
      });
    }
    // hover readout
    const hair = s('line', { y1: T, y2: H - B, style: 'stroke:var(--ink);stroke-width:1;opacity:0', class: 'kc-hair' }, svg);
    const tip = s('g', { style: 'opacity:0', class: 'kc-tip' }, svg);
    const tipBg = s('rect', { class: 'kc-tip-bg', rx: 2 }, tip);
    const tipText = s('text', { style: 'fill:var(--ink);font-size:12px' }, tip);
    const hit = s('rect', { x: L, y: T, width: W - L - R, height: H - T - B, style: 'fill:transparent;cursor:crosshair' }, svg);
    function move(ev) {
      const r = svg.getBoundingClientRect();
      const px = (ev.clientX - r.left) / r.width * W;
      const xv = x0 + (px - L) / (W - L - R) * (x1 - x0);
      let lo = 0, hi = n - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (x[m] < xv) lo = m; else hi = m; }
      const i = Math.abs(x[lo] - xv) < Math.abs(x[hi] - xv) ? lo : hi;
      const hx = X(x[i]);
      hair.setAttribute('x1', hx); hair.setAttribute('x2', hx); hair.style.opacity = 0.5;
      tipText.replaceChildren();
      const lines = ['T+' + fmtNum(x[i]) + ' ' + (o.xLabel || '')].concat(o.series.map(sr => sr.name + ': ' + (sr.y[i] == null ? '–' : fmtNum(sr.y[i])) + ' ' + (o.yLabel || '')));
      lines.forEach((ln, k) => { const ts = s('tspan', { x: 10, dy: k ? 16 : 0 }, tipText); ts.textContent = ln; });
      const tw = Math.max(...lines.map(l => l.length)) * 6.8 + 20, th = lines.length * 16 + 12;
      const tx = hx + 12 + tw > W - R ? hx - 12 - tw : hx + 12;
      tipBg.setAttribute('width', tw); tipBg.setAttribute('height', th);
      tip.setAttribute('transform', `translate(${tx},${T + 6})`);
      tipText.setAttribute('y', 20);
      tip.style.opacity = 1;
    }
    hit.addEventListener('mousemove', move);
    hit.addEventListener('mouseleave', () => { hair.style.opacity = 0; tip.style.opacity = 0; });
    host.appendChild(svg);
  }

  function track(host, o) {
    const W = 640, H = 300, M = 36;
    let lats = [], lngs = [];
    o.tracks.forEach(t => t.lat.forEach((v, i) => { if (v != null && t.lng[i] != null) { lats.push(v); lngs.push(t.lng[i]); } }));
    if (o.pad) { lats.push(o.pad[0]); lngs.push(o.pad[1]); }
    let la0 = Math.min(...lats), la1 = Math.max(...lats), lo0 = Math.min(...lngs), lo1 = Math.max(...lngs);
    const spanLng = Math.max(lo1 - lo0, 2), spanLat = Math.max(la1 - la0, spanLng * (H - 2 * M) / (W - 2 * M));
    const cLat = (la0 + la1) / 2, cLng = (lo0 + lo1) / 2;
    const sc = Math.min((W - 2 * M) / spanLng, (H - 2 * M) / spanLat) * 0.92;
    const X = v => W / 2 + (v - cLng) * sc, Y = v => H / 2 - (v - cLat) * sc;
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'kc-svg', role: 'img', 'aria-label': 'Ground track' });
    s('rect', { x: 0, y: 0, width: W, height: H, style: 'fill:rgba(201,162,75,0.05)' }, svg);
    ticks(cLng - W / 2 / sc, cLng + W / 2 / sc, 6).forEach(v => {
      s('line', { x1: X(v), x2: X(v), y1: 0, y2: H, class: 'kc-grid' }, svg);
      const t = s('text', { x: X(v) + 4, y: H - 8 }, svg); t.textContent = fmtNum(v) + '°';
    });
    if (Y(0) > 0 && Y(0) < H) {
      s('line', { x1: 0, x2: W, y1: Y(0), y2: Y(0), style: 'stroke:#444444;stroke-dasharray:4 4' }, svg);
      const t = s('text', { x: 8, y: Y(0) - 6 }, svg); t.textContent = 'equator';
    }
    o.tracks.forEach(t => {
      let d = '';
      t.lat.forEach((v, i) => { if (v == null || t.lng[i] == null) return; d += (d ? 'L' : 'M') + X(t.lng[i]).toFixed(1) + ' ' + Y(v).toFixed(1); });
      s('path', { d, style: `fill:none;stroke:${t.color};stroke-width:2` }, svg);
    });
    if (o.pad) {
      s('circle', { cx: X(o.pad[1]), cy: Y(o.pad[0]), r: 5, style: 'fill:var(--deep);stroke:var(--ink);stroke-width:2' }, svg);
      const t = s('text', { x: X(o.pad[1]) + 9, y: Y(o.pad[0]) + 16, style: 'fill:var(--ink)' }, svg); t.textContent = 'KSC pad';
    }
    let lx = W - 12;
    o.tracks.slice().reverse().forEach(t => {
      const tt = s('text', { x: lx, y: 20, 'text-anchor': 'end' }, svg); tt.textContent = t.name;
      lx -= t.name.length * 6.2 + 6;
      s('line', { x1: lx - 16, x2: lx, y1: 16, y2: 16, style: `stroke:${t.color};stroke-width:2` }, svg);
      lx -= 28;
    });
    host.appendChild(svg);
  }

  window.KASTCharts = { line, track };
})();
