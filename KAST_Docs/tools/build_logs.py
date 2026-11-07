#!/usr/bin/env python3
"""Build the KAST Docs flight log index.

Reads the per-flight logs written by the Kestrel kOS scripts:
    Ships/Script/logs/flights/<FID>_ascent.csv    second stage (whole ascent)
    Ships/Script/logs/flights/<FID>_booster.csv   first stage return (FMRS replay)
plus hand-kept details in KAST_Docs/data/flights_meta.json, and writes
KAST_Docs/data/logs.js, which the site loads.

Run it after every flight (Management does this in the debrief):
    python KAST_Docs/tools/build_logs.py
Standard library only. Safe to run again: it rebuilds the whole index.
"""
import csv, datetime, io, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DOCS = os.path.dirname(HERE)                      # KAST_Docs
ROOT = os.path.dirname(DOCS)                      # Kerbal Space Program
FLIGHTS = os.path.join(ROOT, 'Ships', 'Script', 'logs', 'flights')
META = os.path.join(DOCS, 'data', 'flights_meta.json')
OUT = os.path.join(DOCS, 'data', 'logs.js')
MAX_POINTS = 450

ASCENT_LABELS = {
    'pad': 'On the pad', 'ignition': 'Ignition', 'booster': 'Liftoff, first stage burn', 'MECO': 'MECO',
    'upper stage': 'Stage separation, second stage burn', 'coast': 'Coast', 'circularize': 'Circularization burn',
    'parked': 'In orbit',
}
BOOSTER_LABELS = {
    'flip': 'Flip toward KSC', 'boostback': 'Boostback burn', 'coast': 'Coast', 'entry': 'Entry burn',
    'glide': 'Grid-fin glide', 'landing': 'Landing burn', 'down': 'Touchdown', 'out of fuel': 'Out of fuel',
}
BAND_NAMES = {'booster': 'Stage 1', 'upper stage': 'Stage 2', 'coast': 'Coast', 'circularize': 'Circ.',
              'flip': 'Flip', 'boostback': 'Boostback', 'entry': 'Entry', 'glide': 'Glide', 'landing': 'Landing'}


def num(v):
    try:
        f = float(v)
        return int(f) if f.is_integer() and abs(f) > 50 else round(f, 4)
    except (TypeError, ValueError):
        return v


def read_log(path):
    """Rows as dicts (the last header wins), plus any free-text lines such as 'landed 12 m from target'."""
    header, rows, extra = None, [], []
    with open(path, encoding='utf-8', errors='replace') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            if line.startswith('t,'):
                header, rows = line.split(','), []      # a new header starts a fresh run
                continue
            parts = line.split(',')
            if header and len(parts) == len(header):
                rows.append({k: num(v) for k, v in zip(header, parts)})
            else:
                extra.append(line)
    return rows, extra


def downsample(rows):
    if len(rows) <= MAX_POINTS:
        return rows
    step = len(rows) / MAX_POINTS
    keep = {int(i * step) for i in range(MAX_POINTS)} | {len(rows) - 1}
    for i in range(1, len(rows)):                 # always keep phase changes
        if rows[i].get('phase') != rows[i - 1].get('phase'):
            keep.add(i)
    return [r for i, r in enumerate(rows) if i in keep]


def columns(rows, names):
    out = {}
    for n in names:
        if rows and n in rows[0]:
            out[n] = [r.get(n) for r in rows]
    return out


def phases(rows, labels, src, speed_key):
    events, bands, prev, start = [], [], None, None
    for r in rows:
        ph = r.get('phase')
        if ph != prev:
            if prev is not None and prev in BAND_NAMES:
                bands.append({'from': start, 'to': r['t'], 'label': BAND_NAMES[prev]})
            events.append({'t': r['t'], 'src': src, 'phase': ph, 'label': labels.get(ph, str(ph).capitalize()),
                           'alt': r.get('alt'), 'v': r.get(speed_key)})
            prev, start = ph, r['t']
    if rows and prev in BAND_NAMES:
        bands.append({'from': start, 'to': rows[-1]['t'], 'label': BAND_NAMES[prev]})
    return events, bands


def build_flight(fid, meta):
    entry = {'fid': fid}
    a_path = os.path.join(FLIGHTS, fid + '_ascent.csv')
    b_path = os.path.join(FLIGHTS, fid + '_booster.csv')
    events, summary = [], {}

    if os.path.exists(a_path):
        rows, _ = read_log(a_path)
        if rows:
            ev, bands = phases(rows, ASCENT_LABELS, 'ascent', 'v')
            events += ev
            ds = downsample(rows)
            a = columns(ds, ['t', 'alt', 'ap', 'pe', 'v', 'pitch', 'lat', 'lng'])
            a['bands'] = bands
            entry['ascent'] = a
            summary['max_alt'] = max(r['alt'] for r in rows if isinstance(r.get('alt'), (int, float)))
            sep = next((r for r in rows if r.get('phase') == 'upper stage'), None)
            if sep:
                summary['sep'] = {'t': sep['t'], 'alt': sep['alt'], 'v': sep['v']}
            burn = [r for r in rows if r.get('phase') == 'upper stage']
            if burn:
                summary['seco'] = {'t': burn[-1]['t'], 'alt': burn[-1]['alt']}
            last = rows[-1]
            if last.get('phase') in ('parked', 'circularize', 'coast') and isinstance(last.get('pe'), (int, float)) and last['pe'] > 0:
                summary['final_ap'], summary['final_pe'] = last['ap'], last['pe']

    if os.path.exists(b_path):
        rows, extra = read_log(b_path)
        landed = next((x for x in extra if x.startswith('landed')), None)
        if rows:
            ev, bands = phases(rows, BOOSTER_LABELS, 'booster', 'gs')
            events += ev
            ds = downsample(rows)
            b = columns(ds, ['t', 'alt', 'vs', 'gs', 'lf', 'miss_m', 'lat', 'lng'])
            b['bands'] = bands
            if landed:
                m = re.match(r'landed (\d+) m from target, LF (\d+)', landed)
                b['landed'] = ('Landed %s m from the target, %s liquid fuel left.' % m.groups()) if m else landed
                b['result'] = 'Landed, %s m off' % m.group(1) if m else 'Landed'
            else:
                b['result'] = 'No touchdown logged'
            entry['booster'] = b
        else:
            entry['booster'] = {'result': 'Script started, no flight data'}

    if meta.get('booster_result'):
        entry.setdefault('booster', {})['result'] = meta['booster_result']
    events.sort(key=lambda e: (e['t'] if isinstance(e['t'], (int, float)) else 0))
    entry['events'] = [e for e in events if e['phase'] not in ('pad',)]
    entry['summary'] = summary
    for k in ('number', 'date', 'mission', 'vehicle', 'outcome', 'result', 'notes'):
        if k in meta:
            entry[k] = meta[k]
    return entry


def main():
    if not os.path.isdir(FLIGHTS):
        print('No flight logs folder yet:', FLIGHTS)
        flights = []
    else:
        flights = sorted({f.split('_')[0] for f in os.listdir(FLIGHTS) if re.match(r'F\d+_(ascent|booster)\.csv$', f)},
                         key=lambda f: int(f[1:]))
    meta = {}
    if os.path.exists(META):
        with open(META, encoding='utf-8') as f:
            meta = json.load(f)
    current = {}
    cur_path = os.path.join(FLIGHTS, 'current.json')
    if os.path.exists(cur_path):          # kOS writejson format: a lexicon of key/value entries
        try:
            with open(cur_path, encoding='utf-8') as f:
                ent = json.load(f).get('entries', [])
            current = {ent[i]['value']: ent[i + 1]['value'] for i in range(0, len(ent) - 1, 2)}
        except (ValueError, KeyError, IndexError, TypeError):
            current = {}

    def has_data(fid):                  # skip aborted or just-started launches (header only)
        for kind in ('ascent', 'booster'):
            pth = os.path.join(FLIGHTS, fid + '_' + kind + '.csv')
            if os.path.exists(pth) and read_log(pth)[0]:
                return True
        return False
    flights = [f for f in flights if has_data(f)]
    next_no = max([m.get('number', 0) for m in meta.values()] + [0]) + 1
    changed = False
    for fid in flights:
        if fid not in meta:                # a new flight: give it a number and the basics
            path = os.path.join(FLIGHTS, fid + '_ascent.csv')
            when = datetime.datetime.fromtimestamp(os.path.getmtime(path if os.path.exists(path) else FLIGHTS))
            ship = current.get('ship', '') if current.get('fid') == fid else ''
            meta[fid] = {'number': next_no, 'date': when.strftime('%Y-%m-%d'),
                         'mission': ship.replace('KAST ', '').split(' on ')[0] if ship else 'Kestrel flight',
                         'vehicle': 'LV-5 Kestrel', 'outcome': 'Not reviewed yet', 'notes': ''}
            next_no += 1
            changed = True
    if changed:
        with open(META, 'w', encoding='utf-8') as f:
            json.dump(meta, f, indent=2)

    logs = [build_flight(fid, meta.get(fid, {})) for fid in flights if not meta.get(fid, {}).get('sim')]
    with io.open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write('/* Written by tools/build_logs.py on %s. Do not edit by hand: change data/flights_meta.json and rebuild. */\n'
                % datetime.datetime.now().strftime('%Y-%m-%d %H:%M'))
        f.write('KAST.setLogs(' + json.dumps(logs, separators=(',', ':')) + ');\n')
    print('Indexed %d flight(s) into %s' % (len(logs), OUT))
    for l in logs:
        print('  #%s %s %s: %s' % (l.get('number'), l['fid'], l.get('mission'), l.get('outcome')))
    build_telemetry(meta)


# ---------------- Booster telemetry (every booster run, sim and real) ----------------
LOGS = os.path.dirname(FLIGHTS)                       # Ships/Script/logs
SIM_LOG = os.path.join(LOGS, 'kestrel_booster.csv')   # Booster Sim runs (and older flights) append here
TELE_OUT = os.path.join(DOCS, 'data', 'telemetry.js')
LZ = (-0.0972, -74.5577)                              # KSC pad
KERBIN_R = 600000.0


def split_runs(path):
    """A booster log can hold many runs: each header line starts a new one."""
    runs, header, rows, extra = [], None, [], []
    def close():
        if header and len(rows) >= 10:
            runs.append((header, rows[:], extra[:]))
    with open(path, encoding='utf-8', errors='replace') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            if line.startswith('t,'):
                close()
                header, rows, extra = line.split(','), [], []
                continue
            parts = line.split(',')
            if header and len(parts) == len(header):
                rows.append({k: num(v) for k, v in zip(header, parts)})
            else:
                extra.append(line)
    close()
    return runs


def downrange(lat, lng):
    """Signed distance from the pad along the east-west line, metres. Positive = west of the pad (past it on
    a return from the east), negative = east (short). Plus the plain distance."""
    import math
    dx = math.radians(LZ[1] - lng) * math.cos(math.radians(lat)) * KERBIN_R
    dy = math.radians(lat - LZ[0]) * KERBIN_R
    return dx, math.hypot(dx, dy)


def build_run(rid, label, source, header, rows, extra):
    ds = downsample(rows)
    out = {'id': rid, 'label': label, 'source': source}
    out.update(columns(ds, ['t', 'alt', 'vs', 'gs', 'lf', 'throttle', 'lat', 'lng', 'ip_lat', 'ip_lng']))
    ev, bands = phases(rows, BOOSTER_LABELS, 'booster', 'gs')
    out['bands'], out['events'] = bands, ev
    if 'ip_lat' in out:
        out['ip_dr'] = [round(downrange(a, b)[0]) if isinstance(a, (int, float)) and (a or b) else None
                        for a, b in zip(out['ip_lat'], out['ip_lng'])]
    if 'lat' in out:
        out['pos_dist'] = [round(downrange(a, b)[1]) for a, b in zip(out['lat'], out['lng'])]
    # fuel used by each phase
    fuel, prev = [], None
    for r in rows:
        if r.get('phase') != prev:
            fuel.append({'phase': BOOSTER_LABELS.get(r.get('phase'), r.get('phase')), 'start': r.get('lf'), 'end': r.get('lf')})
            prev = r.get('phase')
        fuel[-1]['end'] = r.get('lf')
    out['fuel'] = fuel
    last = rows[-1]
    landed = next((x for x in extra if x.startswith('landed')), None)
    m = re.match(r'landed (\d+) m from target, LF (\d+)', landed or '')
    if m:
        out['result'] = 'Landed %s m from the pad, %s fuel left' % m.groups()
        out['miss_final'] = int(m.group(1))
    elif last.get('phase') == 'landing' and isinstance(last.get('radar'), (int, float)) and last['radar'] < 10 and abs(last.get('vs') or 0) < 3:
        d = downrange(last['lat'], last['lng'])[1] if 'lat' in last else None
        out['result'] = 'Touched down %s m from the pad, %s fuel left' % (round(d) if d else '?', last.get('lf'))
        out['miss_final'] = round(d) if d else None
    else:
        out['result'] = 'Log ends in %s at %s m (no touchdown logged)' % (BOOSTER_LABELS.get(last.get('phase'), last.get('phase')), last.get('alt'))
    if 'ip_lat' in rows[0]:
        g = [r for r in rows if r.get('phase') == 'glide' and isinstance(r.get('ip_lat'), (int, float))]
        if g:
            out['glide_in'] = round(downrange(g[0]['ip_lat'], g[0]['ip_lng'])[0])
            out['glide_out'] = round(downrange(g[-1]['ip_lat'], g[-1]['ip_lng'])[0])
    return out


TELE_META = os.path.join(DOCS, 'data', 'telemetry_meta.json')   # hand-kept notes per run id


def build_telemetry(meta):
    runs = []
    notes = {}
    if os.path.exists(TELE_META):
        with open(TELE_META, encoding='utf-8') as f:
            notes = json.load(f)
    n = 0
    if os.path.exists(SIM_LOG):
        for header, rows, extra in split_runs(SIM_LOG):
            n += 1
            runs.append(build_run('sim%d' % n, 'Booster Sim run %d' % n, 'KAST Booster Sim', header, rows, extra))
    if os.path.isdir(FLIGHTS):
        for f in sorted(os.listdir(FLIGHTS)):
            mm = re.match(r'(F\d+)_booster\.csv$', f)
            if not mm:
                continue
            for header, rows, extra in split_runs(os.path.join(FLIGHTS, f)):
                fm = meta.get(mm.group(1), {})
                if fm.get('sim'):      # practice launch in the Booster Sim save
                    n += 1
                    runs.append(build_run('sim%d' % n, 'Booster Sim run %d' % n, 'KAST Booster Sim', header, rows, extra))
                else:
                    runs.append(build_run(mm.group(1), 'Flight %s booster' % fm.get('number', '?'), 'Flight', header, rows, extra))
    for r in runs:
        if r['id'] in notes:
            r.update(notes[r['id']])
    with io.open(TELE_OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write('/* Written by tools/build_logs.py on %s. Booster telemetry, one entry per run. */\n'
                % datetime.datetime.now().strftime('%Y-%m-%d %H:%M'))
        f.write('KAST.setTelemetry(' + json.dumps({'built': datetime.datetime.now().strftime('%Y-%m-%d %H:%M'), 'pad': LZ, 'runs': runs}, separators=(',', ':')) + ');\n')
    print('Telemetry: %d booster run(s) into %s' % (len(runs), TELE_OUT))
    tl = os.path.join(LOGS, 'trajlog.txt')          # plain-text trajectory log written by kestrel_booster.ks
    if os.path.exists(tl):
        import shutil
        shutil.copyfile(tl, os.path.join(DOCS, 'data', 'trajlog.txt'))
        print('Copied trajlog.txt for the site')


if __name__ == '__main__':
    main()
