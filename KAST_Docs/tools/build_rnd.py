#!/usr/bin/env python3
"""Builds data/rnd.js for the R&D page from a snapshot of the career save.

Input: rnd_raw.json, made on the PC from GameData/ModuleManager.TechTree (nodes, costs, positions,
parents), GameData/ModuleManager.ConfigCache (parts per node) and saves/Horizon/persistent.sfs
(researched nodes, science on hand, game clock).

Time estimates use the career's own pace: all science earned so far (spent on researched nodes plus
science on hand) divided by the days elapsed. A node's estimate is the science still needed for it and
every prerequisite not yet researched, less the science on hand, at that pace.
"""
import json, re, sys, datetime

src = sys.argv[1] if len(sys.argv) > 1 else 'rnd_raw.json'
out = sys.argv[2] if len(sys.argv) > 2 else 'data/rnd.js'
d = json.load(open(src))
nodes = {n['id']: n for n in d['nodes'] if n['id']}
done = set(d['researched'])
parts = d.get('parts', {})
sci = d['sci']
days = d['ut'] / 86400.0  # the save uses the 24-hour Earth calendar

earned = sum(nodes[i]['cost'] for i in done if i in nodes) + sci
rate = earned / max(1.0, days)  # science per day

memo = {}
def closure(i, seen=()):
    """Unresearched nodes needed to unlock i (cheapest parent when any one parent is enough)."""
    if i in done or i not in nodes: return frozenset()
    if i in memo: return memo[i]
    n = nodes[i]; ps = [p for p in n['parents'] if p in nodes and p not in seen]
    if not ps: req = frozenset()
    elif n['any'].lower() == 'true':
        opts = [closure(p, seen + (i,)) for p in ps]
        req = min(opts, key=lambda s: sum(nodes[x]['cost'] for x in s))
    else:
        req = frozenset().union(*[closure(p, seen + (i,)) for p in ps])
    memo[i] = req | {i}
    return memo[i]

def state(i):
    if i in done: return 'done'
    n = nodes[i]; ps = [p for p in n['parents'] if p in nodes]
    ok = [p in done for p in ps]
    if not ps or (any(ok) if n['any'].lower() == 'true' else all(ok)): return 'open'
    return 'locked'

SPACEX = re.compile(r'^(KK|SEP)[._]')
# KAST write-ups for the nodes that matter to the program
MILESTONES = [
    ('specializedControl', 'Booster RCS',
     'F9 Demo S1 RCS System: 18 kN thrusters that burn the booster\'s own fuel and oxidizer, no monopropellant. '
     'The Kestrel S1 RCS variant is already built around them; this node makes them official in the career.'),
    ('advMetalworks', 'Full-size Falcon 9',
     'Falcon 9 v1.0, v1.1 and v1.1 FT tanks and interstages, the Octaweb and the Falcon 9 flight computer. '
     'The step from the Kestrel demonstrator to a production-scale reusable launcher.'),
    ('precisionPropulsion', 'Falcon Heavy',
     'The Falcon Heavy core separator and side-booster attach hardware: three Kestrel-class cores flying together, '
     'with two boosters returning to the pad.'),
    ('highPerformanceFuelSystems', 'Super-heavy tankage',
     'The ITS booster fuel tank, the first piece of a super-heavy lift vehicle.'),
    ('experimentalAerodynamics', 'Behemoth grid fins',
     'Grid fins sized for the Behemoth super-heavy booster, needed to steer it home.'),
    ('veryHeavyRocketry', 'Raptor and Starship',
     'Raptor engines (sea level and vacuum), the ITS engine clusters and the Starship Expansion Project vehicles: '
     'Behemoth boosters with 33-engine clusters and Donnager ships. The program\'s long-range goal.'),
]

def node_out(i):
    n = nodes[i]
    pl = parts.get(i, [])
    sx = [p for p in pl if SPACEX.match(p[0])]
    notable = (sx + [p for p in pl if p[3] and p not in sx] + [p for p in pl if p not in sx and not p[3]])[:10]
    need = closure(i); need_cost = sum(nodes[x]['cost'] for x in need)
    eta = None if i in done else max(0.0, need_cost - sci) / rate if rate > 0 else None
    return {
        'id': i, 'title': n['title'], 'desc': n['desc'], 'cost': n['cost'], 'x': n['x'], 'y': n['y'],
        'parents': [p for p in n['parents'] if p in nodes], 'any': n['any'].lower() == 'true',
        'state': state(i), 'parts': len(pl), 'spacex': len(sx), 'notable': [p[1] for p in notable],
        'need': sorted(need, key=lambda x: nodes[x]['x']), 'needCost': need_cost,
        'eta': None if eta is None else round(eta, 1)
    }

keep = [i for i, n in nodes.items() if i == 'start' or parts.get(i) or i in done]
data = {
    'asOf': datetime.date.today().isoformat(),
    'science': round(sci, 1), 'earned': round(earned, 1), 'days': round(days, 1), 'rate': round(rate, 2),
    'researched': len([i for i in keep if i in done]), 'total': len(keep),
    'nodes': [node_out(i) for i in keep],
    'milestones': [{'id': i, 'name': name, 'text': text} for i, name, text in MILESTONES if i in nodes],
}
with open(out, 'w') as f:
    f.write('/* R&D snapshot of the Horizon career, written by tools/build_rnd.py. */\n')
    f.write('KAST.setRnd(' + json.dumps(data, separators=(',', ':')) + ');\n')
print('wrote', out, len(data['nodes']), 'nodes; rate', data['rate'], 'science/day over', data['days'], 'days')
for m in data['milestones']:
    n = next(x for x in data['nodes'] if x['id'] == m['id'])
    print(f"  {m['name']:22s} {n['state']:6s} cost {n['cost']:5d} needs {n['needCost']:6d} eta {n['eta']} days")
