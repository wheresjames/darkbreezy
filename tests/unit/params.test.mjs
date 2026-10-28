// Settings in the address (web/js/util/params.js) and how they're layered
// over the stored settings (state/settings.js), never saved.
import test from 'node:test';
import assert from 'node:assert/strict';
import '../helpers/env.mjs';
import { parseParams, toParams, layoutFrom } from '../../web/js/util/params.js';
import { DEFAULTS } from '../../web/js/state/defaults.js';
import { overlay, layered } from '../../web/js/state/settings.js';

test('the wallpaper parameters', () => {
  const { settings, used } = parseParams('?wallpaper=1&dim=35');
  assert.deepEqual(settings, { wallpaper: true, dim: 35 });
  assert.deepEqual(used, ['wallpaper', 'dim']);
  assert.equal(parseParams('?wallpaper=off').settings.wallpaper, false);
  assert.equal(parseParams('?dim=95').settings.dim, undefined, 'never darker than 90 %');
});

test('every kind of setting', () => {
  const { settings: s } = parseParams('?theme=dark&units=uk&clock=24&aqi=eu&width=1440&layout=fit&map=0&rotate=1&dwell=60&radar=no&labels=city,time&hide=pollen,aurora');
  assert.deepEqual(s, {
    theme: 'dark', units: 'uk', clock: '24', aqi: 'eu', maxWidth: '1440', layout: 'fit', showMap: false,
    rotate: true, dwell: 60, radarAutoplay: false,
    mapLabels: { show: true, city: true, temp: false, hilo: false, time: true },
    hidden: ['pollen', 'aurora'],
  });
  assert.deepEqual(parseParams('?labels=none').settings.mapLabels, { show: false });
  assert.deepEqual(parseParams('?temp=f&wind=kn').settings, { custom: { temp: 'f', wind: 'kn' }, units: 'custom' });
  const cards = parseParams('?cards=daily,hourly').settings;
  assert.deepEqual(cards.order.slice(0, 2), ['daily', 'hourly']);
  assert.ok(cards.hidden.includes('wind') && !cards.hidden.includes('daily'));
});

test('invalid values are ignored', () => {
  const { settings, used } = parseParams('?theme=purple&clock=13&dwell=abc&cards=nope&wind=warp&labels=feet');
  assert.deepEqual(settings, {});
  assert.deepEqual(used, []);
});

test('favorites', () => {
  const { favorites } = parseParams('?fav=52.52,13.41,Berlin,DE|40.71,-74.01,New York,US|999,0,Nowhere');
  assert.deepEqual(favorites.map((f) => [f.name, f.cc, f.id]), [['Berlin', 'DE', '52.52,13.41'], ['New York', 'US', '40.71,-74.01']]);
  assert.equal(parseParams('?fav=').favorites, null);
});

test('an address built from settings reads back the same', () => {
  const s = overlay(DEFAULTS, { theme: 'dark', units: 'custom', custom: { ...DEFAULTS.custom, temp: 'f' }, rotate: true, dwell: 120, dim: 55, mapLabels: { show: true, city: true, temp: false, hilo: false, time: true }, hidden: ['pollen'] });
  const favs = [{ name: 'Berlin', cc: 'DE', lat: 52.52, lon: 13.41 }, { name: 'Oslo, city', cc: 'NO', lat: 59.91, lon: 10.75 }];
  const query = toParams(s, favs, DEFAULTS, { wallpaper: true });
  assert.ok(query.startsWith('wallpaper=1&'));
  assert.ok(!/%2C|%7C/.test(query), `readable: ${query}`);
  const back = parseParams(`?${query}`);
  assert.equal(back.settings.wallpaper, true);
  for (const k of ['theme', 'units', 'rotate', 'dwell', 'dim', 'mapLabels']) assert.deepEqual(back.settings[k], s[k], k);
  assert.equal(back.settings.custom.temp, 'f');
  assert.ok(back.settings.hidden.includes('pollen'));
  assert.deepEqual(back.favorites.map((f) => f.name), ['Berlin', 'Oslo  city']);
  assert.equal(toParams(DEFAULTS, [], DEFAULTS), '', 'defaults: nothing to say');
});

test('address settings are laid over the stored ones, and never saved', () => {
  let saved = { theme: 'light', mapLabels: { show: true, city: true, temp: true } };
  const area = { key: 'k', get value() { return saved; }, peek: () => saved, set: (v) => { saved = v; }, reload() {} };
  const s = layered(area, { theme: 'dark', mapLabels: { time: true } });
  assert.equal(s.value.theme, 'dark');
  assert.deepEqual(s.value.mapLabels, { show: true, city: true, temp: true, time: true }, 'objects merge');
  assert.equal(s.value, s.value, 'the same object until the stored one changes');
  s.update((x) => ({ ...x, theme: 'contrast', clock: '24' }));
  assert.equal(saved.theme, 'contrast', 'changes are saved');
  assert.equal(s.value.theme, 'dark', 'the address still wins on this page');
  assert.equal(s.value.clock, '24');
  assert.deepEqual(s.overridden, ['theme', 'mapLabels']);
});

test('leaving wallpaper mode: the same address without its parameters', async () => {
  const { withoutWallpaper } = await import('../../web/js/views/wallpaper.js');
  assert.equal(withoutWallpaper('https://x/?wallpaper=1&dim=40&clock=24#/place/1,2/A?n=A'), 'https://x/?clock=24#/place/1,2/A?n=A');
});

test('layout, and the older addresses that set it (layout=on|off, fit=...)', () => {
  for (const v of ['auto', 'scroll', 'fit']) assert.equal(parseParams(`?layout=${v}`).settings.layout, v);
  assert.equal(parseParams('?layout=on').settings.layout, 'fit');
  assert.equal(parseParams('?layout=off').settings.layout, 'scroll');
  assert.equal(parseParams('?layout=sideways').settings.layout, undefined);
  assert.equal(parseParams('?fit=always').settings.layout, 'fit');
  assert.equal(parseParams('?fit=never').settings.layout, 'auto');
  assert.equal(parseParams('?fit=sometimes').settings.layout, undefined);
  assert.equal(parseParams('?layout=off&fit=always').settings.layout, 'scroll', 'layout= wins');
  assert.equal(parseParams('?fit=always').settings.fit, undefined, 'the old setting is gone');
});

test('settings migration 4: Large-screen layout and Fit to the window become Layout', () => {
  assert.equal(layoutFrom('off', 'always'), 'scroll');
  assert.equal(layoutFrom('on', 'never'), 'fit');
  assert.equal(layoutFrom('auto', 'always'), 'fit');
  assert.equal(layoutFrom('auto', 'never'), 'auto');
  assert.equal(layoutFrom(undefined, undefined), undefined);
});
