#!/usr/bin/env node
// Checks every data source the app uses (DARKBREEZY.md §3.1): does it
// answer, and does it still send the CORS header a browser needs? Run by
// hand before a release, and after any provider news.
//
//   node scripts/check-sources.mjs
//
// Exits 1 if any source fails. Update the "last checked" dates in
// DARKBREEZY.md / docs/data-sources.md when it passes.

const ORIGIN = 'https://darkbreezy.com';
const SOURCES = [
  ['Open-Meteo forecast', 'https://api.open-meteo.com/v1/forecast?latitude=52.52&longitude=13.41&current=temperature_2m'],
  ['Open-Meteo air quality', 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=52.52&longitude=13.41&current=us_aqi'],
  ['Open-Meteo marine', 'https://marine-api.open-meteo.com/v1/marine?latitude=-33.87&longitude=151.21&current=wave_height'],
  ['Open-Meteo geocoding', 'https://geocoding-api.open-meteo.com/v1/search?name=Berlin&count=1'],
  ['Photon', 'https://photon.komoot.io/reverse?lat=52.52&lon=13.41'],
  ['Nominatim', 'https://nominatim.openstreetmap.org/reverse?lat=52.52&lon=13.41&format=jsonv2'],
  ['NWS alerts', 'https://api.weather.gov/alerts/active?point=40.71,-74.01'],
  ['NWS points', 'https://api.weather.gov/points/40.71,-74.01'],
  ['ECCC alerts', 'https://api.weather.gc.ca/collections/weather-alerts/items?f=json&limit=1'],
  ['ECCC SWOB', 'https://api.weather.gc.ca/collections/swob-realtime/items?f=json&limit=1'],
  ['Bright Sky alerts', 'https://api.brightsky.dev/alerts?lat=52.52&lon=13.41'],
  ['Bright Sky current', 'https://api.brightsky.dev/current_weather?lat=52.52&lon=13.41'],
  ['GSI reverse geocoder', 'https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=35.68&lon=139.69'],
  ['JMA warnings', 'https://www.jma.go.jp/bosai/warning/data/warning/130000.json'],
  ['HKO warnings', 'https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum&lang=en'],
  ['GDACS', 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC&alertlevel=Red'],
  ['SWPC aurora', 'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json'],
  ['RainViewer', 'https://api.rainviewer.com/public/weather-maps.json'],
];

let failed = 0;
const results = await Promise.all(SOURCES.map(async ([name, url]) => {
  try {
    const res = await fetch(url, { headers: { Origin: ORIGIN, 'User-Agent': 'darkbreezy.com source check' }, signal: AbortSignal.timeout(20000) });
    const cors = res.headers.get('access-control-allow-origin');
    const ok = res.ok && (cors === '*' || cors === ORIGIN);
    return [name, ok, `${res.status} CORS ${cors || 'none'}`];
  } catch (e) {
    return [name, false, e.message];
  }
}));
for (const [name, ok, info] of results) {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(24)} ${info}`);
}
console.log(failed ? `${failed} source(s) failed` : `all ${SOURCES.length} sources ok (${new Date().toISOString().slice(0, 10)})`);
process.exit(failed ? 1 : 0);
