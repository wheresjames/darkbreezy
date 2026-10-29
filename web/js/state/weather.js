// Everything the dashboard shows for one place, as signals, loaded from
// the cache at once and refreshed from the network behind it
// (DARKBREEZY.md §4, data flow). Each source is fetched on its own, so one
// that fails or is slow holds nothing else up; its signal keeps the last
// data it had, with the error beside it.
//
//   const wx = placeWeather(place);    // in a view: stops with the view
//   wx.forecast.value                  // { data, at, error, loading }
//   wx.refresh({ force: true })
//
// Only the sources something on screen uses are fetched ([wanted]: the
// cards that are switched on); one that's wanted again is fetched then, if
// it's out of date. Their signals are there either way, with what's cached.

import { signal, effect, untrack, onCleanup } from '../core/signal.js';
import { loadForecast, loadAir, loadMarine } from '../api/openmeteo.js';
import { fetchAlerts } from '../api/alerts/registry.js';
import { fetchObservation, hasObservations } from '../api/obs.js';
import { discussion } from '../api/nws.js';
import { fetchAurora, fetchRadar, nextRadarCheck, AURORA_LATITUDE } from '../api/extras.js';
import { readCache, writeCache } from './cache.js';

const MIN = 60e3;
const TICK = 5 * MIN;

/**
 * name → { ttl (ms), when (place) → whether it applies, load, cache ('wx'|'alerts') }.
 * An empty answer (no sea here, say) is kept for `emptyTtl`. A source with
 * `dueAt(data, at)` is fetched when that says, on a timer of its own,
 * instead of by age: the radar follows RainViewer's 10-minute schedule.
 */
export const SOURCES = {
  forecast: { ttl: 10 * MIN, load: loadForecast },
  air: { ttl: 30 * MIN, load: loadAir },
  alerts: { ttl: 5 * MIN, load: fetchAlerts, cache: 'alerts' },
  marine: { ttl: 60 * MIN, emptyTtl: 30 * 24 * 60 * MIN, load: loadMarine },
  obs: { ttl: 10 * MIN, when: (p) => hasObservations(p.cc), load: fetchObservation },
  discussion: { ttl: 60 * MIN, when: (p) => p.cc === 'US', load: discussion },
  aurora: { ttl: 30 * MIN, when: (p) => Math.abs(p.lat) >= AURORA_LATITUDE, load: fetchAurora },
  radar: { dueAt: nextRadarCheck, load: (p, o) => fetchRadar(o) },
};

/** @typedef {{ data: any, at: number, error: Error|null, loading: boolean, tried?: number }} Slot */

const RETRY = 60e3;   // after a failed fetch of a scheduled source

/**
 * [wanted]: the source names to fetch, read in an effect so it can follow a
 * signal (the settings); every source when it's left out.
 */
export function placeWeather(place, { now = () => Date.now(), wanted = null } = {}) {
  const ctrl = new AbortController();
  const wx = {};
  for (const [name, src] of Object.entries(SOURCES)) {
    if (src.when && !src.when(place)) continue;
    const kept = readCache(src.cache || 'wx', place)?.[name];
    wx[name] = signal(/** @type {Slot} */ ({ data: kept?.data ?? null, at: kept?.at ?? 0, error: null, loading: false }));
  }

  /** When a scheduled source is next due (ms); never sooner than a minute after a failed try. */
  const dueAt = (name) => {
    const s = wx[name].peek();
    const due = SOURCES[name].dueAt(s.data, s.at);
    return s.error && s.tried ? Math.max(due, s.tried + RETRY) : due;
  };

  const stale = (name, t = now()) => {
    const s = wx[name].peek();
    const src = SOURCES[name];
    if (src.dueAt) return t >= dueAt(name);
    const ttl = s.at && s.data == null && src.emptyTtl ? src.emptyTtl : src.ttl;
    return !s.at || t - s.at >= ttl;
  };

  async function load(name) {
    const slot = wx[name];
    if (slot.peek().loading) return;
    slot.value = { ...slot.peek(), loading: true, tried: now() };
    try {
      // A source may hand over what it has so far (the warnings: api/alerts/registry.js).
      const onPartial = (data) => { if (!ctrl.signal.aborted) slot.value = { ...slot.peek(), data, error: null }; };
      const data = await SOURCES[name].load(place, { signal: ctrl.signal, onPartial });
      const at = now();
      slot.value = { data, at, error: null, loading: false };
      writeCache(SOURCES[name].cache || 'wx', place, { [name]: { data, at } });
    } catch (e) {
      if (ctrl.signal.aborted) return;
      slot.value = { ...slot.peek(), error: e, loading: false };
    }
    if (SOURCES[name].dueAt && needed(name)) arm(name);
  }

  // Scheduled sources: one timer each, set for when they're next due.
  const timers = {};
  function arm(name) {
    clearTimeout(timers[name]);
    if (ctrl.signal.aborted) return;
    const wait = Math.max(0, dueAt(name) - now());
    // Long waits are re-checked at least every 5 minutes (laptops sleep; clocks jump).
    timers[name] = setTimeout(() => {
      if (document.visibilityState !== 'visible' || !needed(name)) return;   // the visibility handler, or wanting it again, picks it up
      if (stale(name)) load(name); else arm(name);
    }, Math.min(wait, TICK));
  }
  const scheduled = Object.keys(wx).filter((n) => SOURCES[n].dueAt);

  // What's fetched: what's wanted (a retry, [only], is always a card that's showing).
  let want = new Set(Object.keys(wx));
  const needed = (n) => want.has(n);

  /** Fetch what's out of date (everything wanted with force; one source with only). */
  function refresh({ force = false, only = null } = {}) {
    const t = now();
    return Promise.all(Object.keys(wx).filter((n) => (only ? n === only : needed(n)) && (force || stale(n, t))).map(load));
  }

  const onVisible = () => {
    if (document.visibilityState !== 'visible') return;
    refresh();
    for (const n of scheduled) if (needed(n) && !wx[n].peek().loading) arm(n);
  };
  document.addEventListener('visibilitychange', onVisible);
  const timer = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, TICK);
  if (wanted) {
    let first = true;
    effect(() => {
      const next = new Set([...wanted()].filter((n) => n in wx));
      untrack(() => {
        const added = [...next].filter((n) => !want.has(n));
        want = next;
        for (const n of scheduled) if (!needed(n)) clearTimeout(timers[n]);
        // Switched back on: fetched now if it's out of date (the first time, the caller's refresh does it).
        if (!first) {
          for (const n of added) {
            if (stale(n)) load(n);
            else if (SOURCES[n].dueAt) arm(n);
          }
        }
        first = false;
      });
    });
  }
  for (const n of scheduled) if (needed(n)) arm(n);
  onCleanup(() => {
    ctrl.abort();
    clearInterval(timer);
    for (const n of scheduled) clearTimeout(timers[n]);
    document.removeEventListener('visibilitychange', onVisible);
  });

  return { ...wx, has: (n) => n in wx, refresh, stale };
}
