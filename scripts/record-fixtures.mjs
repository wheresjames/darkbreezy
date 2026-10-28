#!/usr/bin/env node
// Records real responses from every data source into tests/fixtures/recorded/,
// for the unit and end-to-end tests (DARKBREEZY.md §8, step 1.9).
//
//   node scripts/record-fixtures.mjs
//
// The requests are the ones the app makes (web/js/api/*), for a fixed set
// of places. Responses are "sanitized": trimmed to what the tests use (the
// aurora grid, alert lists), with nothing about the machine that recorded
// them. Sources with nothing to show today (no warnings in Germany, say)
// are covered by hand-written files in tests/fixtures/synthetic/, which
// this script never touches.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLACES } from '../tests/fixtures/places.mjs';
import { forecastUrl, airUrl, marineUrl } from '../web/js/api/openmeteo.js';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'fixtures', 'recorded');
const UA = 'darkbreezy.com fixture recorder (https://github.com/wheresjames/darkbreezy)';

async function get(url, { text = false } = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: text ? '*/*' : 'application/geo+json, application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return text ? res.text() : res.json();
}

async function save(name, data) {
  await writeFile(join(OUT, name), `${JSON.stringify(data, null, 1)}\n`);
  console.log('  ', name);
}

async function step(name, fn) {
  try { await fn(); } catch (e) { console.warn(`!! ${name}: ${e.message}`); }
}

const centroid = (geom) => {
  const pts = [];
  const walk = (c) => { if (typeof c[0] === 'number') pts.push(c); else c.forEach(walk); };
  walk(geom.coordinates);
  const lon = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const lat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return { lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100 };
};

await mkdir(OUT, { recursive: true });

for (const p of PLACES) {
  await step(`forecast ${p.id}`, async () => save(`om-forecast-${p.id}.json`, await get(forecastUrl(p))));
  await step(`air ${p.id}`, async () => save(`om-air-${p.id}.json`, await get(airUrl(p))));
}
for (const id of ['sydney', 'berlin']) {
  const p = PLACES.find((x) => x.id === id);
  await step(`marine ${id}`, async () => save(`om-marine-${id}.json`, await get(marineUrl(p))));
}

await step('geocoding', async () => save('om-geocode-berlin.json', await get('https://geocoding-api.open-meteo.com/v1/search?name=Berlin&count=8&language=en&format=json')));
await step('photon reverse', async () => save('photon-reverse-berlin.json', await get('https://photon.komoot.io/reverse?lat=52.52&lon=13.41&lang=en&limit=1')));

// NWS: New York's lookups, and a point inside a live alert's polygon.
await step('nws', async () => {
  const points = await get('https://api.weather.gov/points/40.71,-74.01');
  await save('nws-points-nyc.json', points);
  const stations = await get(`${points.properties.observationStations}?limit=3`);
  await save('nws-stations-nyc.json', stations);
  const id = stations.features[0].properties.stationIdentifier;
  await save('nws-obs-nyc.json', await get(`https://api.weather.gov/stations/${id}/observations?limit=6`));
  const list = await get(`https://api.weather.gov/products/types/AFD/locations/${points.properties.gridId}`);
  await save('nws-afd-list.json', { '@graph': list['@graph'].slice(0, 2) });
  await save('nws-afd.json', await get(list['@graph'][0]['@id']));
});
await step('nws alerts', async () => {
  const all = await get('https://api.weather.gov/alerts/active?status=actual&message_type=alert,update');
  const withShape = all.features.find((f) => f.geometry);
  if (!withShape) throw new Error('no active alert with a polygon right now');
  const at = centroid(withShape.geometry);
  const here = await get(`https://api.weather.gov/alerts/active?point=${at.lat},${at.lon}`);
  await save('nws-alerts.json', { point: at, ...here });
});

await step('eccc alerts', async () => {
  const all = await get('https://api.weather.gc.ca/collections/weather-alerts/items?f=json&limit=200');
  const live = all.features.find((f) => f.geometry && f.properties.status_en !== 'ended');
  if (!live) throw new Error('no active Canadian alert right now');
  const at = centroid(live.geometry);
  const d = 0.01;
  const here = await get(`https://api.weather.gc.ca/collections/weather-alerts/items?f=json&limit=50&bbox=${at.lon - d},${at.lat - d},${at.lon + d},${at.lat + d}`);
  await save('eccc-alerts.json', { point: at, ...here, links: [] });
});
await step('eccc swob', async () => {
  const since = new Date(Date.now() - 90 * 60e3).toISOString().slice(0, 19);
  const props = 'stn_nam-value,obs_date_tm,air_temp,rel_hum,avg_wnd_spd_10m_pst10mts,avg_wnd_dir_10m_pst10mts,max_wnd_gst_spd_10m_pst10mts,mslp,vis';
  const d = await get(`https://api.weather.gc.ca/collections/swob-realtime/items?f=json&limit=100&bbox=-79.68,43.4,-79.08,43.9&datetime=${since}Z/..&sortby=-obs_date_tm&properties=${props}`);
  await save('eccc-swob-toronto.json', { ...d, links: [] });
});

await step('bright sky', async () => {
  await save('brightsky-current-berlin.json', await get('https://api.brightsky.dev/current_weather?lat=52.52&lon=13.41'));
  await save('brightsky-alerts-berlin.json', await get('https://api.brightsky.dev/alerts?lat=52.52&lon=13.41'));
});

await step('jma', async () => {
  await save('gsi-tokyo.json', await get('https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=35.68&lon=139.69'));
  await save('jma-warning-130000.json', await get('https://www.jma.go.jp/bosai/warning/data/warning/130000.json'));
});

await step('hko', async () => save('hko-warnsum.json', await get('https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum&lang=en')));

await step('gdacs', async () => {
  const from = new Date(Date.now() - 21 * 864e5).toISOString().slice(0, 10);
  const d = await get(`https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC;FL;DR;VO;WF&alertlevel=Orange;Red&fromdate=${from}`);
  await save('gdacs-events.json', d);
});

// The aurora grid is ~1 MB: kept only north of 60°N and south of 60°S.
await step('swpc', async () => {
  const d = await get('https://services.swpc.noaa.gov/json/ovation_aurora_latest.json');
  await save('swpc-aurora.json', { ...d, coordinates: d.coordinates.filter(([, lat]) => Math.abs(lat) >= 60) });
});

await step('rainviewer', async () => save('rainviewer-maps.json', await get('https://api.rainviewer.com/public/weather-maps.json')));

console.log('done');
