import os, re
from cfgnode import parse, vec

def part_name(s):
    # "KK.F9demo.S1FT_4252328723" -> "KK.F9demo.S1FT"
    return re.sub(r'_\d+$', '', s.strip())

def load_craft(path):
    root = parse(open(path, encoding='utf-8', errors='replace').read())
    ship = root.get('ship', os.path.basename(path))
    parts = []
    for p in root.nodesnamed('PART'):
        rec = {
            'id': p.get('part'), 'name': part_name(p.get('part')),
            'pos': vec(p.get('pos'), 3), 'rot': vec(p.get('rot'), 4),
            'istg': int(p.get('istg', '-1') or -1), 'dstg': int(p.get('dstg', '0') or 0),
            'variant': None, 'b9': {}, 'modules': p.nodesnamed('MODULE'),
            'links': p.getall('link'), 'sym': p.getall('sym'), 'srfN': p.get('srfN'), 'attN': p.getall('attN'),
        }
        for m in rec['modules']:
            mn = m.get('name')
            if mn == 'ModulePartVariants':
                rec['variant'] = m.get('selectedVariant')
            elif mn == 'ModuleB9PartSwitch':
                rec['b9'][m.get('moduleID') or ''] = m.get('currentSubtype')
        parts.append(rec)
    return ship, parts
