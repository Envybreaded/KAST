/* KAST Docs: the LV-5 Kestrel in 3D.
   Built from the real craft's part positions (KSP metres, from "KAST Horizon Junction on Kestrel").
   Parts: pull the rocket apart and read what each part does. How it flies: the flight step by step,
   from the pad to the booster landing back on it (RTLS).
   Needs js/vendor/three.min.js (three.js r149, MIT licence). */
(function () {
  'use strict';
  const D2R = Math.PI / 180;
  const BP = 12.5;   // booster pivot (roughly its centre of mass)
  const UP = 26;     // upper stack pivot
  const GOLD = 0xC9A24B;

  /* ---------- content ---------- */
  // display order: top to bottom. ex = how far the part rises when the rocket is pulled apart (m).
  const PARTS = [
    { id: 'payload', name: 'Horizon Junction', ex: 9.9, cy: 30.6,
      sub: 'Payload: MOL equipment section, station hub, six MOS-DM 1.875 m docking ports',
      text: 'The current payload. A station hub with six docking ports, its own RCS and 300 units of monopropellant. It docks to Node 1 through Node 1’s aft MOS-DM port.',
      values: [['Docking ports', '6 × MOS-DM 1.875 m'], ['RCS', '8 RX-55 blocks'], ['Monopropellant', '300']] },
    { id: 'avU', name: 'Upper-stage computer', ex: 9.0, cy: 28.1,
      sub: 'kOS computer, hexagonal probe core, batteries, decoupler',
      text: 'The kOS computer here runs the whole launch: it finds the window, flies the gravity turn, stages, circularizes and flies the rendezvous. The decoupler above it releases the payload.',
      values: [['Computer', 'kOS, tag kl_s2_cpu'], ['Script', 'kestrel_ascent.ks']] },
    { id: 's2', name: 'Second stage', ex: 8.0, cy: 25.8,
      sub: 'F9 Demo S2 Fuel Tank and S2 RCS section',
      text: 'Propellant for orbit insertion and the rendezvous burns, plus four RX-55 RCS blocks for the fine work of the final approach.',
      values: [['Liquid fuel', '1,440'], ['Oxidizer', '1,760'], ['Monopropellant', '40'], ['RCS', '4 RX-55 blocks']] },
    { id: 'mvac', name: 'Upper-stage engine', ex: 7.0, cy: 22.7,
      sub: 'F9 Demo Vacuum engine',
      text: 'Rides inside the interstage until separation. It throttles down to almost nothing, so the same engine flies orbit insertion and the small rendezvous burns.',
      values: [['Thrust', '350 kN'], ['Isp', '335 s vacuum'], ['Restarts', 'Unlimited']] },
    { id: 'interstage', name: 'Interstage', ex: 3.0, cy: 22.3,
      sub: 'F9 Demo Interstage, four Falcon grid fins, four Falcon 9 RCS packs',
      text: 'The black shroud between the stages. It covers the upper-stage engine on the way up and stays with the booster. The grid fins unfold for the trip home and steer it through the air.',
      values: [['Grid fins', '4'], ['RCS packs', '4']] },
    { id: 'avB', name: 'Booster computer', ex: 1.2, cy: 20.5,
      sub: 'kOS computer, octagonal probe core, reaction wheel, four RCS tanks',
      text: 'Inside the top of the booster. Its kOS computer flies the booster home: flip, boostback, entry burn, glide and landing. The reaction wheel turns it during the flip; the tanks feed the RCS packs.',
      values: [['Computer', 'kOS, tag kl_booster_cpu'], ['Script', 'kestrel_booster.ks'], ['RCS tanks', '4 × 20 monopropellant']] },
    { id: 's1', name: 'First-stage tank', ex: 0, cy: 13.2,
      sub: 'F9 Demo S1 Fuel Tank',
      text: 'The booster’s propellant. The engines cut off with 30 percent still in the tank: that reserve is what flies the booster back to the pad.',
      values: [['Liquid fuel', '6,480'], ['Oxidizer', '7,920'], ['Kept for the return', '30 percent']] },
    { id: 'legs', name: 'Landing legs', ex: 0, cy: 8.5,
      sub: 'F9 Demo landing leg × 4',
      text: 'Folded flat against the tank for the climb. The booster lowers them below 1,500 m on the way down.',
      values: [['Legs', '4'], ['Deploy', 'below 1,500 m']] },
    { id: 'engines', name: 'Main engines', ex: -1.6, cy: 2.6,
      sub: 'F9 Demo Main Engine × 9 on the F9 Demo Main Engine Base',
      text: 'Nine engines in a three-by-three grid. All nine fly the climb; the centre engine and one pair fly every burn on the way home.',
      values: [['Thrust', '230 kN each, 2,070 kN total'], ['Isp', '260 s sea level, 315 s vacuum'], ['Return burns', '3 engines']] }
  ];
  const BOOSTER = ['engines', 'legs', 's1', 'avB', 'interstage'];
  const PARTS_STATE = { veh: 0, sep: 0, brot: 0, by: 0, flame: 0, mvac: 0, legs: 0, fins: 0, pad: 0, clamps: 0, upOp: 1, bOp: 1, focus: 'all' };

  // flight steps. veh: whole-rocket height; sep: upper stack above its seat; brot: booster pitch (deg);
  // by: booster height offset; flame: booster engines lit (0, 3 or 9); mvac: upper engine lit
  const STEPS = [
    { title: 'On the pad', veh: 0, sep: 0, brot: 0, by: 0, flame: 0, mvac: 0, legs: 0, fins: 0, pad: 1, clamps: 1, upOp: 1, bOp: 1, focus: 'all',
      text: 'Nine engines, 2,070 kN. With a target near the equator, the upper-stage computer times liftoff so the stage reaches the target’s altitude just as the target gets there.' },
    { title: 'Liftoff', veh: 7, sep: 0, brot: 0, by: 0, flame: 9, mvac: 0, legs: 0, fins: 0, pad: 1, clamps: 0, upOp: 1, bOp: 1, focus: 'all',
      text: 'All nine engines. The Kestrel climbs straight up, then pitches over in a lofted gravity turn so the booster separates high and slow.' },
    { title: 'Main engine cutoff', veh: 14, sep: 0, brot: 0, by: 0, flame: 0, mvac: 0, legs: 0, fins: 0, pad: 0, clamps: 0, upOp: 1, bOp: 1, focus: 'all',
      text: 'The engines shut down with 30 percent of the booster’s fuel still in the tank. That reserve flies it home.' },
    { title: 'Stage separation', veh: 14, sep: 7, brot: 0, by: 0, flame: 0, mvac: 1, legs: 0, fins: 0, pad: 0, clamps: 0, upOp: 1, bOp: 1, focus: 'all',
      text: 'The interstage lets go and the upper stage pushes clear on RCS before its engine lights. The booster holds still on its reaction wheel until the upper stage is 20 m away, so nothing swings into the engine bell.' },
    { title: 'Upper stage to the target', veh: 14, sep: 12, brot: 0, by: -6, flame: 0, mvac: 1, legs: 0, fins: 0, pad: 0, clamps: 0, upOp: 1, bOp: 0, focus: 'upper',
      text: 'Climbs to the target’s altitude and circularizes, then flies the rendezvous: an intercept burn, corrections, and a braking approach that stops 400 m from the target, standing still relative to it.' },
    { title: 'Flip', veh: 14, sep: 40, brot: 110, by: 0, flame: 0, mvac: 0, legs: 0, fins: 1, pad: 0, clamps: 0, upOp: 0, bOp: 1, focus: 'booster',
      text: 'Back on the booster. It turns toward KSC on its reaction wheel and RCS, with no engines, and the grid fins unfold.' },
    { title: 'Boostback', veh: 14, sep: 40, brot: 110, by: 0, flame: 3, mvac: 0, legs: 0, fins: 1, pad: 0, clamps: 0, upOp: 0, bOp: 1, focus: 'booster',
      text: 'Three engines burn until the predicted impact point is 1.5 km past the pad. The glide pulls back the rest.' },
    { title: 'Entry burn', veh: 14, sep: 40, brot: 0, by: 0, flame: 3, mvac: 0, legs: 0, fins: 1, pad: 0, clamps: 0, upOp: 0, bOp: 1, focus: 'booster',
      text: 'Falling engines-first below 32 km at over 650 m/s, three engines slow it to 480 m/s before the thick air.' },
    { title: 'Glide', veh: 14, sep: 40, brot: 7, by: 0, flame: 0, mvac: 0, legs: 0, fins: 1, pad: 0, clamps: 0, upOp: 0, bOp: 1, focus: 'booster',
      text: 'No engines. The grid fins lean the body so its lift carries it toward the pad.' },
    { title: 'Landing on the pad', veh: 0, sep: 40, brot: 0, by: 1.15, flame: 3, shutdown: true, mvac: 0, legs: 1, fins: 1, pad: 1, clamps: 0, upOp: 0, bOp: 1, focus: 'booster',
      text: 'The landing burn starts at the last safe moment and the legs come down below 1,500 m. For the last 60 m it holds about 40 m up, slides over the pad, then comes straight down. RTLS: return to launch site.' }
  ];

  /* ---------- small helpers ---------- */
  function el(tag, attrs, kids) {
    const n = document.createElement(tag);
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    (Array.isArray(kids) ? kids : kids != null ? [kids] : []).forEach(c => c != null && n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return n;
  }
  const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const lerp = (a, b, t) => a + (b - a) * t;

  let S = null;   // the mounted viewer

  /* ---------- model ---------- */
  function buildModel(T) {
    const groups = {};
    const pick = [];
    function group(id) {
      const g = new T.Group(); g.userData = { part: id, mats: [] }; groups[id] = g; return g;
    }
    function mat(g, color, rough, metal, side) {
      const m = new T.MeshStandardMaterial({ color, roughness: rough == null ? 0.55 : rough, metalness: metal || 0, side: side || T.FrontSide });
      g.userData.mats.push(m); return m;
    }
    function add(g, geo, m, x, y, z) {
      const mesh = new T.Mesh(geo, m); mesh.position.set(x || 0, y || 0, z || 0);
      let o = g; while (o && !(o.userData && o.userData.part)) o = o.parent;
      mesh.userData.part = o ? o.userData.part : null; g.add(mesh); pick.push(mesh); return mesh;
    }
    const cyl = (rt, rb, y0, y1, seg, open) => new T.CylinderGeometry(rt, rb, y1 - y0, seg || 48, 1, !!open);
    function addCyl(g, m, rt, rb, y0, y1, seg, open) { return add(g, cyl(rt, rb, y0, y1, seg, open), m, 0, (y0 + y1) / 2, 0); }
    function bell(g, m, yTop, yBot, rT, rE) {
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        pts.push(new T.Vector2(rT + (rE - rT) * Math.pow(t, 0.62), yTop - (yTop - yBot) * t));
      }
      return add(g, new T.LatheGeometry(pts, 40), m, 0, 0, 0);
    }
    // a radial mount: local +x points out at angle a (deg, as in the craft: atan2(z, x))
    function mount(parent, a) { const m = new T.Group(); m.rotation.y = -a * D2R; parent.add(m); return m; }
    function ring(g, m, r, y, h) { return addCyl(g, m, r, r, y - h / 2, y + h / 2, 64, true); }

    const R = 1.25;

    // engines: 3 x 3 grid, 0.75 m apart, on the engine base
    const ge = group('engines');
    const mEng = mat(ge, 0x3b3b3b, 0.45, 0.55, T.DoubleSide), mBase = mat(ge, 0x1d1d1d, 0.7), mShield = mat(ge, 0x2a2a2a, 0.8);
    const engPos = [];
    [-0.75, 0, 0.75].forEach(x => [-0.75, 0, 0.75].forEach(z => engPos.push([x, z])));
    engPos.forEach(([x, z]) => {
      const b = bell(ge, mEng, 3.35, 1.55, 0.12, 0.33); b.position.set(x, 0, z);
      add(ge, cyl(0.17, 0.2, 3.35, 3.75, 20), mEng, x, 3.55, z);
    });
    addCyl(ge, mShield, R, R, 3.62, 3.72, 64);
    addCyl(ge, mBase, R, R * 1.02, 3.72, 4.9, 64);

    // legs: hinge at the bottom of the tank, folded flat along it
    const gl = group('legs');
    const mLeg = mat(gl, 0x1f1f1f, 0.6), mFoot = mat(gl, 0x8a8a8a, 0.5, 0.3);
    const legs = [];
    [180, 90, 0, -90].forEach(a => {
      const mt = mount(gl, a);
      const hinge = new T.Group(); hinge.position.set(R + 0.02, 4.95, 0); mt.add(hinge);
      add(hinge, new T.BoxGeometry(0.16, 7, 0.34), mLeg, 0.08, 3.5, 0).userData.part = 'legs';
      add(hinge, new T.BoxGeometry(0.12, 6.4, 0.12), mFoot, 0.2, 3.3, 0).userData.part = 'legs';
      add(hinge, new T.CylinderGeometry(0.28, 0.32, 0.12, 20), mFoot, 0.12, 7.0, 0).userData.part = 'legs';
      hinge.children.forEach(c => { c.userData.part = 'legs'; });
      legs.push({ mount: mt, hinge });
    });

    // first-stage tank
    const g1 = group('s1');
    const mTank = mat(g1, 0xe9e8e4, 0.5), mSeam = mat(g1, 0xbdbcb7, 0.6), mRace = mat(g1, 0xd2d1cc, 0.6);
    addCyl(g1, mTank, R, R, 4.9, 20.0, 64);
    [7.4, 10.9, 14.4, 17.9].forEach(y => ring(g1, mSeam, R + 0.006, y, 0.04));
    const mtR = mount(g1, 200);
    add(mtR, new T.BoxGeometry(0.1, 14.4, 0.16), mRace, R + 0.04, 12.4, 0).userData.part = 's1';
    // KAST lettering, read bottom to top like the real thing
    const cv = document.createElement('canvas'); cv.width = 160; cv.height = 1400;
    const cx = cv.getContext('2d');
    cx.translate(80, 700); cx.rotate(-Math.PI / 2);
    cx.fillStyle = '#121212'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.font = '700 132px Bahnschrift, "Arial Narrow", Arial, sans-serif';
    if ('letterSpacing' in cx) cx.letterSpacing = '24px';
    cx.fillText('KAST', 0, 6);
    const tex = new T.CanvasTexture(cv);
    const mText = new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    g1.userData.mats.push(mText);
    add(g1, new T.CylinderGeometry(R + 0.004, R + 0.004, 7.5, 24, 1, true, 0.3, 0.6), mText, 0, 12.2, 0);

    // booster computer and friends, inside the top of the booster
    const gb = group('avB');
    const mBox = mat(gb, 0x2c2c2c, 0.6), mGold = mat(gb, GOLD, 0.45, 0.3), mGrey = mat(gb, 0x9b9b9b, 0.5, 0.2), mTankS = mat(gb, 0xdcdcdc, 0.4, 0.2);
    addCyl(gb, mGrey, 0.9, 0.9, 20.05, 20.3, 32);
    addCyl(gb, mBox, 0.55, 0.55, 20.4, 20.8, 8);
    [180, 90, 0, -90].forEach(a => { const m = mount(gb, a); add(m, new T.SphereGeometry(0.2, 20, 14), mTankS, 0.55, 20.85, 0).userData.part = 'avB'; });
    const mk = mount(gb, 45);
    add(mk, new T.BoxGeometry(0.22, 0.36, 0.42), mBox, 1.0, 20.8, 0).userData.part = 'avB';
    add(mk, new T.BoxGeometry(0.23, 0.05, 0.43), mGold, 1.0, 20.92, 0).userData.part = 'avB';
    [135, -45].forEach(a => { const m = mount(gb, a); add(m, new T.BoxGeometry(0.16, 0.26, 0.3), mGrey, 1.0, 20.8, 0).userData.part = 'avB'; });

    // interstage, grid fins, RCS packs
    const gi = group('interstage');
    const mIs = mat(gi, 0x151515, 0.62, 0.05, T.DoubleSide), mRim = mat(gi, 0x2e2e2e, 0.5, 0.3), mFin = mat(gi, 0x6f6f6f, 0.4, 0.6), mPack = mat(gi, 0x262626, 0.55);
    addCyl(gi, mIs, R + 0.02, R + 0.02, 20.0, 24.6, 64, true);
    ring(gi, mRim, R + 0.03, 24.55, 0.1); ring(gi, mRim, R + 0.03, 20.05, 0.1);
    const fins = [];
    [180, 90, 0, -90].forEach(a => {
      const mt = mount(gi, a);
      const hinge = new T.Group(); hinge.position.set(R + 0.06, 22.45, 0); mt.add(hinge);
      const lat = new T.Group(); lat.position.set(0.06, 0.62, 0); hinge.add(lat);
      const bar = (w, h, d, x, y, z) => { const m = add(lat, new T.BoxGeometry(w, h, d), mFin, x, y, z); m.userData.part = 'interstage'; };
      bar(0.1, 1.1, 0.06, 0, 0, -0.46); bar(0.1, 1.1, 0.06, 0, 0, 0.46);
      bar(0.1, 0.06, 0.98, 0, -0.52, 0); bar(0.1, 0.06, 0.98, 0, 0.52, 0);
      for (let i = -2; i <= 2; i++) { bar(0.08, 1.04, 0.025, 0, 0, i * 0.18); bar(0.08, 0.025, 0.92, 0, i * 0.2, 0); }
      fins.push({ mount: mt, hinge });
      const mp = mount(gi, a);
      add(mp, new T.BoxGeometry(0.22, 0.42, 0.34), mPack, R + 0.1, 23.9, 0).userData.part = 'interstage';
    });

    // upper-stage engine (inside the interstage until separation)
    const gm = group('mvac');
    const mNoz = mat(gm, 0x34302c, 0.42, 0.6, T.DoubleSide), mBody = mat(gm, 0x575757, 0.45, 0.5);
    bell(gm, mNoz, 24.0, 21.45, 0.2, 0.92);
    addCyl(gm, mBody, 0.28, 0.32, 24.0, 24.45, 24);

    // second stage
    const g2 = group('s2');
    const mT2 = mat(g2, 0xe9e8e4, 0.5), mS2 = mat(g2, 0xbdbcb7, 0.6), mRx = mat(g2, 0x2b2b2b, 0.55);
    addCyl(g2, mT2, R, R, 24.0, 27.6, 64);
    ring(g2, mS2, R + 0.006, 24.6, 0.04);
    [180, 90, 0, -90].forEach(a => { const m = mount(g2, a); add(m, new T.BoxGeometry(0.16, 0.3, 0.26), mRx, R + 0.07, 27.1, 0).userData.part = 's2'; });

    // upper-stage computer and decoupler
    const gu = group('avU');
    const mU = mat(gu, 0x252525, 0.6), mUg = mat(gu, GOLD, 0.45, 0.3), mUs = mat(gu, 0x9b9b9b, 0.5, 0.2);
    addCyl(gu, mU, 0.98, R, 27.6, 27.95, 48);
    addCyl(gu, mUs, 0.5, 0.5, 28.05, 28.5, 6);
    const mk2 = mount(gu, 45);
    add(mk2, new T.BoxGeometry(0.2, 0.32, 0.36), mU, 0.66, 28.3, 0).userData.part = 'avU';
    add(mk2, new T.BoxGeometry(0.21, 0.05, 0.37), mUg, 0.66, 28.42, 0).userData.part = 'avU';
    [135, -45, -135, 180, 90, 0, -90].forEach(a => { const m = mount(gu, a); add(m, new T.BoxGeometry(0.1, 0.2, 0.18), mUs, 0.62, 28.3, 0).userData.part = 'avU'; });
    addCyl(gu, mU, 0.94, 0.94, 28.5, 28.7, 48);

    // payload: Horizon Junction
    const gp = group('payload');
    const mP = mat(gp, 0xeeede9, 0.5), mPd = mat(gp, 0x2a2a2a, 0.6), mPort = mat(gp, 0x8f8467, 0.4, 0.55), mPs = mat(gp, 0xbdbcb7, 0.55);
    addCyl(gp, mPort, 0.7, 0.94, 28.7, 28.95, 48);
    addCyl(gp, mP, 0.94, 0.94, 28.95, 30.0, 48);
    ring(gp, mPd, 0.945, 29.15, 0.12);
    addCyl(gp, mPd, 0.94, 0.94, 30.0, 30.2, 48);
    addCyl(gp, mP, 0.625, 0.94, 30.2, 30.65, 48);
    addCyl(gp, mP, 0.62, 0.62, 30.65, 31.75, 8);
    addCyl(gp, mP, 0.5, 0.625, 31.75, 32.2, 40);
    addCyl(gp, mPort, 0.6, 0.6, 32.2, 32.5, 40);
    ring(gp, mPs, 0.61, 32.47, 0.06);
    [180, 90, 0, -90].forEach(a => {
      const m = mount(gp, a);
      const ad = add(m, new T.CylinderGeometry(0.5, 0.62, 0.4, 32), mP, 0.82, 31.2, 0); ad.rotation.z = -Math.PI / 2; ad.userData.part = 'payload';
      const pt = add(m, new T.CylinderGeometry(0.6, 0.6, 0.26, 32), mPort, 1.15, 31.2, 0); pt.rotation.z = -Math.PI / 2; pt.userData.part = 'payload';
      const m2 = mount(gp, a);
      add(m2, new T.BoxGeometry(0.12, 0.22, 0.2), mPd, 0.99, 29.5, 0).userData.part = 'payload';
      add(m2, new T.BoxGeometry(0.12, 0.22, 0.2), mPd, 0.67, 32.0, 0).userData.part = 'payload';
    });
    [-135, -165].forEach((a, i) => {
      const m = mount(gp, a);
      add(m, new T.CylinderGeometry(0.015, 0.015, 0.9, 6), mPs, 1.0, 30.45, 0).userData.part = 'payload';
      if (!i) { const d = add(m, new T.ConeGeometry(0.22, 0.12, 20, 1, true), mPs, 1.0, 30.95, 0); d.userData.part = 'payload'; }
    });

    return { groups, pick, legs, fins, engPos };
  }

  function buildFlames(T, engPos) {
    const outerM = new T.MeshBasicMaterial({ color: 0xffa640, transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false });
    const innerM = new T.MeshBasicMaterial({ color: 0xfff1c9, transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false });
    const vacM = new T.MeshBasicMaterial({ color: 0x9cc2ff, transparent: true, opacity: 0.22, blending: T.AdditiveBlending, depthWrite: false });
    const vacIn = new T.MeshBasicMaterial({ color: 0xdbe8ff, transparent: true, opacity: 0.45, blending: T.AdditiveBlending, depthWrite: false });
    const make = (rOut, h, m1, rIn, hIn, m2) => {
      const g = new T.Group();
      const o = new T.Mesh(new T.ConeGeometry(rOut, h, 24, 1, true), m1); o.rotation.x = Math.PI; o.position.y = -h / 2; g.add(o);
      const i = new T.Mesh(new T.ConeGeometry(rIn, hIn, 20, 1, true), m2); i.rotation.x = Math.PI; i.position.y = -hIn / 2; g.add(i);
      g.visible = false; return g;
    };
    const eng = engPos.map(([x, z]) => { const f = make(0.36, 3.4, outerM, 0.2, 1.6, innerM); f.position.set(x, 1.55, z); return { f, x, z }; });
    const vac = make(1.25, 5.5, vacM, 0.7, 2.6, vacIn); vac.position.set(0, 21.45, 0);
    return { eng, vac };
  }

  function buildPad(T) {
    const g = new T.Group();
    const mPad = new T.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9, transparent: true });
    const mRing = new T.MeshBasicMaterial({ color: GOLD, transparent: true });
    const mClamp = new T.MeshStandardMaterial({ color: 0x5c5c5c, roughness: 0.6, metalness: 0.3, transparent: true });
    const disc = new T.Mesh(new T.CylinderGeometry(9, 9.4, 0.3, 64), mPad); disc.position.y = -0.15; g.add(disc);
    const r1 = new T.Mesh(new T.RingGeometry(5.6, 5.75, 96), mRing); r1.rotation.x = -Math.PI / 2; r1.position.y = 0.01; g.add(r1);
    const clamps = new T.Group(); g.add(clamps);
    [180, 90, 0, -90].forEach(a => {
      const m = new T.Group(); m.rotation.y = -a * D2R; clamps.add(m);
      const t = new T.Mesh(new T.BoxGeometry(0.42, 4.2, 0.42), mClamp); t.position.set(2.05, 2.1, 0); m.add(t);
      const arm = new T.Mesh(new T.BoxGeometry(0.75, 0.24, 0.3), mClamp); arm.position.set(1.62, 3.9, 0); m.add(arm);
    });
    return { g, clamps, mats: [mPad, mRing, mClamp], clampMat: mClamp };
  }

  function buildStars(T) {
    const n = 900, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = 380 + Math.random() * 140, s = Math.sqrt(1 - u * u);
      pos[i * 3] = r * s * Math.cos(th); pos[i * 3 + 1] = r * u; pos[i * 3 + 2] = r * s * Math.sin(th);
    }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    return new T.Points(geo, new T.PointsMaterial({ color: 0x8c8c8c, size: 1.4, sizeAttenuation: false }));
  }

  /* ---------- viewer ---------- */
  function mount(container) {
    unmount();
    const T = window.THREE;
    container.replaceChildren();
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const view = el('div', { class: 'k3d-view', tabindex: '0', role: 'application',
      'aria-label': '3D model of the LV-5 Kestrel. Drag to turn it, scroll to zoom. The part list beside it does the same as tapping a part.' });
    const labels = el('div', { class: 'k3d-labels', 'aria-hidden': 'true' });
    const panel = el('aside', { class: 'k3d-panel', 'aria-live': 'polite' });
    const modeParts = el('button', { type: 'button', class: 'k3d-mode', 'aria-pressed': 'true', text: 'Parts' });
    const modeFly = el('button', { type: 'button', class: 'k3d-mode', 'aria-pressed': 'false', text: 'How it flies' });
    const bar = el('div', { class: 'k3d-bar' });
    view.append(labels, el('div', { class: 'k3d-modes', role: 'group', 'aria-label': 'View' }, [modeParts, modeFly]), bar);
    container.append(el('div', { class: 'k3d' }, [view, panel]));

    let renderer;
    try {
      renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    } catch (e) { renderer = null; }
    if (!renderer || !renderer.getContext()) {
      view.append(el('div', { class: 'k3d-fallback', text: 'This browser could not start 3D graphics, so the model cannot be shown. The parts list beside it still describes every part.' }));
      S = { panel, destroy() {} };
      renderPartsPanel(panel, null, () => {});
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    view.prepend(renderer.domElement);

    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(30, 1, 0.1, 2000);
    scene.add(new T.HemisphereLight(0xffffff, 0x1a1a1a, 0.62));
    const key = new T.DirectionalLight(0xfff3e0, 1.05); key.position.set(25, 40, 30); scene.add(key);
    const rim = new T.DirectionalLight(0xc9d6ff, 0.55); rim.position.set(-30, 12, -28); scene.add(rim);
    scene.add(buildStars(T));

    const M = buildModel(T);
    const F = buildFlames(T, M.engPos);
    const P = buildPad(T); scene.add(P.g);

    const vehicle = new T.Group(); scene.add(vehicle);
    const bPivot = new T.Group(); bPivot.position.y = BP; vehicle.add(bPivot);
    const bInner = new T.Group(); bInner.position.y = -BP; bPivot.add(bInner);
    const uPivot = new T.Group(); uPivot.position.y = UP; vehicle.add(uPivot);
    const uInner = new T.Group(); uInner.position.y = -UP; uPivot.add(uInner);
    BOOSTER.forEach(id => bInner.add(M.groups[id]));
    ['mvac', 's2', 'avU', 'payload'].forEach(id => uInner.add(M.groups[id]));
    F.eng.forEach(e => M.groups.engines.add(e.f));
    M.groups.mvac.add(F.vac);

    // state
    const st = {
      mode: 'parts', explode: 0, explodeGoal: 0, sel: null, hover: null, step: 0, playing: false, playTimer: null,
      yaw: 0.62, pitch: 0.1, dist: 80, distGoal: 80, target: new T.Vector3(0, 16.3, 0), targetGoal: new T.Vector3(0, 16.3, 0),
      idle: 0, zoomed: false, fly: Object.assign({}, PARTS_STATE), from: null, to: null, tt: 1, dur: reduced ? 0.01 : 1.5
    };

    // labels in the pulled-apart view
    const labelEls = {};
    PARTS.forEach(p => {
      const b = el('button', { type: 'button', class: 'k3d-label', text: p.name, tabindex: '-1', onclick: () => select(p.id) });
      const lead = el('span', { class: 'k3d-lead' });
      labels.append(lead, b); labelEls[p.id] = { b, lead };
    });

    /* --- highlight and opacity --- */
    function paint() {
      PARTS.forEach(p => {
        const g = M.groups[p.id];
        const k = st.mode === 'parts' ? (st.sel === p.id ? 0.3 : st.hover === p.id ? 0.15 : 0) : 0;
        g.userData.mats.forEach(m => { if (m.emissive) { m.emissive.setHex(GOLD); m.emissiveIntensity = k; } });
        labelEls[p.id].b.classList.toggle('is-on', st.sel === p.id);
      });
    }
    function opacity(g, o) {
      g.visible = o > 0.01;
      g.userData.mats.forEach(m => { m.opacity = o; m.transparent = o < 0.999 || m.map != null; m.depthWrite = o > 0.6 && m.map == null; });
    }

    /* --- panel --- */
    function select(id) {
      st.sel = st.sel === id ? null : id;
      if (st.sel && st.explodeGoal < 0.5 && st.sel !== 'payload' && st.sel !== 's1') setExplode(1);
      paint();
      renderPartsPanel(panel, st.sel, select);
    }
    function showStep(i) {
      st.step = Math.max(0, Math.min(STEPS.length - 1, i));
      st.from = Object.assign({}, st.fly); st.to = STEPS[st.step]; st.tt = 0; st.zoomed = false;
      renderStepPanel(panel, st.step, showStep);
      counter.textContent = (st.step + 1) + ' / ' + STEPS.length;
      prev.disabled = st.step === 0; next.disabled = st.step === STEPS.length - 1;
      if (st.step === STEPS.length - 1) stopPlay();
    }
    function stopPlay() { st.playing = false; clearInterval(st.playTimer); play.textContent = 'Play'; play.setAttribute('aria-pressed', 'false'); }

    /* --- controls --- */
    const range = el('input', { type: 'range', min: '0', max: '100', value: '0', class: 'k3d-range', 'aria-label': 'Pull the rocket apart' });
    range.addEventListener('input', () => { st.explodeGoal = range.value / 100; st.idle = 0; });
    const partsBar = el('div', { class: 'k3d-row' }, [el('span', { class: 'k3d-end', text: 'Assembled' }), range, el('span', { class: 'k3d-end', text: 'Apart' })]);
    const prev = el('button', { type: 'button', class: 'btn small', text: 'Back', onclick: () => { stopPlay(); showStep(st.step - 1); } });
    const next = el('button', { type: 'button', class: 'btn small', text: 'Next', onclick: () => { stopPlay(); showStep(st.step + 1); } });
    const play = el('button', { type: 'button', class: 'btn small gold', text: 'Play', 'aria-pressed': 'false', onclick: () => {
      if (st.playing) { stopPlay(); return; }
      if (st.step === STEPS.length - 1) showStep(0);
      st.playing = true; play.textContent = 'Pause'; play.setAttribute('aria-pressed', 'true');
      st.playTimer = setInterval(() => showStep(st.step + 1), reduced ? 6000 : 4800);
    } });
    const counter = el('span', { class: 'k3d-count', text: '1 / ' + STEPS.length });
    const flyBar = el('div', { class: 'k3d-row' }, [prev, counter, next, play]);
    const hint = el('span', { class: 'k3d-hint', text: 'Drag to turn · scroll or pinch to zoom · tap a part' });
    function setExplode(v) { st.explodeGoal = v; range.value = Math.round(v * 100); }
    function setMode(m) {
      if (st.mode === m) return;
      st.mode = m; stopPlay();
      modeParts.setAttribute('aria-pressed', String(m === 'parts')); modeFly.setAttribute('aria-pressed', String(m === 'fly'));
      hint.textContent = m === 'parts' ? 'Drag to turn \u00B7 scroll or pinch to zoom \u00B7 tap a part' : 'Drag to turn \u00B7 scroll or pinch to zoom';
      bar.replaceChildren(m === 'parts' ? partsBar : flyBar, hint);
      if (m === 'parts') {
        st.from = Object.assign({}, st.fly); st.to = PARTS_STATE; st.tt = 0; st.zoomed = false;
        renderPartsPanel(panel, st.sel, select);
      } else {
        setExplode(0); st.sel = null; st.hover = null; showStep(0);
      }
      paint();
    }
    modeParts.addEventListener('click', () => setMode('parts'));
    modeFly.addEventListener('click', () => setMode('fly'));
    bar.append(partsBar, hint);
    renderPartsPanel(panel, null, select);

    /* --- pointer: orbit, zoom, pick --- */
    const ray = new T.Raycaster(), ndc = new T.Vector2();
    const ptrs = new Map(); let downAt = null, pinch0 = 0, dist0 = 0, lastHover = 0;
    function partAt(x, y) {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(M.pick.filter(m => m.visible && m.parent && isShown(m)), false)[0];
      return hit ? hit.object.userData.part : null;
    }
    function isShown(o) { while (o) { if (!o.visible) return false; o = o.parent; } return true; }
    const cvs = renderer.domElement;
    cvs.addEventListener('pointerdown', e => {
      cvs.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      downAt = { x: e.clientX, y: e.clientY, moved: 0 }; st.idle = -1e9;
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); dist0 = st.distGoal; }
      view.classList.add('is-dragging');
    });
    cvs.addEventListener('pointermove', e => {
      const p = ptrs.get(e.pointerId);
      if (!p) {
        if (st.mode === 'parts' && e.timeStamp - lastHover > 60) {
          lastHover = e.timeStamp; const h = partAt(e.clientX, e.clientY);
          if (h !== st.hover) { st.hover = h; paint(); cvs.style.cursor = h ? 'pointer' : ''; }
        }
        return;
      }
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (downAt) downAt.moved += Math.abs(dx) + Math.abs(dy);
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch0 > 0) { st.distGoal = Math.max(14, Math.min(160, dist0 * pinch0 / d)); st.dist = st.distGoal; st.zoomed = true; }
        return;
      }
      st.yaw -= dx * 0.006; st.pitch = Math.max(-1.25, Math.min(1.25, st.pitch + dy * 0.005));
    });
    const up = e => {
      const wasClick = downAt && downAt.moved < 6 && ptrs.size === 1;
      ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = 0;
      if (!ptrs.size) view.classList.remove('is-dragging');
      if (wasClick && st.mode === 'parts') { const h = partAt(e.clientX, e.clientY); if (h) select(h); }
      downAt = null; st.idle = -4;
    };
    cvs.addEventListener('pointerup', up); cvs.addEventListener('pointercancel', up);
    cvs.addEventListener('pointerleave', () => { if (st.hover) { st.hover = null; paint(); } });
    cvs.addEventListener('wheel', e => {
      e.preventDefault(); st.idle = -4; st.zoomed = true;
      st.distGoal = Math.max(14, Math.min(160, st.distGoal * Math.pow(1.0015, e.deltaY)));
    }, { passive: false });
    view.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') { st.yaw += 0.12; e.preventDefault(); }
      else if (e.key === 'ArrowRight') { st.yaw -= 0.12; e.preventDefault(); }
      else if (e.key === 'ArrowUp') { st.pitch = Math.min(1.25, st.pitch + 0.08); e.preventDefault(); }
      else if (e.key === 'ArrowDown') { st.pitch = Math.max(-1.25, st.pitch - 0.08); e.preventDefault(); }
      else if (e.key === '+' || e.key === '=') { st.distGoal = Math.max(14, st.distGoal / 1.15); st.zoomed = true; }
      else if (e.key === '-') { st.distGoal = Math.min(160, st.distGoal * 1.15); st.zoomed = true; }
      else return;
      st.idle = -4;
    });

    /* --- sizing --- */
    let W = 1, H = 1;
    function resize() {
      const r = view.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
      renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(resize); ro.observe(view); resize();
    let onScreen = true;
    const io = new IntersectionObserver(es => { onScreen = es[0].isIntersecting; }); io.observe(view);

    /* --- frame --- */
    const v3 = new T.Vector3(), v4 = new T.Vector3(), right = new T.Vector3();
    // narrow (portrait) views need to stand further back to fit the rocket's width and labels
    const fit = () => W / H < 0.8 ? 1.35 : 1;
    let last = performance.now(), raf = 0, alive = true;
    function frame(now) {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!onScreen) return;

      // pull apart
      st.explode += (st.explodeGoal - st.explode) * Math.min(1, dt * (reduced ? 60 : 6));
      const e = st.mode === 'parts' ? st.explode : 0;
      PARTS.forEach(p => { M.groups[p.id].position.y = p.ex * e; });
      M.legs.forEach(l => l.hinge.position.x = 1.27 + 1.1 * e);
      M.fins.forEach(f => f.hinge.position.x = 1.31 + 0.8 * e);

      // flight state
      if (st.tt < 1 && st.to) {
        st.tt = Math.min(1, st.tt + dt / st.dur);
        const k = ease(st.tt), a = st.from, b = st.to;
        ['veh', 'sep', 'brot', 'by', 'legs', 'fins', 'pad', 'clamps', 'upOp', 'bOp'].forEach(n => st.fly[n] = lerp(a[n], b[n], k));
        st.fly.flame = b.flame; st.fly.mvac = b.mvac; st.fly.focus = b.focus;
      }
      const f = st.fly;
      vehicle.position.y = f.veh;
      bPivot.position.y = BP + f.by; bPivot.rotation.z = f.brot * D2R;
      uPivot.position.y = UP + f.sep;
      M.legs.forEach(l => l.hinge.rotation.z = -150 * D2R * f.legs);
      M.fins.forEach(fi => fi.hinge.rotation.z = -90 * D2R * f.fins);
      BOOSTER.forEach(id => opacity(M.groups[id], f.bOp));
      ['mvac', 's2', 'avU', 'payload'].forEach(id => opacity(M.groups[id], f.upOp));
      P.mats.forEach(m => { m.opacity = f.pad; }); P.g.visible = f.pad > 0.01;
      P.clampMat.opacity = Math.min(f.pad, f.clamps); P.clamps.visible = f.clamps > 0.01;
      const lit = st.mode === 'fly' && st.tt > 0.35;
      F.eng.forEach(en => {
        const on = lit && !(st.to && st.to.shutdown && st.tt >= 1) && (f.flame === 9 || (f.flame === 3 && en.z === 0 && Math.abs(en.x) < 0.8));
        en.f.visible = on && f.bOp > 0.3;
        if (on && !reduced) en.f.scale.set(1, 0.9 + Math.random() * 0.2, 1);
      });
      F.vac.visible = lit && f.mvac && f.upOp > 0.3;
      if (F.vac.visible && !reduced) F.vac.scale.set(1, 0.94 + Math.random() * 0.12, 1);

      // camera goal
      if (st.mode === 'parts') {
        st.targetGoal.set(0, lerp(16.3, 21.2, e), 0);
        if (!st.zoomed) st.distGoal = lerp(80, 104, e) * fit();
      } else {
        const bc = f.veh + BP + f.by, uc = f.veh + UP + f.sep;
        const ty = f.focus === 'upper' ? uc + 1 : f.focus === 'booster' ? bc : (f.veh + 16 + f.sep * 0.5);
        st.targetGoal.set(0, ty, 0);
        if (!st.zoomed) st.distGoal = (f.focus === 'all' ? 84 + f.sep * 1.6 : f.pad > 0.5 ? 70 : 62) * fit();
      }
      const ck = Math.min(1, dt * (reduced ? 60 : 3));
      st.target.lerp(st.targetGoal, ck);
      st.dist += (st.distGoal - st.dist) * ck;
      st.idle += dt;
      if (st.idle > 2 && st.mode === 'parts' && !reduced && !st.sel) st.yaw += dt * 0.12;
      const cp = Math.cos(st.pitch);
      camera.position.set(st.target.x + st.dist * cp * Math.sin(st.yaw), st.target.y + st.dist * Math.sin(st.pitch), st.target.z + st.dist * cp * Math.cos(st.yaw));
      camera.lookAt(st.target);
      // narrow screens: slide the rocket left so the part labels fit beside it
      const shift = st.mode === 'parts' && W < 700 ? 0.2 * W * Math.min(1, Math.max(0, (e - 0.3) / 0.4)) : 0;
      if (shift > 0.5) camera.setViewOffset(W, H, shift, 0, W, H); else if (camera.view && camera.view.enabled) camera.clearViewOffset();

      renderer.render(scene, camera);

      // labels
      const showL = st.mode === 'parts' && e > 0.45;
      labels.classList.toggle('is-on', showL);
      if (showL) {
        camera.updateMatrixWorld(); right.setFromMatrixColumn(camera.matrixWorld, 0);
        PARTS.forEach(p => {
          const g = M.groups[p.id];
          v3.set(0, p.cy, 0); g.localToWorld(v3);
          const near = v4.copy(v3).addScaledVector(right, p.id === 'legs' ? 2.6 : p.id === 'interstage' ? 2.4 : 1.6).project(camera);
          const far = v3.addScaledVector(right, 3.4).project(camera);
          const x0 = (near.x + 1) / 2 * W, y0 = (1 - near.y) / 2 * H, x1 = (far.x + 1) / 2 * W, y1 = (1 - far.y) / 2 * H;
          const L = labelEls[p.id];
          const ok = near.z < 1 && x1 < W - 20 && y1 > 40 && y1 < H - 60;
          L.b.style.display = L.lead.style.display = ok ? '' : 'none';
          if (!ok) return;
          L.b.style.transform = 'translate(' + Math.round(x1 + 6) + 'px,' + Math.round(y1) + 'px) translateY(-50%)';
          L.lead.style.transform = 'translate(' + Math.round(x0) + 'px,' + Math.round(y0) + 'px)';
          L.lead.style.width = Math.max(0, Math.round(x1 - x0)) + 'px';
          L.b.tabIndex = 0;
        });
      }
    }
    raf = requestAnimationFrame(frame);

    S = {
      panel,
      destroy() {
        alive = false; cancelAnimationFrame(raf); stopPlay(); ro.disconnect(); io.disconnect();
        scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); });
        renderer.dispose(); renderer.forceContextLoss && renderer.forceContextLoss();
      }
    };
  }

  /* ---------- side panel ---------- */
  function partList(sel, select) {
    return el('ol', { class: 'k3d-parts' }, PARTS.map(p => el('li', null,
      el('button', { type: 'button', class: 'k3d-part' + (sel === p.id ? ' is-on' : ''), 'aria-pressed': String(sel === p.id), text: p.name, onclick: () => select(p.id) }))));
  }
  function renderPartsPanel(panel, sel, select) {
    const p = PARTS.find(x => x.id === sel);
    if (!p) {
      panel.replaceChildren(
        el('p', { class: 'kicker', text: 'Parts, top to bottom' }),
        el('h2', { text: 'Pull it apart' }),
        el('p', { class: 'k3d-text', text: 'Slide to Apart, or pick a part here or on the model, to see what it is and what it does.' }),
        partList(null, select));
      return;
    }
    panel.replaceChildren(
      el('p', { class: 'kicker', text: BOOSTER.includes(p.id) ? 'Booster' : p.id === 'payload' ? 'Payload' : 'Upper stage' }),
      el('h2', { text: p.name }),
      el('p', { class: 'k3d-sub', text: p.sub }),
      el('p', { class: 'k3d-text', text: p.text }),
      el('dl', { class: 'k3d-values' }, [].concat(...p.values.map(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })]))),
      partList(sel, select));
  }
  function renderStepPanel(panel, i, go) {
    const s = STEPS[i];
    panel.replaceChildren(
      el('p', { class: 'kicker', text: 'Step ' + (i + 1) + ' of ' + STEPS.length }),
      el('h2', { text: s.title }),
      el('p', { class: 'k3d-text', text: s.text }),
      el('ol', { class: 'k3d-steps' }, STEPS.map((x, j) => el('li', null,
        el('button', { type: 'button', class: 'k3d-step' + (j === i ? ' is-on' : ''), 'aria-current': j === i ? 'step' : null, onclick: () => go(j) }, [
          el('span', { class: 'k3d-step-n', text: String(j + 1).padStart(2, '0') }), x.title ])))));
  }

  function unmount() { if (S) { S.destroy(); S = null; } }

  window.KAST_K3D = { mount, unmount };
})();
