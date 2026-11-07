/* KAST Docs: renders flight plans, roadmaps and flight logs from the files in data/.
   Works straight from disk (file://): data files are plain scripts listed in data/manifest.js. */
(function () {
  'use strict';

  const KAST = window.KAST = {
    docs: [],
    logs: [],
    registerDoc(doc) { this.docs.push(doc); },
    setLogs(list) { this.logs = list || []; },
    telemetry: null,
    setTelemetry(t) { this.telemetry = t; },
    gallery: [],
    setGallery(g) { this.gallery = g || []; },
    load(files) {
      Promise.all(files.map(src => new Promise(done => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = done;
        s.onerror = () => { console.warn('KAST Docs: could not load ' + src); done(); };
        document.head.appendChild(s);
      }))).then(start);
    }
  };

  const app = document.getElementById('app');
  const nav = document.getElementById('nav');
  const navlinks = document.getElementById('navlinks');
  const drawer = document.getElementById('drawer');
  const drawerBody = document.getElementById('drawer-body');
  const scrim = document.getElementById('scrim');
  let current = null;      // { doc, steps[] } for the open document
  let openStep = null;

  /* ---------- helpers ---------- */
  function el(tag, attrs, kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'style') n.setAttribute('style', v);
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    (Array.isArray(kids) ? kids : kids != null ? [kids] : []).forEach(c => {
      if (c == null || c === false) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }
  // tiny inline format: **bold**, `code`; everything else escaped
  function fmt(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  }
  const P = (s, cls) => el('p', { class: cls, html: fmt(s) });
  const pad2 = n => String(n).padStart(2, '0');
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* storage off */ } }
  };
  function table(t) {
    const head = el('tr', null, t.head.map((h, i) => el('th', { class: t.num && t.num.includes(i) ? 'num' : null, text: h })));
    const rows = t.rows.map(r => el('tr', null, r.map((c, i) => el('td', { class: t.num && t.num.includes(i) ? 'num' : null, html: fmt(c) }))));
    return el('div', { class: 'table-wrap' }, el('table', null, [el('thead', null, head), el('tbody', null, rows)]));
  }
  function footer() {
    return el('footer', { class: 'footer' }, [
      el('span', { text: 'KAST, Horizon Space Center' }),
      el('span', { text: 'Files live in KAST_Docs. Add documents in data/docs and list them in data/manifest.js.' })
    ]);
  }
  function setPage(nodes, title) {
    app.replaceChildren(...nodes, footer());
    app.classList.remove('enter'); void app.offsetWidth; app.classList.add('enter');
    document.title = title ? title + ' | KAST' : 'KAST | Horizon Space Center';
    window.scrollTo(0, 0);
    app.focus({ preventScroll: true });
    markNav();
  }

  /* ---------- nav ---------- */
  function buildNav() {
    const links = KAST.docs.map(d => el('a', { href: '#/doc/' + d.id, 'data-key': 'doc/' + d.id, text: d.navTitle || d.title }));
    links.push(el('a', { href: '#/logs', 'data-key': 'logs', text: 'Flight logs' }));
    links.push(el('a', { href: '#/telemetry', 'data-key': 'telemetry', text: 'Booster telemetry' }));
    links.push(el('a', { href: '#/gallery', 'data-key': 'gallery', text: 'Gallery' }));
    navlinks.replaceChildren(...links);
  }
  function markNav() {
    const h = location.hash.replace(/^#\/?/, '').split('/');
    const key = h[0] === 'log' ? 'logs' : h[0] === 'telemetry' ? 'telemetry' : h[0] === 'gallery' ? 'gallery' : h.slice(0, 2).join('/');
    navlinks.querySelectorAll('a').forEach(a => {
      if (a.dataset.key === key) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }
  window.addEventListener('scroll', () => nav.classList.toggle('solid', window.scrollY > 40), { passive: true });

  /* ---------- home ---------- */
  function renderHome() {
    current = null;
    const panel = (o, i) => el('section', { class: 'panel' + (i % 2 ? ' right' : ''), style: `background-image:url('${o.img}')` },
      el('div', { class: 'panel-inner' }, [
        el('p', { class: 'kicker', text: o.kicker }),
        el('h2', { class: 'display panel-title', text: o.title }),
        P(o.text, 'lead'),
        el('div', { class: 'btn-row' }, el('a', { class: 'btn', href: o.href, text: o.cta }))
      ]));
    const hero = el('section', { class: 'hero home' },
      el('div', { class: 'hero-inner' }, [
        el('p', { class: 'kicker', text: 'Horizon Space Center' }),
        el('h1', { text: 'Building Horizon Station' }),
        P('Flight plans, the station roadmap, and the record of every Kestrel flight and booster landing.', 'lead'),
        el('div', { class: 'btn-row' }, [
          el('a', { class: 'btn', href: '#/doc/horizon-junction-kestrel', text: 'Current mission' }),
          el('a', { class: 'btn gold', href: '#/telemetry', text: 'Booster landings' })
        ])
      ]));
    const items = [];
    KAST.docs.forEach(d => items.push({ img: d.hero || 'assets/hero-orbit.jpg', kicker: d.kind + (d.status ? ', ' + d.status.toLowerCase() : ''), title: d.title, text: d.subtitle, href: '#/doc/' + d.id, cta: d.cta || 'Open' }));
    const runs = (KAST.telemetry && KAST.telemetry.runs) || [];
    const landed = runs.map(r => r.miss_final).filter(m => typeof m === 'number' && m < 2000);
    items.push({ img: 'assets/photo-boostback.jpg', kicker: 'Booster telemetry', title: 'First stage return',
      text: runs.length ? runs.length + ' booster runs logged' + (landed.length ? ', closest touchdown ' + Math.min(...landed) + ' m from the pad.' : '.') + ' Every flip, boostback, glide and landing burn, charted.' : 'Every flip, boostback, glide and landing burn, charted.',
      href: '#/telemetry', cta: 'Booster telemetry' });
    items.push({ img: 'assets/photo-ascent.jpg', kicker: 'Flight logs', title: KAST.logs.length ? KAST.logs.length + (KAST.logs.length === 1 ? ' flight' : ' flights') + ' on record' : 'No flights yet',
      text: 'Each Kestrel flight writes its own log: the event timeline and the trajectory, charted.', href: '#/logs', cta: 'View flight logs' });
    // hand-cropped, HUD-free versions of the best gallery shots (assets/strip/)
    const homeShots = [
      { thumb: 'assets/strip/strip-1-f9rcs.jpg', caption: 'Booster with Falcon 9 RCS units descending toward KSC' },
      { thumb: 'assets/strip/strip-2-glide.jpg', caption: 'Engines-first glide over the KSC peninsula' },
      { thumb: 'assets/strip/strip-3-first-landing.jpg', caption: 'First Kestrel landing, upright at KSC' },
      { thumb: 'assets/strip/strip-4-interstage-vab.jpg', caption: 'Interstage, grid fins and control packs in the VAB' }
    ];
    const strip = homeShots.length ? el('section', { class: 'strip-wrap' }, [
      el('div', { class: 'strip' }, homeShots.map(g => el('a', { class: 'strip-shot', href: '#/gallery', title: g.caption },
        el('img', { src: g.thumb, alt: g.caption, loading: 'lazy' })))),
      el('div', { class: 'strip-foot' }, [P('Screenshots from the flight deck: launches, boostbacks and landings.', 'lead'),
        el('a', { class: 'btn', href: '#/gallery', text: 'Open the gallery' })])
    ]) : null;
    const nodes = [hero];
    items.forEach((o, i) => { nodes.push(panel(o, i)); if (i === items.length - 2 && strip) nodes.push(strip); });
    setPage(nodes);
  }


  /* ---------- document (flight plan or roadmap) ---------- */
  function renderDoc(id, stepId) {
    const doc = KAST.docs.find(d => d.id === id);
    if (!doc) return renderMissing('That document is not in data/manifest.js.');
    const steps = [];
    let n = 0;
    doc.lanes.forEach(lane => lane.steps.forEach(s => {
      steps.push({ ...s, lane, num: lane.numbered === false ? null : (lane.prefix || '') + pad2(lane.prefix ? lane.steps.indexOf(s) + 1 : ++n) });
    }));
    current = { doc, steps };
    const cols = Math.max(...doc.lanes.map(l => l.steps.length));

    const hero = el('section', { class: 'hero short', style: `background-image:url('${doc.hero || 'assets/hero-orbit.jpg'}')` },
      el('div', { class: 'hero-inner' }, [
        el('p', { class: 'kicker', text: doc.kind + (doc.vehicle ? ', ' + doc.vehicle : '') }),
        el('h1', { text: doc.title }),
        P(doc.subtitle, 'lead')
      ]));
    const facts = doc.facts && el('dl', { class: 'facts' }, doc.facts.map(f => el('div', { class: 'fact' }, [el('dt', { text: f[0] }), el('dd', { html: fmt(f[1]) })])));

    const nodes = [hero, facts];
    if (doc.goals) nodes.push(el('section', { class: 'section' }, [
      el('div', { class: 'section-head' }, el('div', null, [el('h2', { text: doc.goalsTitle || 'Mission objectives' }), doc.overview && P(doc.overview)])),
      el('ol', { class: 'goals' }, doc.goals.map(g => el('li', { html: fmt(g) })))
    ]));

    // the chart
    const progress = doc.checklist ? el('div', { class: 'progress', id: 'progress' }) : null;
    const lanes = doc.lanes.map(lane => el('section', { class: 'lane', style: `--lane:${lane.color || 'var(--sky)'}` }, [
      el('div', { class: 'lane-head' }, [el('h3', { text: lane.name }), lane.note && P(lane.note)]),
      el('ol', { class: 'stations' + (lane.dashed ? ' dashed' : ''), style: `--n:${lane.steps.length}` },
        lane.steps.map(s => {
          const st = steps.find(x => x.id === s.id);
          return el('li', null, el('button', {
            class: 'station' + (s.status ? ' s-' + s.status : ''), 'data-step': s.id, type: 'button',
            'aria-label': (st.num ? 'Step ' + st.num + ': ' : '') + s.title,
            onclick: () => openDrawer(s.id)
          }, [
            el('span', { class: 'dot' }),
            st.num && el('span', { class: 'st-num', text: st.num }),
            el('span', { class: 'st-title', text: s.title }),
            s.time && el('span', { class: 'st-meta', text: s.time })
          ]));
        }))
    ]));
    const legend = doc.legend && el('div', { class: 'legend' }, doc.legend.map(l => el('span', null, [el('i', { class: l[0] }), l[1]])));
    nodes.push(el('section', { class: 'section' }, [
      el('div', { class: 'section-head' }, [
        el('div', null, [el('h2', { text: doc.chartTitle || 'Mission timeline' }), P(doc.chartNote || 'Select any step for everything you need to fly it.')]),
        progress
      ]),
      el('div', { class: 'chart', style: `--cols:${cols}` }, el('div', { class: 'chart-inner' }, lanes)),
      legend
    ]));

    (doc.sections || []).forEach(sec => {
      const body = [];
      if (sec.text) [].concat(sec.text).forEach(t => body.push(P(t)));
      if (sec.list) body.push(el('ul', null, sec.list.map(i => el('li', { html: fmt(i) }))));
      if (sec.table) body.push(table(sec.table));
      nodes.push(el('section', { class: 'section' }, [
        el('div', { class: 'section-head' }, el('div', null, [el('h2', { text: sec.title }), sec.note && P(sec.note)])),
        el('div', { class: sec.table ? '' : 'prose' }, body)
      ]));
    });

    setPage(nodes, doc.title);
    refreshDone();
    if (stepId) openDrawer(stepId, true);
  }

  const doneKey = (doc, step) => 'kast:' + doc.id + ':' + step;
  function refreshDone() {
    if (!current || !current.doc.checklist) return;
    let done = 0;
    current.steps.forEach(s => {
      const on = store.get(doneKey(current.doc, s.id)) === '1';
      if (on) done++;
      const b = app.querySelector(`[data-step="${s.id}"]`);
      if (b) b.classList.toggle('is-done', on);
    });
    const p = document.getElementById('progress');
    if (p) p.replaceChildren(
      el('span', { text: done + ' of ' + current.steps.length + ' steps complete' }),
      el('div', { class: 'progress-bar' }, el('span', { style: `width:${100 * done / current.steps.length}%` })),
      el('button', { class: 'btn small', type: 'button', text: 'Reset', onclick: () => {
        current.steps.forEach(s => store.set(doneKey(current.doc, s.id), null)); refreshDone();
      } })
    );
  }

  /* ---------- drawer ---------- */
  function openDrawer(stepId, initial) {
    if (!current) return;
    const i = current.steps.findIndex(s => s.id === stepId);
    if (i < 0) return;
    const s = current.steps[i], doc = current.doc;
    openStep = stepId;
    app.querySelectorAll('.station.is-open').forEach(b => b.classList.remove('is-open'));
    const btn = app.querySelector(`[data-step="${stepId}"]`);
    if (btn) btn.classList.add('is-open');

    const body = [
      el('p', { class: 'kicker', style: `color:${s.lane.color || 'var(--gold)'}`, text: s.lane.name + (s.num ? ', step ' + s.num : '') }),
      el('h2', { id: 'drawer-title', text: s.title }),
      (s.time || s.meta) && el('div', { class: 'drawer-meta' }, [
        s.time && el('span', { html: '<b>' + fmt(s.time) + '</b>' }),
        s.meta && el('span', { html: fmt(s.meta) }),
        s.status && el('span', { class: 'badge ' + ({ done: 'good', next: 'warn' }[s.status] || ''), text: { done: 'Complete', next: 'Next up', planned: 'Planned' }[s.status] || s.status })
      ]),
      s.lead && P(s.lead, 'lead')
    ];
    if (s.actions) body.push(el('h4', { text: s.actionsTitle || 'Do this' }), el('ol', null, s.actions.map(a => el('li', { html: fmt(a) }))));
    if (s.table) body.push(el('h4', { text: s.table.title || 'Reference' }), table(s.table));
    if (s.values) body.push(el('h4', { text: s.valuesTitle || 'Numbers' }), el('dl', { class: 'values' }, s.values.flatMap(v => [el('dt', { text: v[0] }), el('dd', { html: fmt(v[1]) })])));
    if (s.watch) body.push(el('h4', { text: 'Watch for' }), el('ul', { class: 'watch' }, s.watch.map(w => el('li', { html: fmt(w) }))));
    if (s.notes) body.push(el('h4', { text: 'Notes' }), ...[].concat(s.notes).map(t => P(t)));
    drawerBody.replaceChildren(...body);
    drawerBody.scrollTop = 0;

    const prev = current.steps[i - 1], next = current.steps[i + 1];
    const foot = el('div', { class: 'drawer-foot' }, [
      doc.checklist ? el('label', { class: 'check' }, [
        el('input', { type: 'checkbox', checked: store.get(doneKey(doc, s.id)) === '1', onchange: e => { store.set(doneKey(doc, s.id), e.target.checked ? '1' : null); refreshDone(); } }),
        'Step complete'
      ]) : el('span'),
      el('div', { class: 'pager' }, [
        el('button', { class: 'btn small', type: 'button', disabled: !prev, text: 'Previous', onclick: () => prev && openDrawer(prev.id) }),
        el('button', { class: 'btn small', type: 'button', disabled: !next, text: 'Next', onclick: () => next && openDrawer(next.id) })
      ])
    ]);
    const oldFoot = drawer.querySelector('.drawer-foot');
    if (oldFoot) oldFoot.remove();
    drawer.appendChild(foot);

    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    scrim.hidden = false;
    history.replaceState(null, '', '#/doc/' + doc.id + '/' + s.id);
    document.getElementById('drawer-close').focus({ preventScroll: true });
  }
  function closeDrawer(updateHash) {
    if (!drawer.classList.contains('open')) return;
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    scrim.hidden = true;
    app.querySelectorAll('.station.is-open').forEach(b => b.classList.remove('is-open'));
    const back = openStep && app.querySelector(`[data-step="${openStep}"]`);
    openStep = null;
    if (updateHash !== false && current) history.replaceState(null, '', '#/doc/' + current.doc.id);
    if (back) back.focus({ preventScroll: true });
  }
  document.getElementById('drawer-close').addEventListener('click', () => closeDrawer());
  scrim.addEventListener('click', () => closeDrawer());
  document.addEventListener('keydown', e => {
    if (!drawer.classList.contains('open')) return;
    if (e.key === 'Escape') closeDrawer();
    if (e.target.tagName === 'INPUT') return;
    const i = current ? current.steps.findIndex(s => s.id === openStep) : -1;
    if (e.key === 'ArrowRight' && current.steps[i + 1]) openDrawer(current.steps[i + 1].id);
    if (e.key === 'ArrowLeft' && current.steps[i - 1]) openDrawer(current.steps[i - 1].id);
  });

  /* ---------- flight logs ---------- */
  const OUTCOME = { success: 'good', partial: 'warn', failure: 'bad' };
  function km(m) { return m == null ? '–' : (m / 1000).toFixed(1); }
  function clock(t) {
    if (t == null) return '–';
    const s = Math.round(t), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
    return 'T+' + (h ? h + ':' + pad2(m) : m) + ':' + pad2(s % 60);
  }

  function renderLogs() {
    current = null;
    const logs = KAST.logs.slice().sort((a, b) => b.number - a.number);
    const hero = el('section', { class: 'hero short', style: "background-image:url('assets/hero-pad.jpg')" },
      el('div', { class: 'hero-inner' }, [
        el('p', { class: 'kicker', text: 'Flight logs' }),
        el('h1', { text: 'Flight record' }),
        P('One entry per flight: what happened and when, and the trajectory the flight computers recorded.', 'lead')
      ]));
    const body = logs.length
      ? table({
        head: ['Flight', 'Date', 'Mission', 'Vehicle', 'Outcome', 'Max altitude (km)', 'Final orbit (km)'],
        rows: [], num: [0, 5, 6]
      })
      : el('div', { class: 'empty', html: fmt('No flights logged yet. Each Kestrel flight writes `Ships/Script/logs/flights/<flight>_ascent.csv`; Management runs `KAST_Docs/tools/build_logs.py` in the debrief and the flight appears here.') });
    if (logs.length) {
      const tb = body.querySelector('tbody');
      logs.forEach(l => {
        const s = l.summary || {};
        tb.appendChild(el('tr', { class: 'link', tabindex: '0', onclick: () => { location.hash = '#/log/' + l.fid; }, onkeydown: e => { if (e.key === 'Enter') location.hash = '#/log/' + l.fid; } }, [
          el('td', { class: 'num', text: pad2(l.number) }),
          el('td', { class: 'num', text: l.date || '–' }),
          el('td', { text: l.mission || '–' }),
          el('td', { text: l.vehicle || '–' }),
          el('td', null, el('span', { class: 'badge ' + (OUTCOME[l.result] || ''), text: l.outcome || 'Not reviewed' })),
          el('td', { class: 'num', text: km(s.max_alt) }),
          el('td', { class: 'num', text: s.final_pe != null ? km(s.final_pe) + ' x ' + km(s.final_ap) : '–' })
        ]));
      });
    }
    setPage([hero, el('section', { class: 'section' }, [
      el('div', { class: 'section-head' }, el('div', null, [el('h2', { text: 'All flights' }), P('Newest first. Select a flight for its log and trajectory.')])),
      body
    ])], 'Flight logs');
  }

  function renderLog(fid) {
    current = null;
    const l = KAST.logs.find(x => x.fid === fid);
    if (!l) return renderMissing('No flight with that id in data/logs.js.');
    const s = l.summary || {};
    const hero = el('section', { class: 'hero short', style: "background-image:url('assets/hero-orbit.jpg')" },
      el('div', { class: 'hero-inner' }, [
        el('p', { class: 'kicker', text: 'Flight ' + pad2(l.number) + (l.date ? ', ' + l.date : '') }),
        el('h1', { text: l.mission || 'Flight ' + l.number }),
        P((l.vehicle ? l.vehicle + '. ' : '') + (l.outcome || ''), 'lead')
      ]));
    const stat = (k, v, unit) => el('div', { class: 'stat' }, [el('dt', { text: k }), el('dd', null, [v, unit && el('small', { text: unit })])]);
    const stats = el('dl', { class: 'stats' }, [
      stat('Max altitude', km(s.max_alt), 'km'),
      stat('Stage separation', s.sep ? clock(s.sep.t) : '–', s.sep ? km(s.sep.alt) + ' km, ' + Math.round(s.sep.v) + ' m/s' : ''),
      stat('Second stage cutoff', s.seco ? clock(s.seco.t) : '–'),
      stat('Final orbit', s.final_pe != null ? km(s.final_pe) + ' x ' + km(s.final_ap) : '–', s.final_pe != null ? 'km' : ''),
      stat('Booster', l.booster ? (l.booster.result || 'Logged') : 'No data')
    ]);

    const nodes = [hero, el('section', { class: 'section' }, [
      el('div', { class: 'section-head' }, el('div', null, [el('h2', { text: 'Flight summary' }), l.notes && P(l.notes)])),
      stats
    ])];

    if (l.events && l.events.length) nodes.push(el('section', { class: 'section' }, [
      el('div', { class: 'section-head' }, el('div', null, [el('h2', { text: 'Flight log' }), P('Events in order, as the flight computers saw them.')])),
      table({
        head: ['Time', 'Vehicle', 'Event', 'Altitude (km)', 'Speed (m/s)'],
        rows: l.events.map(e => [clock(e.t), e.src === 'booster' ? 'First stage' : 'Second stage', e.label, km(e.alt), e.v != null ? String(Math.round(e.v)) : '–']),
        num: [0, 3, 4]
      })
    ]));

    const charts = el('div', { class: 'charts' });
    const A = l.ascent;
    if (A && A.t && A.t.length) {
      charts.appendChild(card('Altitude and apoapsis', 'Climb profile of the second stage, from liftoff.', c => KASTCharts.line(c, {
        x: A.t, xLabel: 's', yLabel: 'km', bands: A.bands,
        series: [{ name: 'Altitude', y: A.alt.map(v => v / 1000), color: 'var(--sky)' },
                 { name: 'Apoapsis', y: A.ap.map(v => v / 1000), color: 'var(--gold)', dash: true }],
        yMin: 0, clipMin: 0
      })));
      charts.appendChild(card('Surface speed', 'Speed relative to the ground.', c => KASTCharts.line(c, {
        x: A.t, xLabel: 's', yLabel: 'm/s', bands: A.bands,
        series: [{ name: 'Speed', y: A.v, color: 'var(--sky)' }], yMin: 0
      })));
      if (A.pitch) charts.appendChild(card('Pitch program', 'Commanded pitch above the horizon.', c => KASTCharts.line(c, {
        x: A.t, xLabel: 's', yLabel: 'deg', bands: A.bands,
        series: [{ name: 'Pitch', y: A.pitch, color: 'var(--gold)' }], yMin: 0, yMax: 90
      })));
    }
    const B = l.booster;
    if (B && B.t && B.t.length) {
      charts.appendChild(card('First stage return', (B.landed || 'Booster altitude after separation.'), c => KASTCharts.line(c, {
        x: B.t, xLabel: 's', yLabel: 'km', bands: B.bands,
        series: [{ name: 'Altitude', y: B.alt.map(v => v / 1000), color: 'var(--sky)' }], yMin: 0
      })));
    }
    const tracks = [];
    if (A && A.lat) tracks.push({ name: 'Second stage', lat: A.lat, lng: A.lng, color: 'var(--gold)' });
    if (B && B.lat) tracks.push({ name: 'First stage', lat: B.lat, lng: B.lng, color: 'var(--sky)' });
    if (tracks.length) charts.appendChild(card('Ground track', 'Latitude and longitude under the vehicle. The marker is the KSC pad.', c => KASTCharts.track(c, { tracks, pad: [-0.0972, -74.5577] })));
    if (charts.children.length) nodes.push(el('section', { class: 'section' }, [
      el('div', { class: 'section-head' }, el('div', null, [el('h2', { text: 'Trajectory log' }), P('Hover a chart to read exact values. Shaded bands are flight phases.')])),
      charts
    ]));
    setPage(nodes, 'Flight ' + l.number);
  }
  function card(title, note, draw) {
    const host = el('div');
    const c = el('div', { class: 'chart-card' }, [el('h3', { text: title }), P(note), host]);
    requestAnimationFrame(() => draw(host));
    return c;
  }

  function renderMissing(msg) {
    current = null;
    setPage([el('section', { class: 'hero short' }, el('div', { class: 'hero-inner' }, [
      el('p', { class: 'kicker', text: 'Not found' }), el('h1', { text: 'Nothing here' }), P(msg, 'lead'),
      el('div', { class: 'btn-row' }, el('a', { class: 'btn', href: '#/', text: 'Back to home' }))
    ]))]);
  }


  /* ---------- booster telemetry ---------- */
  function renderTelemetry(id) {
    current = null;
    const T = KAST.telemetry, runs = (T && T.runs) || [];
    const hero = el('section', { class: 'hero short', style: "background-image:url('assets/hero-pad.jpg')" },
      el('div', { class: 'hero-inner' }, [
        el('p', { class: 'kicker', text: 'Booster telemetry' }),
        el('h1', { text: 'First stage return' }),
        P('Every Kestrel booster run, practice and real: where it was heading, where it went, and the fuel each phase used.' + (T && T.built ? ' Updated ' + T.built + '.' : ''), 'lead'),
        el('div', { class: 'btn-row' }, el('a', { class: 'btn', href: 'data/trajlog.txt', target: '_blank', text: 'Open trajlog.txt' }))
      ]));
    if (!runs.length) return setPage([hero, el('section', { class: 'section' }, el('div', { class: 'empty', text: 'No booster runs logged yet.' }))], 'Booster telemetry');
    const run = runs.find(r => r.id === id) || runs[runs.length - 1];
    const list = table({ head: ['Run', 'Source', 'Result'], rows: [] });
    const tb = list.querySelector('tbody');
    runs.slice().reverse().forEach(r => tb.appendChild(el('tr', {
      class: 'link' + (r.id === run.id ? ' sel' : ''), tabindex: '0',
      onclick: () => { location.hash = '#/telemetry/' + r.id; },
      onkeydown: e => { if (e.key === 'Enter') location.hash = '#/telemetry/' + r.id; }
    }, [el('td', { text: (r.id === run.id ? '▸ ' : '') + r.label }), el('td', { text: r.source }), el('td', { text: r.result || '–' })])));

    const stat = (k, v, unit) => el('div', { class: 'stat' }, [el('dt', { text: k }), el('dd', null, [v, unit && el('small', { text: unit })])]);
    const fuelStart = run.fuel && run.fuel.length ? run.fuel[0].start : null, fuelEnd = run.fuel && run.fuel.length ? run.fuel[run.fuel.length - 1].end : null;
    const sgn = m => m == null ? '–' : (m >= 0 ? '+' : '−') + km(Math.abs(m));
    const stats = el('dl', { class: 'stats' }, [
      stat('Fuel at separation', fuelStart != null ? String(fuelStart) : '–', 'LF'),
      stat('Fuel at end of log', fuelEnd != null ? String(fuelEnd) : '–', 'LF'),
      stat('Predicted impact, start of glide', sgn(run.glide_in), 'km'),
      stat('Predicted impact, end of glide', sgn(run.glide_out), 'km'),
      stat('Final distance from pad', run.miss_final != null ? km(run.miss_final) : '–', 'km')
    ]);
    const fuel = table({ head: ['Phase', 'Fuel at start', 'Fuel at end', 'Used'], num: [1, 2, 3],
      rows: (run.fuel || []).map(f => [f.phase, String(f.start), String(f.end), String(Math.round((f.start || 0) - (f.end || 0)))]) });

    const charts = el('div', { class: 'charts' });
    const X = run.t;
    if (run.ip_dr) charts.appendChild(card('Predicted landing point', 'Where Trajectories says the booster will come down, measured from the pad along the east-west line. Above zero: past the pad (west). Below zero: short (east, over the sea). The goal is to finish on the zero line.', c => KASTCharts.line(c, {
      x: X, xLabel: 's', yLabel: 'km', bands: run.bands,
      series: [{ name: 'Predicted impact', y: run.ip_dr.map(v => v == null ? null : v / 1000), color: 'var(--gold)' },
               { name: 'Pad', y: X.map(() => 0), color: 'var(--ink)', dash: true }]
    })));
    if (run.pos_dist) charts.appendChild(card('Distance from the pad', 'Straight-line ground distance between the booster and the pad.', c => KASTCharts.line(c, {
      x: X, xLabel: 's', yLabel: 'km', bands: run.bands, yMin: 0,
      series: [{ name: 'Distance', y: run.pos_dist.map(v => v / 1000), color: 'var(--sky)' }]
    })));
    charts.appendChild(card('Altitude', 'Booster altitude above sea level.', c => KASTCharts.line(c, {
      x: X, xLabel: 's', yLabel: 'km', bands: run.bands, yMin: 0,
      series: [{ name: 'Altitude', y: run.alt.map(v => v / 1000), color: 'var(--sky)' }]
    })));
    charts.appendChild(card('Speed', 'Vertical speed (negative is falling) and ground speed.', c => KASTCharts.line(c, {
      x: X, xLabel: 's', yLabel: 'm/s', bands: run.bands,
      series: [{ name: 'Vertical', y: run.vs, color: 'var(--sky)' }, { name: 'Ground', y: run.gs, color: 'var(--gold)', dash: true }]
    })));
    if (run.lf) charts.appendChild(card('Fuel', 'Liquid fuel left in the booster tank.', c => KASTCharts.line(c, {
      x: X, xLabel: 's', yLabel: 'LF', bands: run.bands, yMin: 0,
      series: [{ name: 'Liquid fuel', y: run.lf, color: 'var(--gold)' }]
    })));
    const tracks = [];
    if (run.lat) tracks.push({ name: 'Booster', lat: run.lat, lng: run.lng, color: 'var(--sky)' });
    if (run.ip_lat) tracks.push({ name: 'Predicted impact', lat: run.ip_lat.map((v, i) => (v || run.ip_lng[i]) ? v : null), lng: run.ip_lng.map((v, i) => (v || run.ip_lat[i]) ? v : null), color: 'var(--gold)' });
    if (tracks.length) charts.appendChild(card('Ground track', 'Where the booster flew, and how the predicted landing point moved. The marker is the KSC pad.', c => KASTCharts.track(c, { tracks, pad: T.pad || [-0.0972, -74.5577] })));

    const nodes = [hero,
      el('section', { class: 'section' }, [el('div', { class: 'section-head' }, el('div', null, [el('h2', { text: 'Runs' }), P('Newest first. Select a run to see its telemetry.')])), list]),
      el('section', { class: 'section' }, [el('div', { class: 'section-head' }, el('div', null, [el('h2', { text: run.label }), P(run.note || run.result || '')])), stats]),
      el('section', { class: 'section' }, [el('div', { class: 'section-head' }, el('div', null, [el('h2', { text: 'Trajectory' }), P('Hover a chart to read exact values. Shaded bands are flight phases.')])), charts]),
      el('section', { class: 'section' }, [el('div', { class: 'section-head' }, el('div', null, [el('h2', { text: 'Fuel by phase' })])), fuel])
    ];
    setPage(nodes, 'Booster telemetry');
  }


  /* ---------- gallery ---------- */
  function renderGallery() {
    current = null;
    const items = (KAST.gallery || []).slice().reverse();
    const hero = el('section', { class: 'hero short', style: "background-image:url('assets/hero-sunset.jpg')" },
      el('div', { class: 'hero-inner' }, [
        el('p', { class: 'kicker', text: 'Gallery' }),
        el('h1', { text: 'From the flight deck' }),
        P('Screenshots from KAST flights and tests, newest first. Select one to see it full size.', 'lead')
      ]));
    const grid = el('div', { class: 'gallery' }, items.map(g => el('figure', { class: 'shot' }, [
      el('a', { href: g.src, target: '_blank', rel: 'noopener' }, el('img', { src: g.thumb, alt: g.caption, loading: 'lazy' })),
      el('figcaption', null, [el('span', { class: 'kicker', text: g.tag + ' · ' + g.when }), P(g.caption)])
    ])));
    setPage([hero, el('section', { class: 'section' }, items.length ? grid : el('div', { class: 'empty', text: 'No screenshots yet.' }))], 'Gallery');
  }

  /* ---------- router ---------- */
  function route() {
    closeDrawer(false);
    const h = location.hash.replace(/^#\/?/, '').split('/');
    if (h[0] === 'doc' && h[1]) renderDoc(h[1], h[2]);
    else if (h[0] === 'logs') renderLogs();
    else if (h[0] === 'log' && h[1]) renderLog(h[1]);
    else if (h[0] === 'telemetry') renderTelemetry(h[1]);
    else if (h[0] === 'gallery') renderGallery();
    else renderHome();
  }
  function start() {
    KAST.docs.sort((a, b) => (a.order || 99) - (b.order || 99));
    buildNav();
    window.addEventListener('hashchange', route);
    route();
  }
})();
