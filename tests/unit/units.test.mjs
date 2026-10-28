import test from 'node:test';
import assert from 'node:assert/strict';
import { convert, fmt, fmtPrecip, fmtDistance, systemFor, unitsFor, compass, beaufort, SYSTEMS } from '../../web/js/util/units.js';

test('conversions', () => {
  assert.equal(convert(0, 'f'), 32);
  assert.equal(convert(100, 'f'), 212);
  assert.ok(Math.abs(convert(100, 'mph') - 62.137) < 0.01);
  assert.equal(convert(36, 'ms'), 10);
  assert.ok(Math.abs(convert(1013.25, 'inhg') - 29.92) < 0.01);
  assert.equal(convert(25.4, 'in'), 1);
  assert.equal(convert(null, 'f'), null);
  assert.equal(convert(12, 'c'), 12);
});

test('systems by locale', () => {
  assert.equal(systemFor('en-US'), 'imperial');
  assert.equal(systemFor('en-GB'), 'uk');
  assert.equal(systemFor('de-DE'), 'metric');
  assert.equal(systemFor('en-CA'), 'metric');
  assert.equal(systemFor('ja'), 'metric');
  assert.equal(systemFor('en'), 'imperial');   // plain English maximizes to en-Latn-US
  assert.deepEqual(unitsFor({ units: 'metric' }, 'en-US'), SYSTEMS.metric);
  assert.deepEqual(unitsFor({ units: 'auto' }, 'en-GB'), SYSTEMS.uk);
  assert.equal(unitsFor({ units: 'custom', custom: { wind: 'kn' } }, 'en-US').wind, 'kn');
});

test('formatting', () => {
  const m = SYSTEMS.metric;
  const i = SYSTEMS.imperial;
  assert.equal(fmt('temp', 21.6, m), '22°');
  assert.equal(fmt('temp', -0.2, m), '0°');
  assert.equal(fmt('temp', 0, i), '32°');
  assert.equal(fmt('wind', 10, m), '10 km/h');
  assert.equal(fmt('temp', null, m), '–');
  assert.equal(fmt('temp', 20, m, { bare: true }), '20');
  assert.equal(fmtPrecip(0, m), '0 mm');
  assert.equal(fmtPrecip(0.04, m), '<0.1 mm');
  assert.equal(fmtPrecip(2.34, m), '2.3 mm');
  assert.equal(fmtPrecip(25.4, i), '1.00 in');
  assert.equal(fmtDistance(800, m), '800 m');
  assert.equal(fmtDistance(24135, m), '24 km');
  assert.equal(fmtDistance(16093, i), '10 mi');
});

test('compass and beaufort', () => {
  assert.equal(compass(0), 'N');
  assert.equal(compass(225), 'SW');
  assert.equal(compass(359), 'N');
  assert.equal(compass(-90), 'W');
  assert.equal(beaufort(0).force, 0);
  assert.equal(beaufort(30).name, 'Fresh breeze');
  assert.equal(beaufort(200).force, 12);
});
