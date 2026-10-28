// Current temperature and today's high/low at every favorite, for the
// map: one request for all of them (api/openmeteo.js loadSnapshots), kept
// in darkbreezy:favwx and refreshed when 10 minutes old or when the list
// of favorites changes.

import { signal, effect, onCleanup } from '../core/signal.js';
import { readJSON, writeJSON, PREFIX } from '../core/store.js';
import { loadSnapshots } from '../api/openmeteo.js';
import { favorites } from './favorites.js';

const KEY = `${PREFIX}favwx`;
const TTL = 10 * 60e3;

/** id → { temp, code, isDay, max, min }, with when it was fetched. */
export const favoritesWeather = signal(/** @type {{ at: number, ids: string, byId: Record<string, any> }} */ (readJSON(KEY) || { at: 0, ids: '', byId: {} }));

let loading = null;

/** Fetch if the list changed or the data is old; stops with the calling view. */
export function watchFavoritesWeather() {
  const ctrl = new AbortController();
  const check = () => {
    const list = favorites.peek().list;
    const ids = list.map((p) => p.id).join('|');
    const cur = favoritesWeather.peek();
    // Saved before snapshots had a time zone: fetch again, for the map's local times.
    const old = Object.values(cur.byId).some((x) => x && !('tz' in x));
    if (!list.length || loading || (cur.ids === ids && !old && Date.now() - cur.at < TTL)) return;
    loading = loadSnapshots(list, { signal: ctrl.signal }).then((snaps) => {
      const value = { at: Date.now(), ids, byId: Object.fromEntries(list.map((p, i) => [p.id, snaps[i]])) };
      favoritesWeather.value = value;
      writeJSON(KEY, value);
    }, () => { /* the map shows names only; the next check retries */ }).finally(() => { loading = null; });
  };
  effect(() => { favorites.value; check(); });
  const timer = setInterval(() => { if (document.visibilityState === 'visible') check(); }, 60e3);
  onCleanup(() => { ctrl.abort(); clearInterval(timer); });
}
