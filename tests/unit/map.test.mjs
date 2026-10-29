import test from 'node:test';
import assert from 'node:assert/strict';
import '../helpers/env.mjs';
import { pack } from '../../web/js/widgets/masonry.js';
import { fit, toPx, nightPath, placeLabels, labelSize, VIEW } from '../../web/js/util/world.js';
import { subsolar } from '../../web/js/util/sun.js';
import { normalizeSnapshots, snapshotUrl } from '../../web/js/api/openmeteo.js';
import { nextFavorite } from '../../web/js/state/rotate.js';
import { SYSTEMS } from '../../web/js/util/units.js';
import { fixture } from '../helpers/env.mjs';

test('masonry: each cell goes under the shortest column', () => {
  const { places, rows } = pack([{ span: 1, rows: 10 }, { span: 1, rows: 4 }, { span: 1, rows: 6 }, { span: 1, rows: 3 }], 3);
  assert.deepEqual(places.map((p) => [p.col, p.row]), [[0, 0], [1, 0], [2, 0], [1, 4]]);
  assert.equal(rows, 10);
});

test('masonry: shorter columns stretch to meet a wide cell, and to the bottom', () => {
  const items = [{ span: 1, rows: 10, fill: true }, { span: 1, rows: 4, fill: true }, { span: 2, rows: 5, fill: true }, { span: 1, rows: 20, fill: true }];
  const { places } = pack(items, 2);
  assert.deepEqual([places[2].col, places[2].row], [0, 10], 'the wide cell starts below the taller column');
  assert.equal(places[1].row + places[1].rows, 10, 'the short column\'s last cell meets it');
  assert.equal(places[0].rows, 10);
  assert.deepEqual([places[3].col, places[3].row], [0, 15]);
  const { places: p2 } = pack([{ span: 1, rows: 5, fill: true }, { span: 1, rows: 9, fill: true }], 2);
  assert.equal(p2[0].rows, 9, 'columns end level');
});

test('masonry: a no-fill cell is never stretched; wide cells clamp to the grid', () => {
  const { places } = pack([{ span: 1, rows: 3, fill: false }, { span: 1, rows: 8, fill: true }, { span: 9, rows: 2, fill: true }], 2);
  assert.equal(places[0].rows, 3);
  assert.equal(places[2].span, 2);
  assert.equal(places[2].row, 8);
});

test('map projection and fitting', () => {
  const f = fit(720, 284);
  assert.equal(f.scale, 2);
  const london = toPx(f, 51.5, 0);
  assert.equal(london.x, 360);
  assert.ok(Math.abs(london.y - (90 - 51.5 - VIEW.y) * 2) < 1e-9);
  const wide = fit(1000, 142);
  assert.equal(wide.scale, 1);
  assert.equal(wide.ox, 320, 'centered when the box is wider than the map');
  // Beyond the map's top and bottom (84°N, 58°S): at the edge, still on the map.
  const top = toPx(f, 89, 10).y;
  const bottom = toPx(f, -78, 166).y;
  assert.ok(top >= 0 && top < 10, `far north on the map: ${top}`);
  assert.ok(bottom <= 284 && bottom > 274, `Antarctica on the map: ${bottom}`);
  assert.equal(toPx(f, 89, 10).x, toPx(f, 0, 10).x);
});

test('the sun is overhead near the tropic at the June solstice, at noon on the Greenwich meridian', () => {
  const s = subsolar(Date.UTC(2026, 5, 21, 12));
  assert.ok(Math.abs(s.lat - 23.44) < 0.1, `lat ${s.lat}`);
  assert.ok(Math.abs(s.lon) < 1.5, `lon ${s.lon}`);
  const night = nightPath(Date.UTC(2026, 5, 21, 12));
  assert.match(night, /^M0 180L/, 'northern summer: night closes toward the south');
  assert.match(nightPath(Date.UTC(2026, 11, 21, 12)), /^M0 0L/);
});

test('labels: no overlaps, inside the box, longest variant that fits', () => {
  const markers = [
    { id: 'a', x: 50, y: 50, variants: [['Berlin', '12° · 14°/6°'], ['Berlin 12°'], ['Berlin']] },
    { id: 'b', x: 60, y: 52, variants: [['Prague', '11° · 13°/5°'], ['Prague 11°'], ['Prague']] },
    { id: 'c', x: 395, y: 100, variants: [['Edge', '1°'], ['Edge']] },
  ];
  const out = placeLabels(markers, 400, 200);
  const boxes = Object.values(out).map((l) => ({ ...labelSize(l.lines), x: l.x, y: l.y }));
  for (const b of boxes) assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= 400 && b.y + b.h <= 200);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const [p, q] = [boxes[i], boxes[j]];
    assert.ok(!(p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h), 'overlap');
  }
  assert.deepEqual(out.a.lines, ['Berlin', '12° · 14°/6°']);
  assert.equal(out.c.side, 'left', 'no room on the right at the edge');
  assert.deepEqual(placeLabels([{ id: 'x', x: 5, y: 5, variants: [['Somewhere long']] }], 20, 20), {}, 'no room: dot only');
});

test('labels: raised or lowered beside the dot when centered would cover a neighbor', () => {
  // A dot just below and to the right (as Jacksonville is to Longmont), a label already on the left.
  const out = placeLabels([
    { id: 'n', x: 120, y: 66, variants: [['Near']] },
    { id: 'w', x: 50, y: 50, variants: [['West', '6° · 2:40 AM']] },
    { id: 'a', x: 100, y: 50, variants: [['Longmont', '4° · 3:40 AM']] },
  ], 400, 200, { measure: (lines) => ({ w: 60, h: lines.length * 15 + 2 }) });
  assert.equal(out.a.side, 'right');
  assert.ok(out.a.y + out.a.h <= 59, `raised clear of the dot below: ${out.a.y}`);
});

test('weather for several places in one request', () => {
  const u = new URL(snapshotUrl([{ lat: 1, lon: 2 }, { lat: 3, lon: 4 }]));
  assert.equal(u.searchParams.get('latitude'), '1,3');
  const raw = [fixture('recorded/om-forecast-berlin.json'), fixture('recorded/om-forecast-tokyo.json')];
  const snaps = normalizeSnapshots(raw);
  assert.equal(snaps.length, 2);
  assert.equal(snaps[1].temp, raw[1].current.temperature_2m);
  assert.equal(snaps[0].max, raw[0].daily.temperature_2m_max[0]);
  assert.equal(normalizeSnapshots(raw[0]).length, 1, 'one place comes back as an object');
});

test('rotation order', () => {
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.equal(nextFavorite({ id: 'a' }, list).id, 'b');
  assert.equal(nextFavorite({ id: 'c' }, list).id, 'a');
  assert.equal(nextFavorite({ id: 'zz' }, list).id, 'a', 'from a place that isn\'t a favorite: the first');
  assert.equal(nextFavorite({ id: 'a' }, [{ id: 'a' }]), null);
});

test('map labels follow the chosen parts, longest first', async () => {
  const { labelVariants } = await import('../../web/js/widgets/map.js');
  const wx = { temp: 5, max: 7, min: 1, tz: 'Europe/Oslo' };
  const now = Date.UTC(2026, 9, 28, 12, 0);   // 13:00 in Oslo
  const all = { city: true, temp: true, hilo: true, time: true };
  const v = (fields, w = wx) => labelVariants('Oslo', w, SYSTEMS.metric, { fields: { ...all, ...fields }, now, clock: '24' });
  assert.deepEqual(v({ time: false }), [['Oslo', '5° · 7°/1°'], ['Oslo 5°'], ['Oslo']]);
  assert.deepEqual(v({}), [['Oslo', '5° · 7°/1° · 13:00'], ['Oslo', '5° · 7°/1°'], ['Oslo 5°'], ['Oslo']]);
  assert.deepEqual(v({ temp: false, hilo: false }), [['Oslo', '13:00'], ['Oslo 13:00'], ['Oslo']]);
  assert.deepEqual(v({ city: false, hilo: false, time: false }), [['5°']]);
  assert.deepEqual(v({ city: false, temp: false, hilo: false, time: false }), [], 'nothing chosen: no label');
  assert.deepEqual(v({ time: false }, null), [['Oslo']], 'no weather yet: the name');
});

test('radar loop: the next frame skips ones not loaded yet, and wraps', async () => {
  const { nextReady } = await import('../../web/js/widgets/radar.js');
  assert.equal(nextReady(0, [true, true, true]), 1);
  assert.equal(nextReady(2, [true, true, true]), 0);
  assert.equal(nextReady(0, [true, false, true]), 2);
  assert.equal(nextReady(1, [false, false, false]), 1, 'nothing ready: stay');
});

test('radar refresh follows RainViewer\'s 10-minute schedule', async () => {
  const { nextRadarCheck, RADAR_STEP, RADAR_LAG } = await import('../../web/js/api/extras.js');
  const frame = Date.UTC(2026, 9, 28, 10, 10);   // the newest frame we have: 10:10
  const data = { host: 'h', frames: [{ time: frame - RADAR_STEP, path: '/a' }, { time: frame, path: '/b' }] };
  const due = frame + RADAR_STEP + RADAR_LAG;      // 10:21:30, when the 10:20 frame should be out
  assert.equal(nextRadarCheck(data, frame + 3 * 60e3), due, 'fetched at 10:13: next at 10:21:30');
  assert.equal(nextRadarCheck(data, due + 5e3), due + 5e3 + 60e3, 'asked when due but no new frame yet: a minute later');
  assert.equal(nextRadarCheck(data, due + RADAR_STEP + 60e3), due + RADAR_STEP + 60e3 + 5 * 60e3, 'far behind: every 5 minutes');
  assert.equal(nextRadarCheck(null, 0), 0, 'nothing yet: now');
  assert.equal(nextRadarCheck({ time: frame, host: 'h', path: '/b' }, frame + 60e3), due, 'the old one-frame shape too');
});

test('large-screen layout: when it applies', async () => {
  const { wallFor } = await import('../../web/js/views/wall.js');
  assert.equal(wallFor('auto', 3440, 1300), true);
  assert.equal(wallFor('auto', 1920, 1080), true);
  assert.equal(wallFor('auto', 1800, 900), true, 'from 1800 × 900');
  assert.equal(wallFor('auto', 1600, 1000), false, 'too narrow');
  assert.equal(wallFor('auto', 1920, 880), false, 'too short');
  assert.equal(wallFor('auto', 3440, 1300, '1440'), false, 'page width capped below the threshold');
  assert.equal(wallFor('fit', 800, 600), true);
  assert.equal(wallFor('scroll', 3840, 2160), false);
});

test('large-screen hourly: as many hours as fill the tile, 6 to 24', async () => {
  const { hoursFor } = await import('../../web/js/views/dashboard.js');
  assert.equal(hoursFor({ w: 0, h: 0 }), 24);
  assert.equal(hoursFor({ w: 1060, h: 640 }), 14, '250 px of chart: 74 px an hour');
  assert.equal(hoursFor({ w: 1150, h: 1400 }), 6, 'tall: bigger, fewer');
  assert.equal(hoursFor({ w: 3000, h: 300 }), 24, 'wide and short: all 24');
});

test('large radar: 5×5 tiles, the place in the middle tile', async () => {
  const { tilesAround } = await import('../../web/js/widgets/radar.js');
  const small = tilesAround(52.52, 13.41);
  const big = tilesAround(52.52, 13.41, 2);
  assert.equal(small.tiles.length, 9);
  assert.equal(big.tiles.length, 25);
  assert.equal(big.size, 1280);
  assert.ok(big.px >= 512 && big.px < 768 && big.py >= 512 && big.py < 768);
});
