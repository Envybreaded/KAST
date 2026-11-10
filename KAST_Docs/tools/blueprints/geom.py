"""Turn a part's rendered meshes into blueprint geometry.

Per source mesh: weld at 1 mm, drop duplicate and degenerate triangles, then classify every edge:
  hard  - open boundary, non-manifold, or a crease: faces meet at more than CREASE_DEG and the
          model's own normals are split there (the artist made it a hard edge), or the faces
          meet at more than ALWAYS_DEG whatever the normals say
  soft  - a smoothed edge; kept with its two opposite vertices so the viewer can draw it only
          where it is on the silhouette
"""
import math
import numpy as np

WELD = 0.001
CREASE_DEG = 6.0
ALWAYS_DEG = 40.0
NORMAL_SPLIT_DEG = 2.0
FLAT_DEG = 0.5


def process(meshes):
    allV, allT, hard, soft = [], [], [], []
    base = 0
    for v, t, nrm, _name in meshes:
        if len(t) == 0:
            continue
        V, T, H, S = one_mesh(v, t, nrm)
        allV.append(V); allT.append(T + base); hard.append(H + base); soft.append(S + base)
        base += len(V)
    if not allV:
        return None
    return {'v': np.concatenate(allV), 't': np.concatenate(allT),
            'h': np.concatenate(hard) if hard else np.zeros((0, 2), np.int64),
            's': np.concatenate(soft) if soft else np.zeros((0, 4), np.int64)}


def one_mesh(v, t, nrm):
    t = t[(t >= 0).all(1) & (t < len(v)).all(1)]
    key = np.round(v / WELD).astype(np.int64)
    _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    inv = inv.reshape(-1)
    V = v[first]
    W = inv[t]                                         # welded corners
    ok = (W[:, 0] != W[:, 1]) & (W[:, 1] != W[:, 2]) & (W[:, 0] != W[:, 2])
    a, b, c = V[W[:, 0]], V[W[:, 1]], V[W[:, 2]]
    fn = np.cross(b - a, c - a)
    area = np.linalg.norm(fn, axis=1)
    ok &= area > 1e-10
    W, t, fn, area = W[ok], t[ok], fn[ok], area[ok]
    # duplicate triangles (incl. the reversed copy of a double-sided face)
    s = np.sort(W, axis=1)
    _, keep = np.unique(s, axis=0, return_index=True)
    keep.sort()
    W, t, fn = W[keep], t[keep], fn[keep] / area[keep][:, None]

    # edges: (face, corner i -> i+1)
    nf = len(W)
    e0 = np.concatenate([W[:, 0], W[:, 1], W[:, 2]])
    e1 = np.concatenate([W[:, 1], W[:, 2], W[:, 0]])
    o0 = np.concatenate([t[:, 0], t[:, 1], t[:, 2]])   # original corners (for normal splits)
    o1 = np.concatenate([t[:, 1], t[:, 2], t[:, 0]])
    opp = np.concatenate([W[:, 2], W[:, 0], W[:, 1]])  # the vertex opposite the edge
    face = np.tile(np.arange(nf), 3)
    lo, hi = np.minimum(e0, e1), np.maximum(e0, e1)
    order = np.lexsort((hi, lo))
    lo, hi, e0, o0, o1, opp, face = lo[order], hi[order], e0[order], o0[order], o1[order], opp[order], face[order]
    brk = np.r_[True, (lo[1:] != lo[:-1]) | (hi[1:] != hi[:-1])]
    gid = np.cumsum(brk) - 1
    starts = np.flatnonzero(brk)
    counts = np.diff(np.r_[starts, len(lo)])

    H, S = [], []
    one = starts[counts == 1]
    H.append(np.c_[lo[one], hi[one]])
    many = starts[counts > 2]
    H.append(np.c_[lo[many], hi[many]])
    two = starts[counts == 2]
    i, j = two, two + 1
    n1, n2 = fn[face[i]].copy(), fn[face[j]].copy()
    same_dir = e0[i] == e0[j]                          # inconsistent winding: flip one normal
    n2[same_dir] *= -1
    ang = np.degrees(np.arccos(np.clip((n1 * n2).sum(1), -1, 1)))
    if nrm is not None:
        def nd(x, y):
            return np.degrees(np.arccos(np.clip((nrm[x] * nrm[y]).sum(1), -1, 1)))
        # corners of the two faces at each end of the edge, matched by welded vertex
        a_i = np.where(e0[i] == lo[i], o0[i], o1[i])
        b_i = np.where(e0[i] == lo[i], o1[i], o0[i])
        a_j = np.where(e0[j] == lo[j], o0[j], o1[j])
        b_j = np.where(e0[j] == lo[j], o1[j], o0[j])
        split = (nd(a_i, a_j) > NORMAL_SPLIT_DEG) | (nd(b_i, b_j) > NORMAL_SPLIT_DEG)
        split |= same_dir
    else:
        split = np.ones(len(i), bool)
    crease = ((ang > CREASE_DEG) & split) | (ang > ALWAYS_DEG)
    H.append(np.c_[lo[i[crease]], hi[i[crease]]])
    sm = (~crease) & (ang > FLAT_DEG)
    S = np.c_[lo[i[sm]], hi[i[sm]], opp[i[sm]], opp[j[sm]]]
    return V, W, np.concatenate(H).astype(np.int64), S.astype(np.int64)


def fairing_meshes(mod, pivot, n_sides=30):
    """Procedural fairing panels from the craft's XSECTION list (part-local Unity space)."""
    xs = [(float(x.get('h')), float(x.get('r'))) for x in mod.nodesnamed('XSECTION')]
    if len(xs) < 2:
        return []
    xs.sort()
    n_arcs = max(1, int(float(mod.get('nArcs') or 2)))
    capped = (mod.get('isCapped') or 'True').strip().lower() == 'true'
    per = max(2, n_sides // n_arcs)
    out = []
    px, py, pz = pivot
    for arc in range(n_arcs):
        th = np.linspace(2 * math.pi * arc / n_arcs, 2 * math.pi * (arc + 1) / n_arcs, per + 1)
        for k in range(len(xs) - 1):                   # one band per section pair: joints keep their own normals
            (h0, r0), (h1, r1) = xs[k], xs[k + 1]
            ring0 = np.c_[px + r0 * np.cos(th), np.full_like(th, py + h0), pz + r0 * np.sin(th)]
            ring1 = np.c_[px + r1 * np.cos(th), np.full_like(th, py + h1), pz + r1 * np.sin(th)]
            v = np.r_[ring0, ring1]
            slope = math.atan2(r0 - r1, h1 - h0)
            nrm = np.c_[np.cos(th) * math.cos(slope), np.full_like(th, math.sin(slope)), np.sin(th) * math.cos(slope)]
            nrm = np.r_[nrm, nrm]
            m = per + 1
            tris = []
            for q in range(per):
                tris += [(q, q + 1, m + q + 1), (q, m + q + 1, m + q)]
            out.append((v, np.array(tris, np.int64), nrm, 'fairing'))
        if capped and xs[-1][1] > 1e-3:
            h, r = xs[-1]
            ring = np.c_[px + r * np.cos(th), np.full_like(th, py + h), pz + r * np.sin(th)]
            v = np.r_[ring, [[px, py + h, pz]]]
            c = len(ring)
            tris = [(q, c, q + 1) for q in range(per)]
            out.append((v, np.array(tris, np.int64), np.tile([0, 1, 0], (len(v), 1)).astype(float), 'fairingcap'))
    return out
