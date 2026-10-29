// Backups of the settings and places, to move them to another browser or
// keep them (Settings › Advanced › Back up and move, views/import.js).
// One format, JSON, three ways to carry it: a file, the clipboard, or a
// link with it packed into the address after the # (never sent to a
// server), #/import/<data>:
//
//   { "app": "darkbreezy", "kind": "everything" | "places", "version": 5,
//     "exported": "2026-10-29", "settings": { ... }, "favorites": [ ... ] }
//
// "version" is the settings' storage version, so an older backup goes
// through the same migrations as older stored settings. What's read back
// is checked value by value: anything unknown or invalid is dropped, never
// stored. The weather cache, the error log and the place shown last aren't
// part of it, nor wallpaper mode (only ever from the address).

import { migrate } from '../core/store.js';
import { DEFAULTS, WIDGETS } from '../state/defaults.js';
import { SETTINGS_VERSION, MIGRATIONS } from '../state/settings.js';
import { PARAMS } from './params.js';
import { UNITS } from './units.js';
import { makePlace, validCoords } from './place.js';

const APP = 'darkbreezy';
const CARD_IDS = WIDGETS.map(([id]) => id);
const LABEL_PARTS = ['show', 'city', 'temp', 'hilo', 'time'];

/** A backup of [settings] and [favorites] (with [kind] 'places', the places only), as a plain object. */
export function makeBackup(settings, favorites, kind = 'everything', now = Date.now()) {
  const out = { app: APP, kind, version: SETTINGS_VERSION, exported: new Date(now).toISOString().slice(0, 10) };
  if (kind === 'everything') {
    const { wallpaper, ...rest } = settings;
    out.settings = rest;
  }
  out.favorites = favorites.map(({ name, admin1, country, cc, lat, lon }) => ({ name, admin1, country, cc, lat, lon }));
  return out;
}

/** The settings in [data] that are known and valid (the rest dropped), as stored. */
export function cleanSettings(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const out = {};
  // The ones with an address parameter: their own check (written out, read back as from an address).
  for (const [key, parse] of Object.values(PARAMS).map(([k, p]) => [k, p])) {
    if (key === 'wallpaper' || !(key in data) || data[key] == null || typeof data[key] === 'object') continue;
    const v = parse(String(data[key]));
    if (v !== undefined) out[key] = v;
  }
  if (data.custom && typeof data.custom === 'object') {
    const custom = Object.fromEntries(Object.keys(UNITS).filter((u) => data.custom[u] in UNITS[u]).map((u) => [u, data.custom[u]]));
    if (Object.keys(custom).length) out.custom = { ...DEFAULTS.custom, ...custom };
  }
  if (data.mapLabels && typeof data.mapLabels === 'object') {
    const ml = Object.fromEntries(LABEL_PARTS.filter((k) => typeof data.mapLabels[k] === 'boolean').map((k) => [k, data.mapLabels[k]]));
    if (Object.keys(ml).length) out.mapLabels = { ...DEFAULTS.mapLabels, ...ml };
  }
  const cards = (v) => (Array.isArray(v) ? [...new Set(v.filter((id) => CARD_IDS.includes(id)))] : null);
  const order = cards(data.order);
  if (order?.length) out.order = [...order, ...CARD_IDS.filter((id) => !order.includes(id))];
  const hidden = cards(data.hidden);
  if (hidden) out.hidden = hidden;
  return out;
}

/** The places in [list] with valid coordinates, as favorites, without repeats. */
export function cleanPlaces(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const p of list) {
    if (!p || typeof p !== 'object' || !validCoords(Number(p.lat), Number(p.lon))) continue;
    const str = (v) => (typeof v === 'string' ? v.slice(0, 120) : '');
    const place = makePlace({ name: str(p.name), admin1: str(p.admin1), country: str(p.country), cc: str(p.cc).slice(0, 2), lat: Number(p.lat), lon: Number(p.lon) });
    if (seen.has(place.id)) continue;
    seen.add(place.id);
    out.push(place);
  }
  return out;
}

/**
 * A backup read back from [value] (an object, JSON text, or a link with
 * #/import/... in it, already unpacked by the caller: see unpackLink):
 * { kind, settings (only for 'everything': migrated, checked, over the
 * defaults), favorites, exported }. Throws an Error with a message to show.
 */
export function readBackup(value) {
  let b = value;
  if (typeof b === 'string') {
    try { b = JSON.parse(b); } catch { throw new Error('This isn\'t a Dark Breezy backup (not JSON).'); }
  }
  if (!b || typeof b !== 'object' || b.app !== APP) throw new Error('This isn\'t a Dark Breezy backup.');
  if (Number(b.version) > SETTINGS_VERSION) throw new Error('This backup is from a newer Dark Breezy. Refresh the app (Settings › Advanced › App files) and try again.');
  const kind = b.kind === 'places' ? 'places' : 'everything';
  const favorites = cleanPlaces(b.favorites);
  let settings = null;
  if (kind === 'everything' && b.settings && typeof b.settings === 'object') {
    const migrated = migrate({ v: Number(b.version) || 1, data: b.settings }, SETTINGS_VERSION, {}, MIGRATIONS);
    settings = { ...structuredClone(DEFAULTS), ...cleanSettings(migrated) };
  }
  if (!settings && !favorites.length) throw new Error('This backup has nothing in it to import.');
  return { kind: settings ? 'everything' : 'places', settings, favorites, exported: typeof b.exported === 'string' ? b.exported.slice(0, 10) : '' };
}

/** [current] places with [incoming] added (new ones at the end) or, with [replace], swapped for them. */
export function mergePlaces(current, incoming, replace = false) {
  if (replace) return incoming;
  const have = new Set(current.map((p) => p.id));
  return [...current, ...incoming.filter((p) => !have.has(p.id))];
}

// --- links: the JSON, deflated where the browser can, in base64url ------------

const toB64 = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

/** [backup] packed for a link: "z" + deflated, or "j" + the plain JSON where there's no CompressionStream. */
export async function packLink(backup) {
  const bytes = new TextEncoder().encode(JSON.stringify(backup));
  if (typeof CompressionStream === 'function') return `z${toB64(await pipe(bytes, new CompressionStream('deflate-raw')))}`;
  return `j${toB64(bytes)}`;
}

/** The backup object in [text]: a packed link's data, or an address with #/import/<data> in it. */
export async function unpackLink(text) {
  const data = String(text).trim().match(/(?:#\/import\/)?([zj][A-Za-z0-9_-]+)$/)?.[1];
  if (!data) throw new Error('This link has no backup in it.');
  try {
    const bytes = fromB64(data.slice(1));
    const json = data[0] === 'z' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes;
    return JSON.parse(new TextDecoder().decode(json));
  } catch {
    throw new Error('This link is damaged or cut short.');
  }
}

/** Whether [text] is a link with a backup in it, rather than JSON. */
export const isLink = (text) => /#\/import\/[zj][A-Za-z0-9_-]+\s*$/.test(String(text).trim());
