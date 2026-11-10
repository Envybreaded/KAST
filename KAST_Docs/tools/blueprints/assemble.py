"""Build each craft part's rendered geometry, in part-local Unity coordinates (metres).

part transform -> 'model' (scale = rescaleFactor) -> each MODEL instance (its position/rotation/scale replaces
the .mu root transform) -> the .mu transform tree -> mesh vertices.
"""
import os, re, math, glob
import numpy as np
from cfgnode import vec
from mureader import read_mu

GAMEDATA = os.path.join(os.environ.get('KSP_ROOT', '/mnt/user-data/uploads/Kerbal Space Program'), 'GameData')
GLOW = re.compile(r'(glow|flare|emissive|emmissive|emessive|plume|flame|exhaust|shimmer|fx_|_fx\b|smoke|spark|lightcone|light_cone|lightbeam|beam)', re.I)

_mu_cache = {}
def mu(path):
    if path not in _mu_cache:
        _mu_cache[path] = read_mu(path)
    return _mu_cache[path]

# ---------- math ----------
def quat_matrix(q):
    x, y, z, w = q
    n = math.sqrt(x * x + y * y + z * z + w * w) or 1.0
    x, y, z, w = x / n, y / n, z / n, w / n
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])

def euler_quat(ex, ey, ez):
    """Unity Quaternion.Euler: rotate z, then x, then y (q = qy * qx * qz)."""
    def axis(a, deg):
        h = math.radians(deg) / 2
        s, c = math.sin(h), math.cos(h)
        return {'x': (s, 0, 0, c), 'y': (0, s, 0, c), 'z': (0, 0, s, c)}[a]
    return qmul(qmul(axis('y', ey), axis('x', ex)), axis('z', ez))

def qmul(a, b):
    ax, ay, az, aw = a; bx, by, bz, bw = b
    return (aw * bx + ax * bw + ay * bz - az * by,
            aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw,
            aw * bw - ax * bx - ay * by - az * bz)

def trs(pos, rot, scale):
    m = np.eye(4)
    m[:3, :3] = quat_matrix(rot) * np.asarray(scale, float)[None, :]
    m[:3, 3] = pos
    return m

# ---------- config helpers ----------
def rescale_factor(p):
    v = p.get('rescaleFactor')
    return float(v) if v not in (None, '') else 1.25      # KSP's default when a part does not set it

def model_instances(url, p):
    """[(mu path, 4x4 matrix replacing the .mu root)] for one part config."""
    d = url.rsplit('/', 1)[0]
    out = []
    ms = p.nodesnamed('MODEL')
    if ms:
        for m in ms:
            path = os.path.join(GAMEDATA, m.get('model').strip() + '.mu')
            pos = vec(m.get('position') or '0,0,0', 3)
            r = vec(m.get('rotation') or '0,0,0', 3)
            sc = vec(m.get('scale') or '1,1,1', 3)
            out.append((path, trs(pos, euler_quat(*r), sc)))
    else:
        # mesh = ... : KSP loads the first .mu in the part's folder, whatever the name says
        mus = sorted(glob.glob(os.path.join(GAMEDATA, d, '*.mu')), key=str.lower)
        if mus:
            out.append((mus[0], np.eye(4)))
    return out

def hidden_names(p, craft_part):
    """Transform names the game does not show for this part's selected options."""
    hide, show = set(), set()
    for m in p.nodesnamed('MODULE'):
        mn = m.get('name')
        if mn == 'ModulePartVariants':
            vs = m.nodesnamed('VARIANT')
            sel = craft_part['variant'] or m.get('baseVariant') or (vs[0].get('name') if vs else None)
            for v in vs:
                if v.get('name') == sel:
                    for g in v.nodesnamed('GAMEOBJECTS'):
                        for k, val in g.values:
                            (show if val.strip().lower() == 'true' else hide).add(k.strip())
        elif mn == 'ModuleB9PartSwitch':
            subs = m.nodesnamed('SUBTYPE')
            if not subs:
                continue
            want = craft_part['b9'].get(m.get('moduleID') or '')
            names = [s.get('name') for s in subs]
            sel = want if want in names else names[0]
            selected = set(t.strip() for s in subs if s.get('name') == sel for t in s.getall('transform'))
            for s in subs:
                for t in s.getall('transform'):
                    if t.strip() not in selected:
                        hide.add(t.strip())
            show |= selected
        elif mn == 'ModuleB9DisableTransform':
            for t in m.getall('transform'):
                hide.add(t.strip())
        elif mn == 'ModuleJettison':
            for t in (m.get('jettisonName') or '').split(','):
                if t.strip():
                    hide.add(t.strip())
        elif mn == 'ModuleParachute':
            for k in ('canopyName', 'capName'):
                if m.get(k):
                    hide.add(m.get(k).strip())
        elif mn == 'ModuleStructuralNode':
            root = (m.get('rootObject') or '').strip()
            nodes = [x.strip() for x in (m.get('attachNodeNames') or m.get('attachNodeName') or '').split(',') if x.strip()]
            attached = {a.split(',')[0].strip() for a in craft_part['attN'] if ',' in a and not a.split(',')[1].strip().startswith('Null')}
            if root and not (set(nodes) & attached):
                hide.add(root)
    return hide - show, show

ANIM_MODULES = {'ModuleAnimateGeneric', 'DMModuleScienceAnimateGeneric', 'ModuleDeployableSolarPanel',
                'ModuleDeployableAntenna', 'ModuleDeployableRadiator', 'ModuleWheelDeployment', 'ModuleAnimateHeat'}

def anim_times(p, craft_part):
    """{clip name: 0 (start) or 1 (end)} for the animations the game poses in the editor."""
    out = {}
    states = {}
    for m in craft_part['modules']:
        states.setdefault(m.get('name'), []).append(m)
    seen = {}
    for m in p.nodesnamed('MODULE'):
        mn = m.get('name')
        if mn not in ANIM_MODULES:
            continue
        an = m.get('animationName') or m.get('animationStateName')
        if not an:
            continue
        i = seen.get(mn, 0); seen[mn] = i + 1
        cm = states.get(mn, [])
        cm = cm[i] if i < len(cm) else None
        t = 0.0
        if cm is not None:
            ds = (cm.get('deployState') or '').upper()
            if ds in ('EXTENDED', 'EXTENDING'):
                t = 1.0
            elif cm.get('animTime') not in (None, ''):
                t = float(cm.get('animTime'))
            if (cm.get('stateString') or '').lower() == 'deployed':
                t = 1.0
        out[an.strip()] = t
    return out

def sample(keys, frac):
    if not len(keys):
        return None
    t = keys[0, 0] + frac * (keys[-1, 0] - keys[0, 0])
    return float(np.interp(t, keys[:, 0], keys[:, 1]))

def pose_overrides(root, clips_t):
    """id(transform) -> (pos, rot, scale) with the named clips sampled; transforms stay untouched."""
    ov = {}
    def it(t):
        yield t
        for c in t.children: yield from it(c)
    for owner in it(root):
        for name, curves in owner.anims:
            if name not in clips_t:
                continue
            frac = clips_t[name]
            for path, prop, keys in curves:
                tgt = owner
                for seg in [x for x in path.split('/') if x]:
                    tgt = next((c for c in tgt.children if c.name == seg), None)
                    if tgt is None:
                        break
                if tgt is None:
                    continue
                v = sample(keys, frac)
                if v is None:
                    continue
                cur = ov.setdefault(id(tgt), [list(tgt.pos), list(tgt.rot), list(tgt.scale), None, set()])
                cur[4].add(prop.split('.')[0])
                comp = prop.rsplit('.', 1)[-1]
                ix = 'xyzw'.index(comp) if comp in 'xyzw' else None
                if ix is None:
                    continue
                if prop.startswith('m_LocalPosition'): cur[0][ix] = v
                elif prop.startswith('m_LocalRotation'): cur[1][ix] = v
                elif prop.startswith('m_LocalScale'): cur[2][ix] = v
                elif prop.startswith('localEulerAnglesRaw'):
                    if cur[3] is None: cur[3] = [0.0, 0.0, 0.0]
                    cur[3][ix] = v
    for k, cur in ov.items():
        if cur[3] is not None:
            cur[1] = list(euler_quat(*cur[3]))
    return ov

def part_geometry(url, p, craft_part):
    """Returns (verts float64 Nx3, tris int Mx3) in part-local Unity space, plus a report of hidden names."""
    hide, _ = hidden_names(p, craft_part)
    rf = rescale_factor(p)
    model_m = trs((0, 0, 0), (0, 0, 0, 1), (rf, rf, rf))
    report = set()

    def find_bone(t, name):
        a = t
        while a is not None:
            stack = [a]
            while stack:
                x = stack.pop()
                if x.name == name:
                    return x
                stack.extend(x.children)
            a = a.parent
        return None

    def ltrs(c):
        o = ov.get(id(c))
        return trs(o[0], o[1], o[2]) if o else trs(c.pos, c.rot, c.scale)

    def walk(t, mat, hidden, mats, root=False):
        mats[id(t)] = mat
        # KSP renames a loaded model's root to its url, so name rules never match the root
        h = hidden or (not root and (t.name in hide or bool(GLOW.search(t.name))))
        if h and not hidden:
            report.add(t.name)
        if not h and t.mesh is not None and t.rendered and len(t.mesh.tris):
            pending.append((t, mats))
        for c in t.children:
            walk(c, mat @ ltrs(c), h, mats)

    def emit(t, mats):
        m = t.mesh
        v = m.verts.astype(np.float64)
        if t.skinned and m.bindposes is not None and m.bw_raw is not None and t.bones:
            idx = m.bw_raw.view('<i4').reshape(-1, 8)[:, 0::2]
            w = m.bw_raw.view('<f4').reshape(-1, 8)[:, 1::2].astype(np.float64)
            out = np.zeros_like(v)
            vh = np.c_[v, np.ones(len(v))]
            for b, name in enumerate(t.bones):
                bone = find_bone(t, name)
                bm = mats.get(id(bone)) if bone is not None else None
                if bm is None or b >= len(m.bindposes):
                    bm, bp = mats[id(t)], np.eye(4)
                else:
                    bp = m.bindposes[b].astype(np.float64)
                wb = (w * (idx == b)).sum(1)
                if wb.any():
                    out += wb[:, None] * (vh @ (bm @ bp).T)[:, :3]
            v = out
            nrm = None
        else:
            mat = mats[id(t)]
            if abs(np.linalg.det(mat[:3, :3])) < 1e-9:
                return                                  # zero-scaled transform: invisible in game
            v = (mat[:3, :3] @ v.T).T + mat[:3, 3]
            nrm = None
            if m.normals is not None and len(m.normals) == len(v):
                nm = np.linalg.inv(mat[:3, :3]).T
                nrm = (nm @ m.normals.astype(np.float64).T).T
                nrm /= np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-12)
            if np.linalg.det(mat[:3, :3]) < 0:
                pass   # mirrored transform: winding flips, irrelevant for double-sided fill
        meshes.append((v, m.tris.astype(np.int64), nrm, t.name))

    pending, meshes = [], []
    clips_t = anim_times(p, craft_part)
    for path, inst in model_instances(url, p):
        root = mu(path)
        ov = pose_overrides(root, clips_t)
        o = ov.get(id(root))
        if o and ({'m_LocalRotation', 'localEulerAnglesRaw'} & o[4]):
            # an animation that drives the model root overrides the rotation KSP gave it
            sc = np.linalg.norm(inst[:3, :3], axis=0)
            inst = trs(inst[:3, 3], o[1], sc)
        walk(root, model_m @ inst, False, {}, True)    # the MODEL node replaces the .mu root transform
    for t, mats in pending:
        emit(t, mats)
    return meshes, report
