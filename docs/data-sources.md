# Data sources

Every source is keyless and sends `Access-Control-Allow-Origin`, so the
browser calls it directly. Last checked with `npm run check-sources`:
**2026-10-28**, all 18 passing. Adding a source means adding its host to the
CSP in `web/index.html` and `server/server.json`.

| Source | Endpoint | Used for | Coverage | License / terms | Limits |
|---|---|---|---|---|---|
| Open-Meteo Forecast | `api.open-meteo.com/v1/forecast` | Current, 15-min, hourly, daily, UV; the map's favorites (all in one request) | Global | CC BY 4.0; free for non-commercial use | ~10k calls/day, 5k/h, 600/min per IP |
| Open-Meteo Air Quality | `air-quality-api.open-meteo.com/v1/air-quality` | AQI, pollutants, pollen | Global; pollen Europe only | CC BY 4.0 (CAMS data) | as above |
| Open-Meteo Marine | `marine-api.open-meteo.com/v1/marine` | Waves, sea temperature | Seas | CC BY 4.0 | as above |
| Open-Meteo Geocoding | `geocoding-api.open-meteo.com/v1/search` | Type-ahead search | Global (GeoNames) | CC BY 4.0 | as above |
| Photon (Komoot) | `photon.komoot.io/api`, `/reverse` | Address search, "my location" names | Global (OSM) | ODbL data; fair use | be polite |
| Nominatim | `nominatim.openstreetmap.org/reverse` | Reverse fallback only | Global (OSM) | ODbL; [usage policy](https://operations.osmfoundation.org/policies/nominatim/): no autocomplete, 1 req/s | once per tap, sent with a Referer |
| NWS | `api.weather.gov/alerts/active?point=`, `/points`, `/stations/…/observations`, `/products/types/AFD` | US warnings, station readings, forecast discussion | US + territories | Public domain | none stated |
| ECCC MSC GeoMet | `api.weather.gc.ca/collections/weather-alerts`, `swob-realtime` | Canadian warnings, station readings | Canada | Open Government Licence – Canada | none stated |
| Bright Sky (DWD) | `api.brightsky.dev/alerts`, `/current_weather` | German warnings, station readings | Germany | DWD open data; Bright Sky MIT | none stated |
| GSI reverse geocoder | `mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress` | Municipality code for JMA | Japan | GSI terms | undocumented |
| JMA bosai | `www.jma.go.jp/bosai/warning/data/warning/<office>.json` | Japanese warnings | Japan | JMA website terms; **undocumented** | best effort |
| HKO Open Data | `data.weather.gov.hk/weatherAPI/opendata/weather.php` | Hong Kong warning signals | Hong Kong | HKO open data terms | none stated |
| GDACS | `www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH` | Major disasters (cyclones, floods, droughts, volcanoes, fires) | Global | GDACS terms (attribution) | none stated |
| NOAA SWPC | `services.swpc.noaa.gov/json/ovation_aurora_latest.json` | Aurora chance | Global grid (~1 MB, fetched only at |lat| ≥ 50°) | Public domain | none stated |
| RainViewer | `api.rainviewer.com/public/weather-maps.json`, `tilecache.rainviewer.com` | Radar loop (last 2 h, 13 frames) | Where radar exists | RainViewer terms (attribution); free tier shrinking | zoom ≤ 7 used |
| NASA GIBS | `gibs.earthdata.nasa.gov/wmts/epsg3857/best/…` | Radar card's base map | Global | Public (NASA EOSDIS); OSM layers ODbL | none stated |
| Self-hosted | `web/data/jma-areas-v1.json` | JMA municipality → office | Japan | from JMA's area.json | — |
| Self-hosted | `web/data/world-110m-v1.json` (`scripts/make-world-map.mjs`) | The map's land and borders | Global | Natural Earth, public domain | — |

Each place's data is cached in `localStorage` with its fetch time
(`state/cache.js`) and refreshed when stale: forecast 10 min, warnings
5 min, air quality and aurora 30 min, marine 1 h (30 days when a place
has no sea), station readings 10 min, the NWS discussion 1 h. The radar
list follows RainViewer's own schedule instead (`nextRadarCheck` in
`api/extras.js`): 90 seconds after each new 10-minute frame is due, then
every minute until it appears (every 5 once it's over 10 minutes late).

Not available: pollen outside Europe, measured air
quality, warnings for most of Europe (MeteoAlarm, the Met Office and AEMET
send no CORS headers), station readings outside the US/Canada/Germany,
lightning.
