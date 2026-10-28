import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../helpers/env.mjs';
import { PLACES } from '../fixtures/places.mjs';
import { sunTimes, sunPosition, skyPhase, dayLength } from '../../web/js/util/sun.js';
import { moonIllumination, moonTimes, phaseName } from '../../web/js/util/moon.js';

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
