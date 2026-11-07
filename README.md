# KAST Docs (published copy)

This folder is a Git repository that mirrors `KAST_Docs` and the kOS flight logs (`Ships/Script/logs`)
from the KSP install. Do not edit files here: edit `KAST_Docs` in the KSP folder instead.

`KAST_Tools/Publish_KAST_Site.ps1` copies the latest files in and pushes them. On every push GitHub runs
`.github/workflows/pages.yml`, which rebuilds the flight index and booster telemetry and publishes the site.
