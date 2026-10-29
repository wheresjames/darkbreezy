// Pure helpers: places, categories, summaries, the cache.
import test from 'node:test';
import assert from 'node:assert/strict';
import '../helpers/env.mjs';
import { parseCoords, makePlace, placeHash, placeFromRoute, coordKey, flag, distanceKm, slug } from '../../web/js/util/place.js';
import { usAqiCategory, euAqiCategory, aqiScale, uvCategory, pollenLevel, pressureTrend, comfort, dominantPollutant, pollenRanked } from '../../web/js/util/format.js';
import { nowcastSummary, vsYesterday, umbrellaHint } from '../../web/js/widgets/summary.js';
import { SYSTEMS } from '../../web/js/util/units.js';
import { readCache, writeCache, cachedPlaces, cacheSize, clearCache, MAX_PLACES } from '../../web/js/state/cache.js';
import { t, addTranslations, setLanguage } from '../../web/js/core/i18n.js';

test('places', () => {
  assert.deepEqual(parseCoords('40.7128, -74.006'), { lat: 40.7128, lon: -74.006 });
  assert.deepEqual(parseCoords('-33.87 151.21'), { lat: -33.87, lon: 151.21 });
  assert.equal(parseCoords('Berlin'), null);
  assert.equal(parseCoords('95, 10'), null);
  const p = makePlace({ name: 'São Paulo', admin1: 'SP', country: 'Brazil', cc: 'br', lat: -23.5505, lon: -46.6333 });
  assert.equal(p.id, '-23.55,-46.63');
  assert.equal(p.cc, 'BR');
  assert.equal(slug(p.name), 'Sao-Paulo');
  const hash = placeHash(p);
  const url = new URL(`https://x/${hash}`);
  const [, , coords, s] = url.hash.split('?')[0].split('/');
  const back = placeFromRoute({ coords, slug: s }, new URLSearchParams(url.hash.split('?')[1]));
  assert.deepEqual(back, p);
  assert.equal(coordKey({ lat: 1, lon: 2 }), '1.00,2.00');
  assert.equal(flag('de'), '🇩🇪');
  assert.equal(flag(''), '');
  assert.ok(Math.abs(distanceKm({ lat: 52.52, lon: 13.41 }, { lat: 48.14, lon: 11.58 }) - 504) < 5);
  assert.equal(placeFromRoute({ coords: 'nope' }, new URLSearchParams()), null);
});

test('categories', () => {
  assert.equal(usAqiCategory(42).label, 'Good');
  assert.equal(usAqiCategory(160).level, 3);
  assert.equal(euAqiCategory(55).label, 'Moderate');
  assert.equal(aqiScale('auto', 'DE'), 'eu');
  assert.equal(aqiScale('auto', 'US'), 'us');
  assert.equal(aqiScale('us', 'DE'), 'us');
  assert.equal(uvCategory(7.9).label, 'High');
  assert.equal(uvCategory(11).label, 'Extreme');
  assert.equal(pollenLevel('birch', 0).level, 0);
  assert.equal(pollenLevel('grass', 30).label, 'High');
  assert.equal(pressureTrend(2).label, 'Rising');
  assert.equal(pressureTrend(-4).label, 'Falling fast');
  assert.equal(pressureTrend(0.5).dir, 0);
  assert.equal(comfort(22), 'Muggy');
  assert.equal(dominantPollutant({ pm25: 30, pm10: 20, o3: 50 }).name, 'PM2.5');
});

const MIN = 60e3;
const rows = (now, values, code = 61) => values.map((v, i) => ({ t: now + (i + 1) * 15 * MIN, precip: v, code }));

test('next-hours summary', () => {
  const now = Date.parse('2026-10-28T12:00:00Z');
  assert.equal(nowcastSummary(rows(now, [0, 0, 0, 0, 0, 0, 0, 0]), now), null);
  assert.equal(nowcastSummary(rows(now, [0, 0, 0.3, 0.5, 0, 0, 0, 0]), now), 'Rain starting in ~30 min');
  assert.equal(nowcastSummary(rows(now, [0.4, 0.2, 0, 0, 0, 0, 0, 0]), now), 'Rain stopping in ~30 min');
  assert.equal(nowcastSummary(rows(now, [0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4]), now), 'Rain for at least the next 2 hours');
  assert.equal(nowcastSummary(rows(now, [0, 0.3, 0.3, 0, 0, 0, 0, 0], 73), now), 'Snow starting in ~15 min');
  assert.equal(nowcastSummary([], now), null);
});

test('compared with yesterday, in the user\'s units', () => {
  const now = Date.parse('2026-10-28T12:00:00Z');
  const hourly = [{ t: now - 864e5, temp: 10 }];
  assert.equal(vsYesterday({ t: now, temp: 13 }, hourly, SYSTEMS.metric), '3° warmer than yesterday');
  assert.equal(vsYesterday({ t: now, temp: 13 }, hourly, SYSTEMS.imperial), '5° warmer than yesterday');
  assert.equal(vsYesterday({ t: now, temp: 7 }, hourly, SYSTEMS.metric), '3° colder than yesterday');
  assert.equal(vsYesterday({ t: now, temp: 10.3 }, hourly, SYSTEMS.metric), 'About the same as yesterday');
  assert.equal(vsYesterday({ t: now, temp: 10 }, [], SYSTEMS.metric), null);
});

test('umbrella hint', () => {
  const now = Date.parse('2026-10-28T12:00:00Z');
  const h = (i, pop, precip, code = 61) => ({ t: now + i * 36e5, pop, precip, code });
  assert.equal(umbrellaHint([h(0, 10, 0), h(1, 20, 0)], now, 'UTC', '24'), null);
  assert.equal(umbrellaHint([h(0, 10, 0), h(3, 80, 1.2)], now, 'UTC', '24'), 'Umbrella from 15:00');
  assert.equal(umbrellaHint([h(0, 90, 2)], now, 'UTC', '24'), 'Umbrella needed now');
  assert.equal(umbrellaHint([h(2, 90, 2, 73)], now, 'UTC', '24'), 'Snow from 14:00');
});

test('cache keeps the 10 most recent places', () => {
  localStorage.clear();
  localStorage.limit = Infinity;
  for (let i = 0; i < MAX_PLACES + 3; i++) writeCache('wx', { lat: i, lon: 0 }, { forecast: { at: i, data: { i } } });
  assert.equal(cachedPlaces().length, MAX_PLACES);
  assert.equal(readCache('wx', { lat: 0, lon: 0 }), null, 'oldest evicted');
  assert.equal(readCache('wx', { lat: 12, lon: 0 }).forecast.data.i, 12);
  writeCache('wx', { lat: 12, lon: 0 }, { air: { at: 1, data: null } });
  assert.ok(readCache('wx', { lat: 12, lon: 0 }).forecast, 'writes merge');
});

test('a full storage drops old places to make room', () => {
  localStorage.clear();
  localStorage.limit = 2500;
  const big = 'x'.repeat(600);
  for (let i = 0; i < 6; i++) assert.ok(writeCache('wx', { lat: i, lon: 0 }, { forecast: { data: big } }), `write ${i}`);
  assert.ok(readCache('wx', { lat: 5, lon: 0 }));
  assert.equal(readCache('wx', { lat: 0, lon: 0 }), null);
  localStorage.limit = Infinity;
});

test('translations', () => {
  assert.equal(t('Feels like {temp}', { temp: '5°' }), 'Feels like 5°');
  addTranslations('de', { 'Feels like {temp}': 'Gefühlt {temp}' });
  setLanguage('de-AT');
  assert.equal(t('Feels like {temp}', { temp: '5°' }), 'Gefühlt 5°');
  setLanguage('en');
});

test('settings migration 2: "Next hours" moves after Hourly and Daily', async () => {
  const { migrate } = await import('../../web/js/core/store.js');
  const { DEFAULTS, moveAfter } = await import('../../web/js/state/settings.js');
  assert.deepEqual(moveAfter(['warnings', 'nowcast', 'hourly', 'daily', 'wind'], 'nowcast', 'daily'), ['warnings', 'hourly', 'daily', 'nowcast', 'wind']);
  assert.deepEqual(moveAfter(['daily', 'wind', 'nowcast'], 'nowcast', 'daily'), ['daily', 'wind', 'nowcast'], 'already after: left alone');
  const old = { v: 1, data: { theme: 'dark', order: ['warnings', 'nowcast', 'hourly', 'daily', 'precip'] } };
  const s = migrate(old, 2, DEFAULTS, { 2: (d) => ({ ...d, order: moveAfter(d.order, 'nowcast', 'daily') }) });
  assert.deepEqual(s.order, ['warnings', 'hourly', 'daily', 'nowcast', 'precip']);
  assert.equal(s.theme, 'dark');
  assert.deepEqual(DEFAULTS.order.slice(0, 4), ['warnings', 'hourly', 'daily', 'nowcast']);
});

test('settings migration 5: the moon card goes just after the sun, hidden if the sun was', async () => {
  const { splitMoon } = await import('../../web/js/state/settings.js');
  assert.deepEqual(splitMoon({ order: ['wind', 'sun', 'uv'], hidden: [] }), { order: ['wind', 'sun', 'moon', 'uv'], hidden: [] });
  assert.deepEqual(splitMoon({ order: ['sun', 'uv'], hidden: ['sun'] }).hidden, ['sun', 'moon']);
  assert.deepEqual(splitMoon({ order: ['moon', 'sun'], hidden: [] }).order, ['moon', 'sun'], 'already placed: left alone');
  assert.deepEqual(splitMoon({ theme: 'dark' }), { theme: 'dark', order: undefined, hidden: undefined }, 'nothing saved: the defaults stand');
});

test('pollen: the worst plant first by its own scale, not by the raw count', () => {
  // Grass 30/m³ is High (grasses: 5, 20, 200); birch 40/m³ only Moderate (trees: 10, 50, 500).
  const ranked = pollenRanked({ birch: 40, grass: 30, alder: 0 });
  assert.deepEqual(ranked.map((r) => r.k), ['grass', 'birch', 'alder']);
  assert.equal(ranked[0].lvl.label, 'High');
  assert.deepEqual(pollenRanked({ birch: 60, alder: 400 }).map((r) => r.k), ['alder', 'birch'], 'same level: the higher count first');
});

test('clearing saved weather: every place, the NWS lookups and the map\'s temperatures; settings stay', () => {
  const place = makePlace({ name: 'X', lat: 1, lon: 2 });
  writeCache('wx', place, { forecast: { data: 1, at: 1 } });
  writeCache('alerts', place, { alerts: { data: 1, at: 1 } });
  localStorage.setItem('darkbreezy:nws:1.00,2.00', '{"gridId":"X"}');
  localStorage.setItem('darkbreezy:favwx', '{"at":1}');
  localStorage.setItem('darkbreezy:settings', '{"v":4}');
  assert.ok(cacheSize() > 0);
  clearCache();
  assert.equal(cacheSize(), 0);
  assert.deepEqual(cachedPlaces(), []);
  assert.equal(localStorage.getItem('darkbreezy:nws:1.00,2.00'), null);
  assert.equal(localStorage.getItem('darkbreezy:favwx'), null);
  assert.equal(localStorage.getItem('darkbreezy:settings'), '{"v":4}');
  localStorage.removeItem('darkbreezy:settings');
});
