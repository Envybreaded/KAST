/* KAST Blueprints: hidden-line drawings of real KAST craft, built from the game's own part meshes.
   Data: data/blueprints/<craft>.json + .bin, made by KAST_Docs/tools/blueprints (reads .craft, the
   ModuleManager cache and the .mu models). Needs three.js (js/vendor/three.min.js). */
(function () {
  'use strict';
  let T = window.THREE;            // three.js may finish loading after this file; mount() picks it up
  const BASE = 'data/blueprints/';
  const VER = window.KAST_BUILD && window.KAST_BUILD !== '__BUILD__' ? '?v=' + window.KAST_BUILD : '';
  const SYS = {
    engines: 'Engines', propellant: 'Tanks', rcs: 'RCS', command: 'Avionics', crew: 'Crew modules', power: 'Power',
    docking: 'Docking', separation: 'Separation', fairing: 'Fairing', science: 'Science and cameras',
    aero: 'Fins', landing: 'Landing legs', ground: 'Launch clamps', structure: 'Structure'
  };
  const SYS_ORDER = Object.keys(SYS);
  const ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

  let live = null;   // the mounted viewer

  function el(tag, attrs, kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'text') n.textContent = v;
      else if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    (Array.isArray(kids) ? kids : kids != null ? [kids] : []).forEach(c => c != null && n.append(c));
    return n;
  }
  const fmtM = x => (x >= 10 ? x.toFixed(1) : x.toFixed(2)).replace(/\.?0+$/, m => m.includes('.') ? '' : m);

  /* ---------- shaders: instanced hidden-line strokes ---------- */
  const lineVS = `
    attribute mat4 iMat; attribute float iSel; attribute vec3 iOff;
    varying float vSel;
    void main() {
      vSel = iSel;
      vec4 w = iMat * vec4(position, 1.0); w.xyz += iOff;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`;
  const silVS = `
    attribute mat4 iMat; attribute float iSel; attribute vec3 iOff;
    attribute vec3 oth; attribute vec3 c0; attribute vec3 c1;
    varying float vSel; varying float vShow;
    vec2 ndc(vec3 p) { vec4 w = iMat * vec4(p, 1.0); w.xyz += iOff; vec4 c = projectionMatrix * viewMatrix * w; return c.xy / c.w; }
    void main() {
      vSel = iSel;
      vec2 A = ndc(position), B = ndc(oth), P = ndc(c0), Q = ndc(c1);
      vec2 d = B - A;
      float s0 = d.x * (P.y - A.y) - d.y * (P.x - A.x);
      float s1 = d.x * (Q.y - A.y) - d.y * (Q.x - A.x);
      vShow = s0 * s1 >= 0.0 ? 1.0 : 0.0;      // both faces on one side: the edge is on the outline
      vec4 w = iMat * vec4(position, 1.0); w.xyz += iOff;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`;
  const lineFS = (sil) => `
    uniform vec3 uInk; uniform vec3 uDim; uniform vec3 uHot; uniform float uAnyHot;
    varying float vSel; ${sil ? 'varying float vShow;' : ''}
    void main() {
      ${sil ? 'if (vShow < 0.5) discard;' : ''}
      vec3 c = vSel > 1.5 ? uHot : (uAnyHot > 0.5 && vSel < 0.5 ? uDim : uInk);
      gl_FragColor = vec4(c, 1.0);
    }`;
  const fillVS = `
    attribute mat4 iMat; attribute vec3 iOff;
    void main() { vec4 w = iMat * vec4(position, 1.0); w.xyz += iOff; gl_Position = projectionMatrix * viewMatrix * w; }`;
  const fillFS = `uniform vec3 uBg; void main() { gl_FragColor = vec4(uBg, 1.0); }`;

  /* ---------- loading ---------- */
  const cache = {};
  function loadCraft(slug) {
    if (!cache[slug]) cache[slug] = fetch(BASE + slug + '.json' + VER).then(r => {
      if (!r.ok) throw new Error('missing ' + slug);
      return r.json();
    }).then(doc => fetch(BASE + doc.bin + VER).then(r => r.arrayBuffer()).then(buf => ({ doc, buf })))
      .catch(e => { delete cache[slug]; throw e; });
    return cache[slug];
  }

  /* Geometry for one packed mesh, shared by every instance of it. */
  function buildMesh(m, buf) {
    const q = new Int16Array(buf, m.v, m.nv * 3);
    const pos = new Float32Array(m.nv * 3);
    for (let i = 0; i < m.nv; i++) for (let k = 0; k < 3; k++) pos[i * 3 + k] = m.c[k] + q[i * 3 + k] / 32767 * m.e[k];
    const IA = m.it === 'u32' ? Uint32Array : Uint16Array;
    const tri = new IA(buf, m.t, m.nt * 3), hard = new IA(buf, m.h, m.nh * 2), soft = new IA(buf, m.s, m.ns * 4);
    const posAttr = new T.BufferAttribute(pos, 3);
    const fill = new T.InstancedBufferGeometry(); fill.setAttribute('position', posAttr); fill.setIndex(new T.BufferAttribute(tri.slice(), 1));
    const lines = new T.InstancedBufferGeometry(); lines.setAttribute('position', posAttr); lines.setIndex(new T.BufferAttribute(hard.slice(), 1));
    // silhouette candidates: two vertices per smoothed edge, each knowing the other end and both opposite vertices
    const n = m.ns, sp = new Float32Array(n * 6), so = new Float32Array(n * 6), s0 = new Float32Array(n * 6), s1 = new Float32Array(n * 6);
    for (let e = 0; e < n; e++) {
      const a = soft[e * 4], b = soft[e * 4 + 1], c = soft[e * 4 + 2], d = soft[e * 4 + 3];
      for (let k = 0; k < 3; k++) {
        sp[e * 6 + k] = pos[a * 3 + k]; sp[e * 6 + 3 + k] = pos[b * 3 + k];
        so[e * 6 + k] = pos[b * 3 + k]; so[e * 6 + 3 + k] = pos[a * 3 + k];
        s0[e * 6 + k] = s0[e * 6 + 3 + k] = pos[c * 3 + k];
        s1[e * 6 + k] = s1[e * 6 + 3 + k] = pos[d * 3 + k];
      }
    }
    const sil = new T.InstancedBufferGeometry();
    sil.setAttribute('position', new T.BufferAttribute(sp, 3)); sil.setAttribute('oth', new T.BufferAttribute(so, 3));
    sil.setAttribute('c0', new T.BufferAttribute(s0, 3)); sil.setAttribute('c1', new T.BufferAttribute(s1, 3));
    // plain geometry for tap picking
    const pick = new T.BufferGeometry(); pick.setAttribute('position', posAttr); pick.setIndex(fill.index);
    pick.computeBoundingSphere(); pick.computeBoundingBox();
    return { fill, lines, sil, pick, m };
  }

  /* ---------- the viewer ---------- */
  function mount(host, opts) {
    unmount();
    T = window.THREE;
    const crafts = opts.crafts;
    let slug = crafts.some(c => c.slug === opts.slug) ? opts.slug : crafts[0].slug;

    const view = el('div', { class: 'bp-view', tabindex: '0', 'aria-label': 'Blueprint. Drag to turn, pinch or scroll to zoom, tap a part to name it.' });
    const status = el('div', { class: 'bp-status', role: 'status', text: 'Loading the blueprint…' });
    const card = el('div', { class: 'bp-card', hidden: true });
    const reset = el('button', { class: 'bp-btn', type: 'button', text: 'Reset view' });
    const sepLabel = el('label', { class: 'bp-sep' });
    const sep = el('input', { type: 'range', min: '0', max: '100', value: '0', 'aria-label': 'Separate' });
    sepLabel.append(el('span', { text: 'Separate' }), sep);
    const shellBtn = el('button', { class: 'bp-btn', type: 'button', 'aria-pressed': 'true', text: 'Fairing on', hidden: true });
    const tools = el('div', { class: 'bp-tools' }, [reset, shellBtn, sepLabel]);
    view.append(status, card, tools);

    const tabs = el('div', { class: 'bp-tabs', role: 'tablist', 'aria-label': 'Craft' },
      crafts.map(c => el('button', { class: 'bp-tab', type: 'button', role: 'tab', 'data-slug': c.slug }, [
        el('span', { class: 'bp-tab-name', text: c.title }), el('span', { class: 'bp-tab-sub', text: c.sub })])));
    const panel = el('aside', { class: 'bp-panel' });
    const wrap = el('div', { class: 'bp' }, [tabs, el('div', { class: 'bp-body' }, [view, panel])]);
    host.replaceChildren(wrap);

    let renderer;
    try {
      renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch (e) {
      if (window.console) console.error(e);
      tools.hidden = true; panel.hidden = true;
      status.textContent = 'This browser cannot draw 3D (WebGL is off or unavailable).';
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    view.prepend(renderer.domElement);

    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(30, 1, 0.1, 5000);
    const ink = new T.Color(0xf2f2f2), dim = new T.Color(0x3a3a3a), hot = new T.Color(0xc9a24b), bg = new T.Color(0x000000);
    const U = { uInk: { value: ink }, uDim: { value: dim }, uHot: { value: hot }, uAnyHot: { value: 0 } };
    const lineMat = new T.ShaderMaterial({ uniforms: U, vertexShader: lineVS, fragmentShader: lineFS(false) });
    const silMat = new T.ShaderMaterial({ uniforms: U, vertexShader: silVS, fragmentShader: lineFS(true) });
    const fillMat = new T.ShaderMaterial({ uniforms: { uBg: { value: bg } }, vertexShader: fillVS, fragmentShader: fillFS,
      side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });

    const st = {
      yaw: 0.6, pitch: 0.18, dist: 50, distGoal: 50, target: new T.Vector3(), targetGoal: new T.Vector3(),
      home: null, craft: null, objs: [], meshes: [], insts: [], parts: [], sel: null, hot: null, dirty: true,
      shell: true, sep: 0, raf: 0, size: [1, 1], bounds: null
    };

    function resize() {
      const w = view.clientWidth || 1, h = view.clientHeight || 1;
      if (w === st.size[0] && h === st.size[1]) return;
      st.size = [w, h];
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
      if (st.home) frame(false);
      st.dirty = true;
    }
    const ro = new ResizeObserver(resize); ro.observe(view);

    /* fit the whole vehicle in view, from the current direction */
    function frame(animate) {
      const b = st.bounds; if (!b) return;
      const c = b.getCenter(new T.Vector3()), s = b.getSize(new T.Vector3());
      const r = 0.5 * s.length();
      const vf = T.MathUtils.degToRad(camera.fov) / 2, hf = Math.atan(Math.tan(vf) * camera.aspect);
      const d = r / Math.sin(Math.min(vf, hf)) * 1.04;
      st.home = { c, d };
      st.targetGoal.copy(c); st.distGoal = d;
      if (!animate) { st.target.copy(c); st.dist = d; }
      st.dirty = true;
    }

    function clearCraft() {
      st.objs.forEach(o => scene.remove(o));
      st.meshes.forEach(g => { g.fill.dispose(); g.lines.dispose(); g.sil.dispose(); g.pick.dispose(); });
      st.objs = []; st.meshes = []; st.insts = []; st.parts = []; st.sel = null; st.hot = null; st.bounds = null;
    }

    function show(next) {
      slug = next;
      tabs.querySelectorAll('.bp-tab').forEach(b => b.setAttribute('aria-selected', b.dataset.slug === slug ? 'true' : 'false'));
      if (opts.onSlug) opts.onSlug(slug);
      status.hidden = false; status.textContent = 'Loading the blueprint…';
      card.hidden = true;
      const want = slug;
      loadCraft(slug).then(({ doc, buf }) => {
        if (!live || live.view !== view || want !== slug) return;
        clearCraft();
        build(doc, buf);
        status.hidden = true;
      }).catch(e => { if (window.console) console.error(e); if (want === slug) status.textContent = 'This blueprint could not be loaded. Reload the page to try again.'; });
    }

    function build(doc, buf) {
      st.craft = doc;
      st.parts = doc.parts.map((p, i) => ({ ...p, i, inst: [] }));
      const geos = doc.meshes.map(m => buildMesh(m, buf));
      st.meshes = geos;
      // instances grouped per mesh
      const per = geos.map(() => []);
      doc.inst.forEach(r => per[r[0]].push(r));
      const box = new T.Box3(), tmp = new T.Box3();
      geos.forEach((g, mi) => {
        const rows = per[mi]; if (!rows.length) return;
        const n = rows.length;
        const mats = new Float32Array(n * 16), sel = new Float32Array(n), off = new Float32Array(n * 3);
        const M = new T.Matrix4(), P = new T.Vector3(), Q = new T.Quaternion(), S = new T.Vector3(1, 1, 1);
        rows.forEach((r, k) => {
          P.set(r[1], r[2], r[3]); Q.set(r[4], r[5], r[6], r[7]);
          M.compose(P, Q, S); M.toArray(mats, k * 16);
          const inst = { mesh: mi, k, part: r[8], matrix: M.clone(), pos: P.clone(), shell: !!g.m.shell };
          st.insts.push(inst); st.parts[r[8]].inst.push(inst);
          tmp.copy(g.pick.boundingBox).applyMatrix4(M); box.union(tmp);
          inst.box = tmp.clone();
        });
        const aM = new T.InstancedBufferAttribute(mats, 16), aS = new T.InstancedBufferAttribute(sel, 1), aO = new T.InstancedBufferAttribute(off, 3);
        aS.setUsage(T.DynamicDrawUsage); aO.setUsage(T.DynamicDrawUsage);
        [g.fill, g.lines, g.sil].forEach(geo => { geo.setAttribute('iMat', aM); geo.setAttribute('iOff', aO); geo.instanceCount = n; });
        g.lines.setAttribute('iSel', aS); g.sil.setAttribute('iSel', aS);
        g.aS = aS; g.aO = aO; g.rows = rows;
        const f = new T.Mesh(g.fill, fillMat), l = new T.LineSegments(g.lines, lineMat), s = new T.LineSegments(g.sil, silMat);
        [f, l, s].forEach(o => { o.frustumCulled = false; o.matrixAutoUpdate = false; });
        f.renderOrder = 0; l.renderOrder = 1; s.renderOrder = 1;
        g.objs = [f, l, s];
        st.objs.push(f, l, s); scene.add(f, l, s);
      });
      st.bounds = box;
      st.axis = (box.max.y - box.min.y) >= Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
      st.shell = true; st.sep = 0; sep.value = '0';
      const hasShell = st.insts.some(i => i.shell);
      shellBtn.hidden = !hasShell; shellBtn.setAttribute('aria-pressed', 'true'); shellBtn.textContent = 'Fairing on';
      st.yaw = 0.6; st.pitch = 0.18;
      frame(false);
      applyOffsets();
      renderPanel();
      paint();
    }

    /* ---------- separate: stages slide apart; a single-stage craft spreads out from its centre ---------- */
    function applyOffsets() {
      const doc = st.craft; if (!doc) return;
      const t = st.sep / 100, b = st.bounds, size = b.getSize(new T.Vector3()), c = b.getCenter(new T.Vector3());
      const groups = doc.groups;
      const gap = Math.max(size.y, size.x, size.z) * (groups > 1 ? 0.07 : 0.16);
      st.meshes.forEach(g => {
        if (!g.rows) return;
        const o = g.aO.array;
        g.rows.forEach((r, k) => {
          const p = st.parts[r[8]];
          let x = 0, y = 0, z = 0;
          if (t > 0) {
            if (groups > 1) {
              y = p.g * gap * t;
              const rx = r[1] - c.x, rz = r[3] - c.z, rr = Math.hypot(rx, rz);
              if (p.g === 0 && rr > 0.8) { x = rx / rr * gap * 0.45 * t; z = rz / rr * gap * 0.45 * t; }
            } else {
              x = (r[1] - c.x) * 0.7 * t; y = (r[2] - c.y) * 0.7 * t; z = (r[3] - c.z) * 0.7 * t;
            }
          }
          if (g.m.shell && !st.shell) { y += 1e6; }        // fairing shell parked far away when switched off
          o[k * 3] = x; o[k * 3 + 1] = y; o[k * 3 + 2] = z;
        });
        g.aO.needsUpdate = true;
      });
      // keep the spread-out vehicle in frame
      if (st.home) {
        const grow = groups > 1 ? 1 + (groups - 1) * 0.07 * t : 1 + 0.7 * t;
        const lift = groups > 1 ? (groups - 1) * gap * t / 2 : 0;
        st.targetGoal.set(st.home.c.x, st.home.c.y + lift, st.home.c.z);
        st.distGoal = st.home.d * grow;
      }
      st.dirty = true;
    }
    sep.addEventListener('input', () => { st.sep = +sep.value; applyOffsets(); });
    shellBtn.addEventListener('click', () => {
      st.shell = !st.shell;
      shellBtn.setAttribute('aria-pressed', st.shell ? 'true' : 'false');
      shellBtn.textContent = st.shell ? 'Fairing on' : 'Fairing off';
      applyOffsets();
    });

    /* ---------- highlight ---------- */
    function setHot(h) {             // h: null | {kind:'sys'|'grp'|'part', key}
      st.hot = h;
      const on = p => !h ? false : h.kind === 'sys' ? p.sys === h.key : h.kind === 'grp' ? p.g === h.key : p.i === h.key || (h.same && p.id === h.same);
      st.meshes.forEach(g => {
        if (!g.rows) return;
        g.rows.forEach((r, k) => { g.aS.array[k] = on(st.parts[r[8]]) ? 2 : 0; });
        g.aS.needsUpdate = true;
      });
      U.uAnyHot.value = h ? 1 : 0;
      panel.querySelectorAll('[data-hot]').forEach(b => b.setAttribute('aria-pressed', h && b.dataset.hot === h.kind + ':' + h.key ? 'true' : 'false'));
      st.dirty = true;
    }

    function partCard(p) {
      if (!p) { card.hidden = true; return; }
      const same = st.parts.filter(x => x.id === p.id).length;
      const groupName = groupLabel(p.g);
      card.replaceChildren(
        el('button', { class: 'bp-card-x', type: 'button', 'aria-label': 'Close', text: '×', onclick: () => { setHot(null); partCard(null); } }),
        el('p', { class: 'bp-card-sys', text: SYS[p.sys] || 'Part' }),
        el('h3', { class: 'bp-card-title', text: p.n }),
        el('p', { class: 'bp-card-meta' }, [el('code', { text: p.id })]),
        el('p', { class: 'bp-card-meta', text: (same > 1 ? same + ' on this craft. ' : '') + groupName + '.' }));
      card.hidden = false;
    }
    function groupLabel(g) {
      const n = st.craft.groups;
      if (n <= 1) return 'Stays together';
      if (g === n - 1) return 'Stays to the end';
      return 'Separates ' + (ORD[g] || (g + 1) + 'th');
    }

    /* ---------- side panel ---------- */
    function renderPanel() {
      const doc = st.craft, info = crafts.find(c => c.slug === slug) || {};
      const s = st.bounds.getSize(new T.Vector3());
      const h = s.y, w = Math.max(s.x, s.z);
      const counts = {};
      doc.parts.forEach(p => { counts[p.sys] = (counts[p.sys] || 0) + 1; });
      const kinds = new Set(doc.parts.map(p => p.id)).size;
      const chip = (kind, key, label, n) => el('button', { class: 'bp-chip', type: 'button', 'data-hot': kind + ':' + key, 'aria-pressed': 'false',
        onclick: () => { const same = st.hot && st.hot.kind === kind && st.hot.key === key; setHot(same ? null : { kind, key }); partCard(null); } },
        [label, n != null ? el('span', { text: String(n) }) : null]);
      const sysChips = SYS_ORDER.filter(k => counts[k]).map(k => chip('sys', k, SYS[k], counts[k]));
      const grpChips = doc.groups > 1 ? Array.from({ length: doc.groups }, (_, g) => chip('grp', g, groupLabel(g), doc.parts.filter(p => p.g === g).length)) : [];
      // part list: one row per kind of part
      const kindsList = [];
      const byId = new Map();
      doc.parts.forEach(p => { if (!byId.has(p.id)) { byId.set(p.id, { p, n: 0 }); kindsList.push(byId.get(p.id)); } byId.get(p.id).n++; });
      kindsList.sort((a, b) => SYS_ORDER.indexOf(a.p.sys) - SYS_ORDER.indexOf(b.p.sys) || a.p.n.localeCompare(b.p.n));
      const list = el('ul', { class: 'bp-list' }, kindsList.map(({ p, n }) => el('li', null, el('button', { class: 'bp-row', type: 'button',
        onclick: () => { setHot({ kind: 'part', key: p.i, same: p.id }); partCard(p); } },
        [el('span', { class: 'bp-row-n', text: n > 1 ? n + '×' : '' }), el('span', { text: p.n })]))));
      panel.replaceChildren(...[
        el('h2', { class: 'bp-name', text: info.title || doc.name }),
        el('p', { class: 'bp-sub', text: info.blurb || '' }),
        el('dl', { class: 'bp-dims' }, [
          el('div', null, [el('dt', { text: 'Height' }), el('dd', null, [fmtM(h), el('small', { text: ' m' })])]),
          el('div', null, [el('dt', { text: 'Span' }), el('dd', null, [fmtM(w), el('small', { text: ' m' })])]),
          el('div', null, [el('dt', { text: 'Parts' }), el('dd', { text: String(doc.parts.length) })]),
          el('div', null, [el('dt', { text: 'Kinds' }), el('dd', { text: String(kinds) })])
        ]),
        el('h3', { class: 'bp-h', text: 'Systems' }), el('div', { class: 'bp-chips' }, sysChips),
        grpChips.length ? el('h3', { class: 'bp-h', text: 'Separation order' }) : null,
        grpChips.length ? el('div', { class: 'bp-chips' }, grpChips) : null,
        el('details', { class: 'bp-more', open: window.innerWidth > 900 }, [el('summary', { class: 'bp-h', text: 'Parts list, ' + kinds + ' kinds' }), list]),
        el('p', { class: 'bp-src', text: 'Drawn from ' + doc.name + '.craft and the part models in GameData. Only the variants and parts the game shows are drawn.' }),
        info.link ? el('a', { class: 'btn small', href: info.link.href, text: info.link.text }) : null].filter(Boolean));
    }

    /* ---------- pointer: orbit, zoom, tap to pick ---------- */
    const ptrs = new Map(); let down = null, pinch0 = 0, dist0 = 0, moved = 0;
    const cvs = renderer.domElement;
    view.addEventListener('pointerdown', e => {
      if (e.target !== cvs) return;
      cvs.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 1) { down = { x: e.clientX, y: e.clientY, t: performance.now() }; moved = 0; }
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); dist0 = st.distGoal; }
      view.classList.add('is-dragging');
    });
    view.addEventListener('pointermove', e => {
      const p = ptrs.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch0 > 0) { st.distGoal = clampDist(dist0 * pinch0 / d); st.dist = st.distGoal; }
        moved = 99; st.dirty = true; return;
      }
      moved += Math.abs(dx) + Math.abs(dy);
      if (e.shiftKey || e.buttons === 2 || e.buttons === 4) pan(dx, dy);
      else { st.yaw -= dx * 0.008; st.pitch = Math.max(-1.45, Math.min(1.45, st.pitch + dy * 0.006)); }
      st.dirty = true;
    });
    const up = e => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = 0;
      if (!ptrs.size) {
        view.classList.remove('is-dragging');
        if (down && moved < 6 && performance.now() - down.t < 500) pickAt(e.clientX, e.clientY);
        down = null;
      }
    };
    view.addEventListener('pointerup', up); view.addEventListener('pointercancel', up);
    view.addEventListener('contextmenu', e => e.preventDefault());
    view.addEventListener('wheel', e => {
      e.preventDefault();
      st.distGoal = clampDist(st.distGoal * Math.exp(e.deltaY * 0.0012));
      st.dirty = true;
    }, { passive: false });
    view.addEventListener('dblclick', e => { if (e.target === cvs) home(); });
    view.addEventListener('keydown', e => {
      const k = e.key; let used = true;
      if (k === 'ArrowLeft') st.yaw += 0.12; else if (k === 'ArrowRight') st.yaw -= 0.12;
      else if (k === 'ArrowUp') st.pitch = Math.min(1.45, st.pitch + 0.1); else if (k === 'ArrowDown') st.pitch = Math.max(-1.45, st.pitch - 0.1);
      else if (k === '+' || k === '=') st.distGoal = clampDist(st.distGoal * 0.85); else if (k === '-') st.distGoal = clampDist(st.distGoal / 0.85);
      else if (k === '0') home(); else if (k === 'Escape') { setHot(null); partCard(null); } else used = false;
      if (used) { e.preventDefault(); st.dirty = true; }
    });
    function clampDist(d) { const h = st.home ? st.home.d : 50; return Math.max(h * 0.04, Math.min(h * 3, d)); }
    function pan(dx, dy) {
      const k = st.dist * Math.tan(T.MathUtils.degToRad(camera.fov / 2)) * 2 / st.size[1];
      const right = new T.Vector3().setFromMatrixColumn(camera.matrix, 0), upv = new T.Vector3().setFromMatrixColumn(camera.matrix, 1);
      st.targetGoal.addScaledVector(right, -dx * k).addScaledVector(upv, dy * k); st.target.copy(st.targetGoal);
    }
    function home() { st.yaw = 0.6; st.pitch = 0.18; frame(true); }
    reset.addEventListener('click', () => { home(); setHot(null); partCard(null); sep.value = '0'; st.sep = 0; applyOffsets(); });

    const ray = new T.Raycaster(), ndc = new T.Vector2(), invM = new T.Matrix4(), lray = new T.Ray(), hitP = new T.Vector3();
    function pickAt(cx, cy) {
      const r = cvs.getBoundingClientRect();
      ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      camera.updateMatrixWorld();
      ray.setFromCamera(ndc, camera);
      let best = null, bestD = Infinity;
      const tmpMesh = new T.Mesh(undefined, new T.MeshBasicMaterial({ side: T.DoubleSide }));
      const hits = [];
      st.insts.forEach(inst => {
        if (inst.shell && !st.shell) return;
        const g = st.meshes[inst.mesh];
        const o = g.aO.array, k = inst.k;
        const M = inst.matrix.clone().premultiply(new T.Matrix4().makeTranslation(o[k * 3], o[k * 3 + 1], o[k * 3 + 2]));
        const b = inst.box.clone().translate(new T.Vector3(o[k * 3], o[k * 3 + 1], o[k * 3 + 2]));
        if (!ray.ray.intersectsBox(b)) return;
        tmpMesh.geometry = g.pick; tmpMesh.matrixWorld.copy(M);
        hits.length = 0; tmpMesh.raycast(ray, hits);
        if (hits.length && hits[0].distance < bestD) { bestD = hits[0].distance; best = inst; }
      });
      if (!best) { setHot(null); partCard(null); return; }
      const p = st.parts[best.part];
      setHot({ kind: 'part', key: p.i });
      partCard(p);
    }

    /* ---------- render loop: draws only when something changed ---------- */
    function tick() {
      st.raf = requestAnimationFrame(tick);
      const k = 0.2;
      if (Math.abs(st.dist - st.distGoal) > 1e-3 * st.distGoal) { st.dist += (st.distGoal - st.dist) * k; st.dirty = true; }
      if (st.target.distanceToSquared(st.targetGoal) > 1e-6) { st.target.lerp(st.targetGoal, k); st.dirty = true; }
      if (!st.dirty || document.hidden) return;
      st.dirty = false;
      paint();
    }
    function paint() {
      const cp = Math.cos(st.pitch);
      camera.position.set(st.target.x + st.dist * cp * Math.sin(st.yaw), st.target.y + st.dist * Math.sin(st.pitch), st.target.z + st.dist * cp * Math.cos(st.yaw));
      camera.near = Math.max(0.05, st.dist * 0.02); camera.far = st.dist * 6 + 100; camera.updateProjectionMatrix();
      camera.lookAt(st.target);
      renderer.render(scene, camera);
    }

    tabs.addEventListener('click', e => { const b = e.target.closest('.bp-tab'); if (b && b.dataset.slug !== slug) show(b.dataset.slug); });
    tabs.addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const bs = [...tabs.querySelectorAll('.bp-tab')], i = bs.findIndex(b => b.dataset.slug === slug);
      const j = (i + (e.key === 'ArrowRight' ? 1 : bs.length - 1)) % bs.length;
      bs[j].focus(); show(bs[j].dataset.slug);
    });

    live = { view, destroy() { cancelAnimationFrame(st.raf); ro.disconnect(); clearCraft(); renderer.dispose(); renderer.forceContextLoss && renderer.forceContextLoss(); } };
    resize();
    show(slug);
    tick();
    // test hook (offline checks): set a camera view and draw now
    live.debug = { st, frame, paint, setView(yaw, pitch) { st.yaw = yaw; st.pitch = pitch; frame(false); paint(); }, setSep(v) { st.sep = v; sep.value = String(v); applyOffsets(); paint(); }, setShell(on) { st.shell = on; applyOffsets(); paint(); }, pick: (x, y) => { pickAt(x, y); return st.hot; } };
    window.KAST_BP_DEBUG = live.debug;
  }

  function unmount() { if (live) { live.destroy(); live = null; } }

  window.KAST_BP = { mount, unmount };
})();
