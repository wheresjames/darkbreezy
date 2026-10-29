import test from 'node:test';
import assert from 'node:assert/strict';
import '../helpers/env.mjs';
import { makeBackup, readBackup, cleanSettings, cleanPlaces, mergePlaces, packLink, unpackLink, isLink } from '../../web/js/util/backup.js';
import { DEFAULTS } from '../../web/js/state/defaults.js';
import { SETTINGS_VERSION } from '../../web/js/state/settings.js';
import { makePlace } from '../../web/js/util/place.js';

const berlin = makePlace({ name: 'Berlin', country: 'Germany', cc: 'DE', lat: 52.52, lon: 13.41 });
const tokyo = makePlace({ name: 'Tokyo', country: 'Japan', cc: 'JP', lat: 35.68, lon: 139.69 });

test('backup: everything, or the places only; never wallpaper mode', () => {
  const s = { ...DEFAULTS, theme: 'dark', wallpaper: true };
  const all = makeBackup(s, [berlin], 'everything', Date.UTC(2026, 9, 29));
  assert.equal(all.app, 'darkbreezy');
  assert.equal(all.version, SETTINGS_VERSION);
  assert.equal(all.exported, '2026-10-29');
  assert.equal(all.settings.theme, 'dark');
  assert.ok(!('wallpaper' in all.settings));
  assert.deepEqual(all.favorites, [{ name: 'Berlin', admin1: '', country: 'Germany', cc: 'DE', lat: 52.52, lon: 13.41 }]);
  const places = makeBackup(s, [berlin], 'places');
  assert.ok(!('settings' in places));
});

test('read back: the same settings and places', () => {
  const s = { ...DEFAULTS, theme: 'contrast', units: 'custom', custom: { ...DEFAULTS.custom, temp: 'f' }, dwell: 60, hidden: ['pollen'], alertTicker: 'never', quietLast: false };
  const b = readBackup(JSON.stringify(makeBackup(s, [berlin, tokyo])));
  assert.equal(b.kind, 'everything');
  assert.deepEqual(b.settings, { ...s, wallpaper: false });
  assert.deepEqual(b.favorites, [berlin, tokyo]);
  assert.equal(readBackup(makeBackup(s, [tokyo], 'places')).settings, null);
});

test('read back: anything unknown or invalid is dropped', () => {
  const s = cleanSettings({ theme: 'neon', dim: 400, clock: '24', wallpaper: true, evil: '<script>', custom: { temp: 'kelvin', wind: 'kn' },
    mapLabels: { city: 'yes', time: false }, order: ['moon', 'nope', 'moon'], hidden: 'pollen' });
  assert.deepEqual(s, {
    clock: '24',
    custom: { ...DEFAULTS.custom, wind: 'kn' },
    mapLabels: { ...DEFAULTS.mapLabels, time: false },
    order: ['moon', ...DEFAULTS.order.filter((id) => id !== 'moon')],
  });
  assert.deepEqual(cleanPlaces([{ name: 'Nowhere', lat: 95, lon: 0 }, { lat: '1', lon: '2' }, null, { name: 'Again', lat: 1, lon: 2 }]).map((p) => p.id),
    [makePlace({ lat: 1, lon: 2 }).id], 'bad coordinates and repeats left out');
});

test('read back: an older backup goes through the settings migrations', () => {
  const b = readBackup({ app: 'darkbreezy', kind: 'everything', version: 4, settings: { order: ['warnings', 'sun', 'wind'], hidden: ['sun'] }, favorites: [] });
  assert.deepEqual(b.settings.order.slice(0, 4), ['warnings', 'sun', 'moon', 'wind']);
  assert.deepEqual(b.settings.hidden, ['sun', 'moon']);
});

test('read back: what isn\'t a backup says so', () => {
  assert.throws(() => readBackup('not json'), /not JSON/);
  assert.throws(() => readBackup({ hello: 1 }), /isn't a Dark Breezy backup/);
  assert.throws(() => readBackup({ app: 'darkbreezy', version: SETTINGS_VERSION + 1, favorites: [berlin] }), /newer Dark Breezy/);
  assert.throws(() => readBackup({ app: 'darkbreezy', kind: 'places', version: 1, favorites: [] }), /nothing in it/);
});

test('places: added after yours, without repeats, or swapped', () => {
  assert.deepEqual(mergePlaces([berlin], [tokyo, berlin]), [berlin, tokyo]);
  assert.deepEqual(mergePlaces([berlin], [tokyo], true), [tokyo]);
});

test('links: packed small, unpacked from the data or the whole address', async () => {
  const many = Array.from({ length: 20 }, (_, i) => makePlace({ name: `City ${i}`, country: 'Countryland', cc: 'US', lat: 10 + i, lon: 20 + i }));
  const b = makeBackup(DEFAULTS, many);
  const data = await packLink(b);
  assert.match(data, /^z[A-Za-z0-9_-]+$/);
  assert.ok(data.length < JSON.stringify(b).length / 2, `${data.length} characters`);
  const url = `https://darkbreezy.com/#/import/${data}`;
  assert.ok(isLink(url));
  assert.ok(!isLink(JSON.stringify(b)));
  assert.deepEqual(await unpackLink(url), b);
  assert.deepEqual(await unpackLink(data), b);
  await assert.rejects(unpackLink(data.slice(0, 40)), /damaged or cut short/);
  await assert.rejects(unpackLink('https://darkbreezy.com/#/settings'), /no backup/);
});
