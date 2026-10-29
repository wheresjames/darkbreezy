import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../helpers/env.mjs';
import { PLACES } from '../fixtures/places.mjs';
import { sunTimes, sunPosition, skyPhase, dayLength } from '../../web/js/util/sun.js';
import { moonIllumination, moonTimes, moonPass, nextPhases, phaseName } from '../../web/js/util/moon.js';

const MIN = 60e3;

// Near the poles the sun crosses the horizon at a shallow angle, so tiny
// differences between the formulas grow into minutes.
test('sunrise and sunset agree with Open-Meteo (3 minutes, 6 above 60°)', () => {
  for (const p of PLACES) {
    const tol = (Math.abs(p.lat) > 60 ? 6 : 3) * MIN;
    const f = fixture(`recorded/om-forecast-${p.id}.json`);
    for (let i = 0; i < f.daily.time.length; i += 3) {
      const rise = f.daily.sunrise[i] * 1000;
      const set = f.daily.sunset[i] * 1000;
      const t = sunTimes(f.daily.time[i] * 1000 + 12 * 36e5, p.lat, p.lon);
      if (!rise || rise === set) {
        assert.equal(t.sunrise, null, `${p.id} day ${i}: no sunrise expected`);
        continue;
      }
      assert.ok(Math.abs(t.sunrise - rise) < tol, `${p.id} sunrise day ${i}: ${new Date(t.sunrise).toISOString()} vs ${new Date(rise).toISOString()}`);
      assert.ok(Math.abs(t.sunset - set) < tol, `${p.id} sunset day ${i}`);
    }
  }
});

test('polar day and night', () => {
  const tromso = { lat: 69.65, lon: 18.96 };
  const june = sunTimes(Date.UTC(2026, 5, 21, 12), tromso.lat, tromso.lon);
  assert.ok(june.polarDay);
  assert.equal(dayLength(june), 86400);
  const dec = sunTimes(Date.UTC(2026, 11, 21, 12), tromso.lat, tromso.lon);
  assert.ok(dec.polarNight);
  assert.equal(dayLength(dec), 0);
  assert.ok(dec.dawn, 'civil twilight still happens in polar night at 69°N');
});

test('sun position and sky phase', () => {
  // Solar noon at the equinox on the equator: the sun is nearly overhead.
  const noon = sunTimes(Date.UTC(2026, 2, 20, 12), 0, 0).solarNoon;
  assert.ok(sunPosition(noon, 0, 0).altitude > 88);
  assert.equal(skyPhase(30), 'day');
  assert.equal(skyPhase(3), 'golden');
  assert.equal(skyPhase(-3), 'civil');
  assert.equal(skyPhase(-9), 'nautical');
  assert.equal(skyPhase(-15), 'astro');
  assert.equal(skyPhase(-30), 'night');
});

test('moon phases', () => {
  const full = moonIllumination(Date.UTC(2024, 0, 25, 17, 54));
  assert.ok(full.fraction > 0.99);
  assert.equal(phaseName(full.phase), 'Full moon');
  const fresh = moonIllumination(Date.UTC(2024, 0, 11, 11, 57));
  assert.ok(fresh.fraction < 0.01);
  assert.equal(phaseName(fresh.phase), 'New moon');
  const first = moonIllumination(Date.UTC(2024, 0, 18, 3, 53));
  assert.equal(phaseName(first.phase), 'First quarter');
});

test('moonrise and moonset come within the day asked', () => {
  const start = Date.UTC(2026, 9, 28);
  const t = moonTimes(start, 52.52, 13.41);
  for (const v of [t.rise, t.set]) if (v != null) assert.ok(v >= start && v <= start + 864e5);
  assert.ok(t.rise != null || t.set != null || t.alwaysUp || t.alwaysDown);
});

test('the next phases: in order, within a few minutes of the published times', () => {
  // USNO, January–February 2024 (UTC).
  const published = [[0.75, '2024-01-04T03:30Z'], [0, '2024-01-11T11:57Z'], [0.25, '2024-01-18T03:53Z'], [0.5, '2024-01-25T17:54Z'], [0.75, '2024-02-02T23:18Z'], [0, '2024-02-09T22:59Z']];
  const got = nextPhases(Date.UTC(2024, 0, 1), 6);
  assert.deepEqual(got.map((x) => x.phase), published.map(([q]) => q));
  got.forEach((x, i) => assert.ok(Math.abs(x.t - Date.parse(published[i][1])) < 5 * MIN, `${published[i][1]}: ${new Date(x.t).toISOString()}`));
  // Just after one: it's not repeated, and the next comes about a week later.
  const after = nextPhases(Date.parse('2024-01-25T18:00Z'), 1)[0];
  assert.equal(after.phase, 0.75);
});

test('the moon\'s pass: rise before set, around now or next', () => {
  const start = Date.UTC(2026, 9, 27, 23); // Berlin's midnight, 28 October 2026
  for (let hr = 0; hr < 24; hr += 3) {
    const now = start + hr * 36e5;
    const p = moonPass(now, start, 52.52, 13.41);
    assert.ok(p.rise && p.set && p.rise < p.set, `${hr} h`);
    if (p.up) assert.ok(p.rise <= now && now <= p.set, `${hr} h: up now`);
    else assert.ok(p.rise > now, `${hr} h: the next pass`);
  }
});
