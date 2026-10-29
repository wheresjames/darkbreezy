// Settings in the address, for wallpaper apps and other places where all
// you can give Dark Breezy is a URL: ?wallpaper=1&dim=40&rotate=1#/place/…
// Every setting has a parameter (PARAMS); favorites too (fav=lat,lon,Name|…).
// They apply to that page only and are never saved (state/settings.js
// layers them over what's stored), so trying ?wallpaper=1 in a browser
// doesn't leave it in wallpaper mode. Invalid values are ignored.

import { UNITS } from './units.js';
import { WIDGETS, DWELLS, PAGE_WIDTHS } from '../state/defaults.js';
import { makePlace, validCoords } from './place.js';

const bool = (v) => (/^(1|true|yes|on)$/i.test(v) ? true : /^(0|false|no|off)$/i.test(v) ? false : undefined);
const oneOf = (list) => (v) => (list.includes(v) ? v : undefined);
const int = (min, max) => (v) => (/^\d+$/.test(v) && Number(v) >= min && Number(v) <= max ? Number(v) : undefined);
const CARD_IDS = WIDGETS.map(([id]) => id);
const PARTS = ['city', 'temp', 'hilo', 'time'];

/** name → [setting key, parse(string) → value or undefined, format(value) → string]. */
export const PARAMS = {
  wallpaper: ['wallpaper', bool, (v) => (v ? '1' : '0')],
  dim: ['dim', int(0, 90), String],
  theme: ['theme', oneOf(['auto', 'light', 'dark', 'contrast']), String],
  units: ['units', oneOf(['auto', 'metric', 'imperial', 'uk', 'custom']), String],
  clock: ['clock', oneOf(['auto', '12', '24']), String],
  aqi: ['aqi', oneOf(['auto', 'us', 'eu']), String],
  width: ['maxWidth', oneOf(PAGE_WIDTHS.map(([v]) => v)), String],
  layout: ['layout', (v) => oneOf(['auto', 'scroll', 'fit'])(v) ?? layoutFrom(v), String],
  map: ['showMap', bool, (v) => (v ? '1' : '0')],
  rotate: ['rotate', bool, (v) => (v ? '1' : '0')],
  dwell: ['dwell', (v) => (DWELLS.includes(Number(v)) ? Number(v) : int(5, 3600)(v)), String],
  radar: ['radarAutoplay', bool, (v) => (v ? '1' : '0')],
  ticker: ['alertTicker', oneOf(['auto', 'always', 'never']), String],
  quietlast: ['quietLast', bool, (v) => (v ? '1' : '0')],
};
// Custom units: temp=f, wind=kn ... (they also set units=custom).
const UNIT_PARAMS = Object.keys(UNITS);

/**
 * Layout from the two settings it replaced (and their old parameters):
 * Large-screen layout [wallMode] on/off, Fit to the window [fit] always.
 * Undefined when they don't say.
 */
export function layoutFrom(wallMode, fit) {
  if (wallMode === 'off') return 'scroll';
  if (wallMode === 'on' || fit === 'always') return 'fit';
  return wallMode === 'auto' || fit ? 'auto' : undefined;
}

/** A list param: comma-separated, only known values, no repeats. */
const list = (v, known) => [...new Set(String(v).split(',').map((x) => x.trim()).filter((x) => known.includes(x)))];

/**
 * The settings and favorites an address's query gives:
 * { settings: { key: value, ... }, favorites: [places] | null, used: [param names] }.
 * @param {string} search  location.search ("?a=1&b=2")
 */
export function parseParams(search) {
  const q = new URLSearchParams(search);
  const settings = {};
  const used = [];
  for (const [name, [key, parse]] of Object.entries(PARAMS)) {
    if (!q.has(name)) continue;
    const v = parse(q.get(name));
    if (v === undefined) continue;
    settings[key] = v;
    used.push(name);
  }
  // Older addresses: layout=on|off (handled above) and fit=always|auto|never.
  if (!settings.layout && q.has('fit') && /^(auto|always|never)$/.test(q.get('fit'))) {
    settings.layout = layoutFrom(undefined, q.get('fit'));
    used.push('fit');
  }
  const custom = {};
  for (const u of UNIT_PARAMS) {
    if (q.has(u) && q.get(u) in UNITS[u]) { custom[u] = q.get(u); used.push(u); }
  }
  if (Object.keys(custom).length) {
    settings.custom = custom;
    settings.units = 'custom';
  }
  // labels=city,temp | labels=none
  if (q.has('labels')) {
    const v = q.get('labels');
    const parts = list(v, PARTS);
    if (v === 'none') settings.mapLabels = { show: false };
    else if (parts.length) settings.mapLabels = { show: true, ...Object.fromEntries(PARTS.map((p) => [p, parts.includes(p)])) };
    if (settings.mapLabels) used.push('labels');
  }
  // cards=hourly,daily,wind: exactly these, in this order. hide=pollen,aurora: all but these.
  if (q.has('cards')) {
    const shown = list(q.get('cards'), CARD_IDS);
    if (shown.length) {
      settings.order = [...shown, ...CARD_IDS.filter((id) => !shown.includes(id))];
      settings.hidden = CARD_IDS.filter((id) => !shown.includes(id));
      used.push('cards');
    }
  } else if (q.has('hide')) {
    settings.hidden = list(q.get('hide'), CARD_IDS);
    used.push('hide');
  }
  // fav=52.52,13.41,Berlin,DE|40.71,-74.01,New York,US
  let favorites = null;
  if (q.has('fav')) {
    favorites = q.get('fav').split('|').map((f) => {
      const [lat, lon, name = '', cc = ''] = f.split(',');
      return validCoords(Number(lat), Number(lon)) ? makePlace({ name: name.trim(), cc: cc.trim(), lat: Number(lat), lon: Number(lon) }) : null;
    }).filter(Boolean);
    if (favorites.length) used.push('fav'); else favorites = null;
  }
  return { settings, favorites, used };
}

/**
 * An address query for [s] (settings) and [favs]: only what differs from
 * [defaults], so the URL stays short. With [wallpaper], wallpaper=1 too.
 */
export function toParams(s, favs = [], defaults = {}, { wallpaper = false } = {}) {
  const q = new URLSearchParams();
  if (wallpaper) q.set('wallpaper', '1');
  for (const [name, [key, , format]] of Object.entries(PARAMS)) {
    if (name === 'wallpaper') continue;
    if (s[key] !== undefined && JSON.stringify(s[key]) !== JSON.stringify(defaults[key])) q.set(name, format(s[key]));
  }
  if (wallpaper && !q.has('dim')) q.set('dim', String(s.dim ?? defaults.dim));
  if (s.units === 'custom') for (const u of UNIT_PARAMS) q.set(u, s.custom[u]);
  const ml = s.mapLabels;
  if (ml && JSON.stringify(ml) !== JSON.stringify(defaults.mapLabels)) q.set('labels', ml.show ? PARTS.filter((p) => ml[p]).join(',') || 'none' : 'none');
  if (s.hidden?.length || (s.order && JSON.stringify(s.order) !== JSON.stringify(defaults.order))) {
    q.set('cards', s.order.filter((id) => !s.hidden.includes(id)).join(','));
  }
  if (favs.length) q.set('fav', favs.map((f) => [f.lat, f.lon, f.name.replace(/[,|]/g, ' '), f.cc].join(',')).join('|'));
  // URLSearchParams escapes "," and "|"; they're safe in a query and much easier to read.
  return q.toString().replace(/%2C/g, ',').replace(/%7C/g, '|');
}
