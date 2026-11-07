# KAST Docs

Flight plans, the Horizon roadmap and the flight record for KAST, Horizon Space Center.
A plain HTML, CSS and JavaScript site that runs straight from this folder: no server, no internet.

## Open it

Double-click **Open KAST Docs.bat** (or `index.html`). Bookmark it in your browser.

## What's where

| Path | What it is |
| --- | --- |
| `index.html` | The page shell |
| `css/kast.css` | All styling (KAST navy and gold, Bahnschrift headings) |
| `js/app.js` | Pages, the mission chart and the step panel |
| `js/charts.js` | Trajectory charts and ground tracks |
| `data/manifest.js` | The list of files the site loads |
| `data/docs/*.js` | One file per document |
| `data/docs/_template.js` | Copy this to start a new document |
| `data/flights_meta.json` | Hand-kept details per flight: mission, outcome, notes |
| `data/logs.js` | The flight index, written by the builder. Don't edit by hand |
| `tools/build_logs.py` | Builds `data/logs.js` from the kOS flight logs |

## Add a document

1. Copy `data/docs/_template.js` to a new name, for example `data/docs/pathfinder-harrier.js`.
2. Fill it in. Each lane is one row of the chart; each step opens in the side panel.
3. Add the path to `data/manifest.js`.

## Flight logs

Each Kestrel flight writes its own files in `Ships/Script/logs/flights/`:

- `<flight id>_ascent.csv`: second stage, liftoff to orbit (time, phase, altitude, apoapsis, periapsis, speed, pitch, position)
- `<flight id>_booster.csv`: first stage return during the FMRS replay
- `current.json`: which flight is the latest

After a flight, run `python tools/build_logs.py` (Management does this in the debrief), then add the outcome and notes
to `data/flights_meta.json` and run it again. Each flight gets a flight log (summary and event timeline) and a
trajectory log (altitude, speed, pitch and ground track charts) on the Flight logs page.

## Booster telemetry

The **Booster telemetry** page shows every booster run, Booster Sim and real flights: predicted landing point
against the pad, distance, altitude, speed, fuel by phase and ground track. `tools/build_logs.py` builds it from
`Ships/Script/logs/kestrel_booster.csv` (sim runs, one per header line) and `logs/flights/*_booster.csv` into
`data/telemetry.js`. Notes per run go in `data/telemetry_meta.json`.

## Public website (GitHub Pages)

`KAST_Site` (next to this folder) is a Git repository that mirrors this folder and the kOS logs. Set it up once
with `KAST_Tools/Setup_KAST_Site.bat` (or "Set up KAST website.bat" on the Desktop). After that,
Restart KSP.bat starts `KAST_Tools/Publish_KAST_Site.ps1 -Watch`, which pushes changes every 3 minutes while KSP
runs; GitHub rebuilds the logs and republishes the site. `Publish_KAST_Site_Now.bat` publishes immediately.
Edit files here, never in KAST_Site.
