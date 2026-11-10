"""Build the KAST blueprint data from the game files.

  KSP_ROOT=".../Kerbal Space Program" python build.py KAST_Docs/data/blueprints

Reads each craft in CRAFTS (saves/Horizon/Ships/VAB), the parts' configs from GameData/ModuleManager.ConfigCache
and their .mu models, and writes per craft <slug>.json (meshes, parts, instances) and <slug>.bin (each unique
part mesh once: int16 vertices, uint16/uint32 triangles, crease edges and outline-candidate edges).
Unity (left-handed) is converted to three.js: position (x, y, -z), quaternion (-x, -y, z, w), vertices z -> -z.
"""
import os, sys, json, pickle, hashlib, glob, re
import numpy as np
from craft import load_craft
from assemble import part_geometry, rescale_factor
from geom import process, fairing_meshes
from cfgnode import vec

OUT = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/bp/out'
KSP = os.environ.get('KSP_ROOT', '/mnt/user-data/uploads/Kerbal Space Program')
VAB = os.path.join(KSP, 'saves', 'Horizon', 'Ships', 'VAB')
CRAFTS = [
    ('junction', 'KAST Horizon Junction on Kestrel - F9 RCS - RX-55 control'),
    ('harrier', 'KAST LV-2 Harrier (Atlas V 421) - launcher only'),
    ('condor', 'KAST LV-3 Condor (Titan III) - launcher only'),
    ('roc', 'KAST LV-4 Roc (Atlas V Heavy) - launcher only'),
    ('station', 'KAST Horizon Station - complete (ISS-style reference)'),
]

def _load_parts():
    from cache import load_parts
    names = set()
    for _, name in CRAFTS:
        names |= {p['name'] for p in load_craft(os.path.join(VAB, name + '.craft'))[1]}
    return load_parts(names)


parts_cfg = _load_parts()


def system_of(p):
    mods = {m.get('name') or '' for m in p.nodesnamed('MODULE')}
    res = {r.get('name') for r in p.nodesnamed('RESOURCE')}
    has = lambda *names: any(any(n in m for n in names) for m in mods)
    crew = int(float(p.get('CrewCapacity') or 0))
    tank = any(m.get('name') == 'ModuleB9PartSwitch' and float(m.get('baseVolume') or 0) > 0
               and any(s.get('tankType') for s in m.nodesnamed('SUBTYPE')) for m in p.nodesnamed('MODULE'))
    if has('LaunchClamp'): return 'ground'
    if has('ModuleEngines'): return 'engines'
    if has('ModuleRCS'): return 'rcs'
    if has('ModuleDockingNode'): return 'docking'
    if crew > 0: return 'crew'
    if has('ModuleControlSurface'): return 'aero'
    if has('ModuleWheelSuspension', 'ModuleWheelDeployment') or 'landing leg' in (p.get('title') or '').lower(): return 'landing'
    if has('ModuleCommand', 'kOSProcessor', 'ModuleReactionWheel'): return 'command'
    if has('ModuleScienceExperiment', 'DMModuleScience', 'ModuleScienceLab', 'ModuleEnviroSensor', 'HullCam', 'MuMechModuleHullCamera', 'ModuleDataTransmitter'): return 'science'
    if has('ModuleDeployableSolarPanel', 'ModuleGenerator', 'ModuleActiveRadiator', 'ModuleDeployableRadiator', 'ModuleSystemHeatRadiator'): return 'power'
    if has('ModuleProceduralFairing'): return 'fairing'
    if has('ModuleDecouple', 'ModuleAnchoredDecoupler'): return 'separation'
    if tank or res & {'LiquidFuel', 'Oxidizer', 'MonoPropellant', 'SolidFuel', 'LqdHydrogen'}: return 'propellant'
    if has('ModuleLiftingSurface', 'ModuleControlSurface'): return 'aero'
    if 'ElectricCharge' in res: return 'power'
    return 'structure'


def fairing_mod(cp):
    for m in cp['modules']:
        if m.get('name') == 'ModuleProceduralFairing':
            return m
    return None


def part_key(cp):
    h = [cp['name'], str(cp['variant']), json.dumps(sorted(cp['b9'].items()))]
    attached = sorted(a.split(',')[0] for a in cp['attN'] if ',' in a and not a.split(',')[1].strip().startswith('Null'))
    h.append(','.join(x for x in attached if x.startswith('interstage')))
    fm = fairing_mod(cp)
    if fm is not None:
        h.append(json.dumps([(x.get('h'), x.get('r')) for x in fm.nodesnamed('XSECTION')]) + str(fm.get('nArcs')) + str(fm.get('isCapped')))
    return hashlib.sha1('|'.join(h).encode()).hexdigest()[:12]


def build_part(cp):
    """(main geometry, fairing shell geometry or None, hidden transform names)"""
    url, node = parts_cfg[cp['name']]
    meshes, hidden = part_geometry(url, node, cp)
    shell = []
    fm = fairing_mod(cp)
    if fm is not None:
        for m in node.nodesnamed('MODULE'):
            if m.get('name') == 'ModuleProceduralFairing':
                rf = rescale_factor(node)
                piv = np.array(vec(m.get('pivot') or '0,0,0', 3)) * rf
                shell = fairing_meshes(fm, piv, int(float(m.get('nSides') or 24)))
    return process(meshes), (process(shell) if shell else None), hidden


def pack_mesh(g, part):
    v = g['v'].copy()
    v[:, 2] *= -1                                          # Unity -> three.js
    lo, hi = v.min(0), v.max(0)
    c = (lo + hi) / 2
    e = np.maximum((hi - lo) / 2, 1e-4)
    q = np.round((v - c) / e * 32767).clip(-32767, 32767).astype('<i2')
    it = '<u2' if len(v) < 65536 else '<u4'
    return {'part': part, 'nv': len(v), 'it': 'u16' if it == '<u2' else 'u32',
            'c': [round(float(x), 5) for x in c], 'e': [round(float(x), 5) for x in e],
            'arrays': [q, g['t'].astype(it), g['h'].astype(it), g['s'].astype(it)],
            'nt': len(g['t']), 'nh': len(g['h']), 'ns': len(g['s'])}


def main():
    os.makedirs(OUT, exist_ok=True)
    lib, report, index = {}, {}, []
    seen_lists = set()
    for slug, name in CRAFTS:
        ship, cps = load_craft(os.path.join(VAB, name + '.craft'))
        sig = tuple(sorted(p['name'] for p in cps))
        assert sig not in seen_lists, 'duplicate craft ' + name
        seen_lists.add(sig)
        dst = sorted({int(p['dstg']) for p in cps}, reverse=True)
        blob, meshes, local = bytearray(), [], {}
        insts, plist = [], []
        for cp in cps:
            key = part_key(cp)
            if key not in lib:
                g, sh, hidden = build_part(cp)
                report[cp['name']] = sorted(hidden)
                lib[key] = pack_mesh(g, cp['name']) if g is not None else None
                lib[key + 's'] = pack_mesh(sh, cp['name']) if sh is not None else None
            for k2 in (key, key + 's'):
                if lib[k2] is not None and k2 not in local:
                    rec = dict(lib[k2]); arrays = rec.pop('arrays')
                    if k2.endswith('s'):
                        rec['shell'] = 1
                    for k, a in zip('vths', arrays):
                        while len(blob) % 4:
                            blob.append(0)
                        rec[k] = len(blob)
                        blob.extend(a.tobytes())
                    local[k2] = len(meshes)
                    meshes.append(rec)
            url, node = parts_cfg[cp['name']]
            x, y, z = cp['pos']
            qx, qy, qz, qw = cp['rot']
            plist.append({'n': node.get('title') or cp['name'], 'id': cp['name'], 'sys': system_of(node),
                          'g': dst.index(int(cp['dstg']))})
            for k2 in (key, key + 's'):
                if k2 in local:
                    insts.append([local[k2], round(x, 5), round(y, 5), round(-z, 5),
                                  round(-qx, 6), round(-qy, 6), round(qz, 6), round(qw, 6), len(plist) - 1])
        open(os.path.join(OUT, slug + '.bin'), 'wb').write(bytes(blob))
        doc = {'v': 1, 'slug': slug, 'name': ship, 'bin': slug + '.bin', 'bytes': len(blob),
               'meshes': meshes, 'parts': plist, 'inst': insts, 'groups': len(dst)}
        json.dump(doc, open(os.path.join(OUT, slug + '.json'), 'w'), separators=(',', ':'))
        index.append({'slug': slug, 'name': ship, 'parts': len(cps), 'bytes': len(blob)})
        print(slug, len(cps), 'parts', len(meshes), 'meshes', len(blob) // 1024, 'KB',
              'tris', sum(m['nt'] for m in meshes), 'hard', sum(m['nh'] for m in meshes), 'soft', sum(m['ns'] for m in meshes))
    json.dump({'v': 1, 'crafts': index}, open(os.path.join(OUT, 'index.json'), 'w'), indent=1)
    json.dump(report, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'hidden_report.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
