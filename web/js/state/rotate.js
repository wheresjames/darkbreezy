// Rotate: show each favorite in turn, [dwell] seconds each (Settings ›
// Rotate). Started by the dashboard view; switching places restarts the
// clock, and so does any touch, click, key or scroll, so it never moves on
// while someone's reading. Paused while the tab is hidden.

import { signal, effect, onCleanup } from '../core/signal.js';
import { navigate } from '../core/router.js';
import { settings } from './settings.js';
import { favorites } from './favorites.js';
import { placeHash } from '../util/place.js';

/** When the next place shows (ms), or 0 when not rotating: for the map's progress bar. */
export const nextTurn = signal(0);

/** The favorite after [place] (the first one when it isn't a favorite). */
export function nextFavorite(place, list) {
  if (list.length < 2) return null;
  const i = list.findIndex((f) => f.id === place.id);
  return list[(i + 1) % list.length];
}

/** Run the rotation while on [place]'s dashboard. */
export function rotateFrom(place) {
  let timer = 0;
  const stop = () => { clearTimeout(timer); timer = 0; nextTurn.value = 0; };
  const start = () => {
    clearTimeout(timer);
    const s = settings.peek();
    const next = nextFavorite(place, favorites.peek().list);
    if (!s.rotate || !next || document.visibilityState !== 'visible') { stop(); return; }
    const ms = Math.max(5, Number(s.dwell) || 30) * 1000;
    nextTurn.value = Date.now() + ms;
    // replace: a wall display shouldn't pile up history entries.
    timer = setTimeout(() => navigate(placeHash(next), { replace: true }), ms);
  };
  const restart = () => { if (timer) start(); };
  effect(() => { settings.value.rotate; settings.value.dwell; favorites.value; start(); });
  const events = ['pointerdown', 'keydown', 'wheel'];
  for (const e of events) window.addEventListener(e, restart, { passive: true });
  document.addEventListener('visibilitychange', start);
  onCleanup(() => {
    stop();
    for (const e of events) window.removeEventListener(e, restart);
    document.removeEventListener('visibilitychange', start);
  });
}
