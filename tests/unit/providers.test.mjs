// The normalizers, against real recorded responses (tests/fixtures/recorded)
// and hand-written ones for what wasn't happening that day (synthetic/).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../helpers/env.mjs';
import { PLACES } from '../fixtures/places.mjs';
import { normalizeForecast, normalizeAir, normalizeMarine, forecastUrl } from '../../web/js/api/openmeteo.js';
import { normalizeObs, latestObs } from '../../web/js/api/nws.js';
import { cleanDiscussion } from '../../web/js/api/nws.js';
import { normalizeBrightSky, normalizeSwob } from '../../web/js/api/obs.js';
import { normalizeSearch, normalizeReverse } from '../../web/js/api/geocode.js';
import { auroraChance, radarFrames, framesOf, radarTile, tileFor } from '../../web/js/api/extras.js';

const place = (id) => PLACES.find((p) => p.id === id);

test('forecast: every place normalizes to the Weather shape', () => {
  for (const p of PLACES) {
    const raw = fixture(`recorded/om-forecast-${p.id}.json`);
    const w = normalizeForecast(raw, raw.current.time * 1000);
    assert.ok(w.tz.includes('/') || w.tz === 'GMT', `${p.id} tz ${w.tz}`);
    assert.equal(typeof w.current.temp, 'number');
    assert.equal(typeof w.current.isDay, 'boolean');
    assert.equal(w.hourly.length, 97, `${p.id}: 25 past + 72 ahead`);
    assert.equal(w.daily.length, 10);
    assert.ok(w.daily.every((d) => d.max >= d.min));
    assert.ok(w.hourly.every((r, i) => i === 0 || r.t - w.hourly[i - 1].t === 36e5), 'hourly steps');
    assert.ok(w.current.t > 1.7e12, 'times in ms');
  }
});

test('forecast URL asks for metric, unix time and the place\'s time zone', () => {
  const u = new URL(forecastUrl(place('berlin')));
  assert.equal(u.searchParams.get('timezone'), 'auto');
  assert.equal(u.searchParams.get('timeformat'), 'unixtime');
  assert.equal(u.searchParams.get('latitude'), '52.52');
  assert.equal(u.searchParams.get('temperature_unit'), null);
});

test('air quality: pollen only in Europe', () => {
  assert.equal(normalizeAir(fixture('recorded/om-air-nyc.json')).pollen, null);
  assert.equal(normalizeAir(fixture('recorded/om-air-tokyo.json')).pollen, null);
  const berlin = normalizeAir(fixture('recorded/om-air-berlin.json'));
  assert.ok(berlin.pollen && 'birch' in berlin.pollen);
  assert.equal(typeof berlin.euAqi, 'number');
  assert.equal(normalizeAir({}), null);
});

test('marine: null inland, values on the coast', () => {
  assert.equal(normalizeMarine(fixture('recorded/om-marine-berlin.json')), null);
  const sydney = normalizeMarine(fixture('recorded/om-marine-sydney.json'));
  assert.equal(typeof sydney.waveHeight, 'number');
});

test('station readings', () => {
  const nws = latestObs(fixture('recorded/nws-obs-nyc.json'), 5000);
  assert.equal(typeof nws.temp, 'number');
  assert.ok(nws.t > 0);
  assert.equal(nws.distanceKm, 5);
  assert.ok(nws.station);
  const bs = normalizeBrightSky(fixture('recorded/brightsky-current-berlin.json'));
  assert.equal(bs.source, 'Deutscher Wetterdienst');
  assert.ok(bs.station && bs.distanceKm < 50);
  const swob = normalizeSwob(fixture('recorded/eccc-swob-toronto.json'), place('toronto'));
  assert.equal(typeof swob.temp, 'number');
  assert.ok(swob.distanceKm < 40, `nearest station ${swob.station} at ${swob.distanceKm} km`);
  assert.equal(normalizeSwob({ features: [] }, place('toronto')), null);
  assert.equal(normalizeObs({ properties: { temperature: { value: null } } }), null);
});

test('forecaster\'s discussion loses its transmission header', () => {
  const text = cleanDiscussion(fixture('recorded/nws-afd.json').productText);
  assert.ok(text.startsWith('Area Forecast Discussion'));
});

test('geocoding', () => {
  const results = normalizeSearch(fixture('recorded/om-geocode-berlin.json'));
  assert.equal(results[0].name, 'Berlin');
  assert.equal(results[0].cc, 'DE');
  assert.equal(results[0].id, '52.52,13.41');
  const here = normalizeReverse(fixture('recorded/photon-reverse-berlin.json'), 52.52, 13.41);
  assert.equal(here.name, 'Berlin');
  assert.equal(here.cc, 'DE');
  assert.equal(normalizeReverse({ features: [] }, 1, 2), null);
});

test('aurora and radar', () => {
  const raw = fixture('recorded/swpc-aurora.json');
  const a = auroraChance(raw, place('tromso'));
  assert.ok(a.chance >= 0 && a.chance <= 100);
  assert.ok(a.forecastTime > 0);
  assert.equal(auroraChance({ coordinates: [[19, 72, 40], [19, 60, 90]] }, { lat: 69.65, lon: 18.96 }).chance, 40, 'only from just south to 5° poleward');
  const rv = fixture('recorded/rainviewer-maps.json');
  const data = radarFrames(rv);
  assert.equal(data.frames.length, rv.radar.past.length);
  assert.ok(data.frames.every((f, i) => i === 0 || f.time - data.frames[i - 1].time === 600e3), 'every 10 minutes, oldest first');
  const frames = framesOf(data);
  const frame = frames.at(-1);
  assert.equal(frame.host, rv.host);
  assert.deepEqual(framesOf({ time: 1, host: 'h', path: '/p' }), [{ time: 1, host: 'h', path: '/p' }], 'one-frame data saved by earlier versions');
  assert.deepEqual(framesOf(null), []);
  assert.match(radarTile(frame, 7, 1, 2), /^https:\/\/tilecache\.rainviewer\.com\/v2\/radar\/\w+\/256\/7\/1\/2\/2\/1_1\.png$/);
  const t = tileFor(0, 0, 1);
  assert.deepEqual([t.x, t.y], [1, 1]);
});
