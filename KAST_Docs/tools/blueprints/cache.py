import pickle, os
from cfgnode import parse
KSP = os.environ.get('KSP_ROOT', '/mnt/user-data/uploads/Kerbal Space Program')
CACHE = os.path.join(KSP, 'GameData', 'ModuleManager.ConfigCache')
def load_parts(names):
    want = set(names)
    out = {}
    root = parse(open(CACHE, encoding='utf-8', errors='replace').read())
    for uc in root.nodesnamed('UrlConfig'):
        url = uc.get('parentUrl') or ''
        for p in uc.nodesnamed('PART'):
            n = (p.get('name') or '').replace('_', '.')
            if n in want:
                out[n] = (url, p)
    return out
