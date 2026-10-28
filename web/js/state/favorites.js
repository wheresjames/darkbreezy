// Favorite places (darkbreezy:favorites) and the place shown last
// (darkbreezy:last-place). The first favorite is where the app opens.

import { persisted } from '../core/store.js';
import { layered, fromAddress } from './settings.js';
import { makePlace } from '../util/place.js';

/** Favorites: stored, or for this page only the ones the address gives (fav=…, util/params.js). */
export const favorites = layered(persisted('favorites', { version: 1, defaults: { list: [] } }), fromAddress.favorites ? { list: fromAddress.favorites } : null);
export const lastPlace = persisted('last-place', { version: 1, defaults: { place: null } });

const keep = (p) => makePlace(p);

export const isFavorite = (p, list = favorites.value.list) => !!p && list.some((f) => f.id === p.id);

export function addFavorite(p) {
  favorites.update((f) => (isFavorite(p, f.list) ? f : { ...f, list: [...f.list, keep(p)] }));
}

export function removeFavorite(p) {
  favorites.update((f) => ({ ...f, list: f.list.filter((x) => x.id !== p.id) }));
}

export function toggleFavorite(p) {
  if (isFavorite(p, favorites.peek().list)) removeFavorite(p); else addFavorite(p);
}

/** Move the favorite at [from] to [to]. */
export function moveFavorite(from, to) {
  favorites.update((f) => {
    const list = [...f.list];
    if (from < 0 || from >= list.length || to < 0 || to >= list.length) return f;
    const [p] = list.splice(from, 1);
    list.splice(to, 0, p);
    return { ...f, list };
  });
}

/** Keep a favorite's details current (a better name found later), by id. */
export function refreshFavorite(p) {
  favorites.update((f) => (isFavorite(p, f.list) ? { ...f, list: f.list.map((x) => (x.id === p.id ? keep({ ...x, ...p }) : x)) } : f));
}

export function rememberPlace(p) {
  lastPlace.set({ place: keep(p) });
}

/** Where the app opens: the first favorite, else the place shown last, else nothing (the welcome page). */
export function homePlace() {
  return favorites.peek().list[0] || lastPlace.peek().place || null;
}
