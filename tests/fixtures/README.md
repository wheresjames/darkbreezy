# Test fixtures

Answers from the weather services, so the browser tests need no network.

- `recorded/` — real responses, saved by `npm run fixtures` (scripts/record-fixtures.mjs).
- `synthetic/` — hand-written ones, for things that weren't happening on the day they were recorded.

The recorded data belongs to the services that published it. It's kept here only to test
Dark Breezy, under their terms:

| Files | Source | Licence |
|---|---|---|
| `om-*` | Open-Meteo (models from national weather services; air quality: Copernicus CAMS) | CC BY 4.0; contains modified Copernicus Atmosphere Monitoring Service information |
| `nws-*` | NOAA National Weather Service | Public domain |
| `swpc-*` | NOAA Space Weather Prediction Center | Public domain |
| `eccc-*` | Environment and Climate Change Canada | Contains information licensed under the Open Government Licence – Canada |
| `brightsky-*` | Deutscher Wetterdienst, through Bright Sky | Quelle: Deutscher Wetterdienst |
| `jma-*`, `gsi-*` | Japan Meteorological Agency; Geospatial Information Authority of Japan | Government of Japan Standard Terms of Use |
| `hko-*` | Hong Kong Observatory | HKO open data terms |
| `gdacs-*` | GDACS (UN OCHA, European Commission JRC) | GDACS terms |
| `photon-*` | Photon (Komoot), OpenStreetMap data | © OpenStreetMap contributors, ODbL |
| `rainviewer-*` | RainViewer | RainViewer terms |
