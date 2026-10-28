// Answers every weather service the app calls from tests/fixtures, so the
// end-to-end tests need no network and always see the same data. The page's
// clock is pinned to when the forecast fixture was recorded.

import { readFileSync } from 'node:fs';
import { expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { PLACES } from '../fixtures/places.mjs';

const read = (name) => readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)), 'utf8');
const json = (name) => JSON.parse(read(name));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const CORS = { 'access-control-allow-origin': '*' };

/** The fixture place nearest [lat],[lon] (requests carry rounded coordinates). */
function nearest(lat, lon) {
  return PLACES.reduce((best, p) => (Math.hypot(p.lat - lat, p.lon - lon) < Math.hypot(best.lat - lat, best.lon - lon) ? p : best));
}

/** When the forecast for [id] was recorded (ms): the time the tests pretend it is. */
export const recordedAt = (id) => json(`recorded/om-forecast-${id}.json`).current.time * 1000 + 5 * 60e3;

/**
 * Route the services for [page]. [overrides]: { name: status | fixture path }
 * replaces one source's answer (a status makes it fail).
 */
export async function fakeServices(page, overrides = {}) {
  const answer = async (route, name, file) => {
    // overrides.delay = { name: ms }: a slow service.
    if (overrides.delay?.[name]) await new Promise((r) => setTimeout(r, overrides.delay[name]));
    const o = overrides[name];
    if (typeof o === 'number') return route.fulfill({ status: o, headers: CORS, body: 'error' });
    if (o === 'abort') return route.abort('failed');
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: read(o || file) });
  };
  const at = (url) => {
    const u = new URL(url);
    const lat = Number(u.searchParams.get('latitude') ?? u.searchParams.get('lat'));
    const lon = Number(u.searchParams.get('longitude') ?? u.searchParams.get('lon'));
    return nearest(lat, lon);
  };
  await page.route('https://api.open-meteo.com/**', (r) => {
    const u = new URL(r.request().url());
    // Several places at once (the map's favorites): a list, one per place.
    if (u.searchParams.get('latitude').includes(',')) {
      if (typeof overrides.snapshots === 'number') return r.fulfill({ status: overrides.snapshots, headers: CORS, body: 'error' });
      const lats = u.searchParams.get('latitude').split(',').map(Number);
      const lons = u.searchParams.get('longitude').split(',').map(Number);
      const body = lats.map((lat, i) => json(`recorded/om-forecast-${nearest(lat, lons[i]).id}.json`));
      return r.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    }
    return answer(r, 'forecast', `recorded/om-forecast-${at(r.request().url()).id}.json`);
  });
  await page.route('https://air-quality-api.open-meteo.com/**', (r) => answer(r, 'air', `recorded/om-air-${at(r.request().url()).id}.json`));
  await page.route('https://marine-api.open-meteo.com/**', (r) => answer(r, 'marine', at(r.request().url()).id === 'sydney' ? 'recorded/om-marine-sydney.json' : 'recorded/om-marine-berlin.json'));
  await page.route('https://geocoding-api.open-meteo.com/**', (r) => answer(r, 'geocode', 'recorded/om-geocode-berlin.json'));
  await page.route('https://photon.komoot.io/**', (r) => answer(r, 'photon', 'recorded/photon-reverse-berlin.json'));
  await page.route('https://nominatim.openstreetmap.org/**', (r) => r.fulfill({ status: 500, headers: CORS, body: '' }));
  await page.route('https://api.weather.gov/**', (r) => {
    const u = r.request().url();
    if (u.includes('/alerts/')) return answer(r, 'nws-alerts', 'synthetic/nws-alerts-tornado.json');
    if (u.includes('/points/')) return answer(r, 'nws-points', 'recorded/nws-points-nyc.json');
    if (u.includes('/gridpoints/')) return answer(r, 'nws-stations', 'recorded/nws-stations-nyc.json');
    if (u.includes('/observations')) return answer(r, 'nws-obs', 'recorded/nws-obs-nyc.json');
    if (u.includes('/products/types/AFD')) return answer(r, 'nws-afd-list', 'recorded/nws-afd-list.json');
    return answer(r, 'nws-afd', 'recorded/nws-afd.json');
  });
  await page.route('https://api.weather.gc.ca/**', (r) => answer(r, 'eccc', r.request().url().includes('swob') ? 'recorded/eccc-swob-toronto.json' : 'recorded/eccc-alerts.json'));
  await page.route('https://api.brightsky.dev/**', (r) => answer(r, 'brightsky', r.request().url().includes('/alerts') ? 'synthetic/brightsky-alerts-berlin.json' : 'recorded/brightsky-current-berlin.json'));
  await page.route('https://mreversegeocoder.gsi.go.jp/**', (r) => answer(r, 'gsi', 'recorded/gsi-tokyo.json'));
  await page.route('https://www.jma.go.jp/**', (r) => answer(r, 'jma', 'synthetic/jma-warning-tokyo.json'));
  await page.route('https://data.weather.gov.hk/**', (r) => answer(r, 'hko', r.request().url().includes('warningInfo') ? 'synthetic/hko-warninginfo.json' : 'synthetic/hko-warnsum.json'));
  await page.route('https://www.gdacs.org/**', (r) => answer(r, 'gdacs', 'recorded/gdacs-events.json'));
  await page.route('https://services.swpc.noaa.gov/**', (r) => answer(r, 'aurora', 'recorded/swpc-aurora.json'));
  await page.route('https://api.rainviewer.com/**', (r) => answer(r, 'radar', 'recorded/rainviewer-maps.json'));
  // Radar tiles are fetched (api/tiles.js), so they need CORS; [overrides.tiles](request number) may answer a status instead.
  let tileAsks = 0;
  await page.route(/https:\/\/tilecache\.rainviewer\.com\//, (r) => {
    const status = overrides.tiles?.(++tileAsks);
    if (status) return r.fulfill({ status, headers: { ...CORS, 'retry-after': '60' }, body: '' });
    return r.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'image/png' }, body: PNG });
  });
  await page.route(/https:\/\/gibs\.earthdata\.nasa\.gov\//, (r) => r.fulfill({ status: 200, headers: { 'content-type': 'image/png' }, body: PNG }));
}

/** The address of fixture place [id]'s dashboard. */
export function placeUrl(id) {
  const p = PLACES.find((x) => x.id === id);
  const q = new URLSearchParams({ n: p.name, c: p.country, cc: p.cc });
  return `#/place/${p.lat.toFixed(2)},${p.lon.toFixed(2)}/${p.id}?${q}`;
}

/** Fresh page for place [id] at its recorded time, services faked. */
export async function openPlace(page, id, overrides) {
  await page.clock.setFixedTime(recordedAt(id));
  await fakeServices(page, overrides);
  await page.goto(`./${placeUrl(id)}`);
  await page.locator('.hero-temp').waitFor();
}

/** Make the fixture places [ids] the browser's favorites, before the app starts. */
export async function withFavorites(page, ids) {
  const list = ids.map((id) => {
    const p = PLACES.find((x) => x.id === id);
    return { id: `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`, name: p.name, admin1: p.admin1, country: p.country, cc: p.cc, lat: p.lat, lon: p.lon };
  });
  await page.addInitScript((data) => {
    if (!localStorage.getItem('darkbreezy:favorites')) localStorage.setItem('darkbreezy:favorites', JSON.stringify({ v: 1, data: { list: data } }));
  }, list);
}

/** Wait until every radar tile is drawn (they arrive through a paced queue, api/tiles.js): for screenshots. */
export async function radarDrawn(page, timeout = 15000) {
  await expect(page.locator('.radar-loading')).toHaveCount(0, { timeout });
  await expect.poll(() => page.locator('.radar-layer img').evaluateAll((imgs) => imgs.every((i) => i.complete && i.naturalWidth > 0)), { timeout }).toBe(true);
}

/**
 * The app's own font (Inter, css/tokens.css) for certain, for the reference screenshots.
 * It's "font-display: optional", so a freshly opened page may draw before it arrives and
 * use the system's font, which differs from one machine to the next: here it's loaded
 * and waited for.
 */
export async function pinFont(page) {
  await page.evaluate(async () => {
    const font = new FontFace('Inter Pinned', `url(${new URL('assets/fonts/inter-5.3-latin.woff2', document.baseURI)})`, { weight: '100 900' });
    document.fonts.add(await font.load());
    document.documentElement.style.setProperty('--font-ui', '"Inter Pinned", sans-serif');
  });
}
