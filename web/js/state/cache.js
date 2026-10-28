// Weather data kept between visits, so the dashboard draws at once from
// what was fetched last and refreshes behind it (stale-while-revalidate,
// DARKBREEZY.md §4). One key per place and kind of data:
//
//   darkbreezy:wx:<lat>,<lon>       { at, forecast, air, marine, ... }
//   darkbreezy:alerts:<lat>,<lon>   { at, result }
//
// Only the 10 most recently used places are kept. A full storage drops
// the oldest places and tries again; data is never worth an error.

import { readJSON, writeRaw, readRaw, allKeys, PREFIX } from '../core/store.js';
import { coordKey } from '../util/place.js';

export const MAX_PLACES = 10;
const INDEX = `${PREFIX}wx-index`;
const KINDS = ['wx', 'alerts'];

const keyOf = (kind, p) => `${PREFIX}${kind}:${typeof p === 'string' ? p : coordKey(p)}`;

/** Most recently used first. */
export function cachedPlaces() {
  const list = readJSON(INDEX);
  return Array.isArray(list) ? list : [];
}

function touch(id) {
  const list = [id, ...cachedPlaces().filter((x) => x !== id)];
  for (const old of list.slice(MAX_PLACES)) for (const k of KINDS) writeRaw(keyOf(k, old), null);
  writeRaw(INDEX, JSON.stringify(list.slice(0, MAX_PLACES)));
}

/** What's kept for [p] of [kind] ('wx' or 'alerts'), or null. */
export function readCache(kind, p) {
  return readJSON(keyOf(kind, p));
}

/** Keep [value] for [p], merged into what's there. */
export function writeCache(kind, p, value) {
  const id = coordKey(p);
  const key = keyOf(kind, id);
  const text = JSON.stringify({ ...(readJSON(key) || {}), ...value });
  for (let attempt = 0; attempt < MAX_PLACES; attempt++) {
    try {
      localStorage.setItem(key, text);
      touch(id);
      return true;
    } catch {
      // Full: forget the least recently used other place, and retry.
      const others = cachedPlaces().filter((x) => x !== id);
      if (!others.length) break;
      for (const k of KINDS) writeRaw(keyOf(k, others.at(-1)), null);
      writeRaw(INDEX, JSON.stringify(cachedPlaces().filter((x) => x !== others.at(-1))));
    }
  }
  return false;
}

/** Forget everything kept for [p]. */
export function dropCache(p) {
  const id = coordKey(p);
  for (const k of KINDS) writeRaw(keyOf(k, id), null);
  writeRaw(INDEX, JSON.stringify(cachedPlaces().filter((x) => x !== id)));
}

/**
 * Every key of saved weather: each place's data and the index of them,
 * NWS's lookups (api/nws.js) and the favorites' map temperatures (state/favwx.js).
 */
const savedKeys = () => allKeys().filter((k) => /^(wx:|alerts:|wx-index$|nws:|favwx$)/.test(k.slice(PREFIX.length)));

/** Total size of the saved weather, in characters (for Settings › Advanced). */
export function cacheSize() {
  return savedKeys().reduce((n, k) => n + (readRaw(k) || '').length, 0);
}

/** Forget all saved weather (Settings › Advanced › Clear); settings and places stay. */
export function clearCache() {
  for (const k of savedKeys()) writeRaw(k, null);
}
