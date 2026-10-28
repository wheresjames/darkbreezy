// Finding places (#/search): type-ahead search (debounced, stale requests
// cancelled, arrow keys to move), "lat, lon" typed in, street addresses,
// "use my location" (only when asked: never on load), and the list of
// favorites, which can be reordered and removed here.

import { h, icon } from '../core/h.js';
import { t } from '../core/i18n.js';
import { signal } from '../core/signal.js';
import { navigate } from '../core/router.js';
import { searchPlaces, searchAddresses, reverse } from '../api/geocode.js';
import { favorites, removeFavorite, moveFavorite } from '../state/favorites.js';
import { parseCoords, makePlace, placeHash, placeLabel, flag, round2 } from '../util/place.js';
import { explain } from '../widgets/common.js';
import { setTitle, debounce } from './common.js';

export function searchView(r, { signal: abort }) {
  setTitle(t('Find a place'));
  const results = signal(/** @type {any[]} */ ([]));
  const state = signal(/** @type {'idle'|'loading'|'done'|'error'} */ ('idle'));
  const message = signal('');
  const active = signal(-1);
  const mode = signal('places');
  let pending = null;

  const go = (p) => navigate(placeHash(p));

  async function run(q) {
    pending?.abort();
    const text = q.trim();
    const coords = parseCoords(text);
    if (coords) {
      results.value = [makePlace({ name: '', ...coords })];
      state.value = 'done';
      return;
    }
    if (text.length < 2) { results.value = []; state.value = 'idle'; return; }
    pending = new AbortController();
    const both = AbortSignal.any([abort, pending.signal]);
    state.value = 'loading';
    try {
      const list = mode.peek() === 'addresses' ? await searchAddresses(text, { signal: both }) : await searchPlaces(text, { signal: both });
      results.value = list;
      active.value = list.length ? 0 : -1;
      state.value = 'done';
    } catch (e) {
      if (both.aborted) return;
      message.value = explain(e);
      state.value = 'error';
    }
  }
  const later = debounce(run, 250);
  abort.addEventListener('abort', () => { later.cancel(); pending?.abort(); });

  const input = h('input.search-input', {
    type: 'search', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'search',
    placeholder: t('City, postal code, or lat, lon'), 'aria-label': t('Search for a place'),
    role: 'combobox', 'aria-expanded': () => String(results.value.length > 0), 'aria-controls': 'search-results',
    'aria-activedescendant': () => (active.value >= 0 ? `result-${active.value}` : null),
    oninput: (e) => later(e.target.value),
    onkeydown: (e) => {
      const n = results.peek().length;
      if (e.key === 'ArrowDown' && n) { e.preventDefault(); active.value = (active.peek() + 1) % n; }
      else if (e.key === 'ArrowUp' && n) { e.preventDefault(); active.value = (active.peek() - 1 + n) % n; }
      else if (e.key === 'Enter') {
        e.preventDefault();
        later.cancel();
        const coords = parseCoords(e.target.value);
        const pick = coords ? makePlace({ name: '', ...coords }) : results.peek()[active.peek()];
        if (pick) go(pick); else run(e.target.value);
      }
    },
  });

  const locating = signal(false);
  const locateError = signal('');
  function locate() {
    if (!('geolocation' in navigator)) { locateError.value = t('This browser can\'t share its location.'); return; }
    locating.value = true;
    locateError.value = '';
    navigator.geolocation.getCurrentPosition(async (pos) => {
      // Rounded (about 1 km) before it goes anywhere, the name lookup included.
      const lat = round2(pos.coords.latitude);
      const lon = round2(pos.coords.longitude);
      let p;
      try { p = await reverse(lat, lon, { signal: abort }); } catch { p = makePlace({ name: '', lat, lon }); }
      locating.value = false;
      if (!abort.aborted) go(p);
    }, (err) => {
      locating.value = false;
      locateError.value = err.code === 1 ? t('Location access was denied. You can allow it in your browser\'s site settings.') : t('Couldn\'t find your location.');
    }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60e3 });
  }
  if (r.query.get('locate')) queueMicrotask(locate);

  const resultList = h('ul.results#search-results', { role: 'listbox', 'aria-label': t('Results') }, () => results.value.map((p, i) => h('li', {
    id: `result-${i}`, role: 'option', 'aria-selected': () => String(active.value === i), class: { active: () => active.value === i },
  }, h('a.result', { href: placeHash(p), onmouseenter: () => { active.value = i; } },
    h('span.result-flag', { 'aria-hidden': 'true' }, flag(p.cc)),
    h('span.result-text', h('strong', p.name), h('span.muted', [p.admin1 !== p.name && p.admin1, p.country].filter(Boolean).join(', ')))))));

  setTimeout(() => input.focus(), 0);

  return h('div.sheet.search-page',
    h('h1', t('Find a place')),
    h('div.search-box', icon('search'), input),
    h('div.search-modes', { role: 'radiogroup', 'aria-label': t('Search for') },
      ...[['places', t('Cities & towns')], ['addresses', t('Addresses')]].map(([m, label]) => h('button.btn.btn-small', {
        type: 'button', role: 'radio', 'aria-checked': () => String(mode.value === m), class: { selected: () => mode.value === m },
        onclick: () => { mode.value = m; run(input.value); },
      }, label))),
    h('div.search-status', { 'aria-live': 'polite' }, () => {
      const st = state.value;
      if (st === 'loading') return h('p.muted', t('Searching…'));
      if (st === 'error') return h('p.error-text', message.value);
      if (st === 'done' && !results.value.length) return h('p.muted', t('No places found. Try another spelling, or switch to addresses.'));
      return null;
    }),
    resultList,
    h('p', h('button.btn', { type: 'button', onclick: locate, disabled: () => locating.value }, icon('locate'), () => (locating.value ? t('Finding you…') : t('Use my location')))),
    () => locateError.value && h('p.error-text', locateError.value),
    h('p.small.muted', t('Your location is only looked up when you ask, and only rounded coordinates (about 1 km) are sent to the weather services.')),
    favoritesEditor());
}

/** The favorites list: open, move up/down (or drag), remove. */
function favoritesEditor() {
  let dragFrom = -1;
  return h('section.favorites-editor', () => {
    const list = favorites.value.list;
    if (!list.length) return h('p.small.muted', t('Star a place on its page to keep it here. The first one is where Dark Breezy opens.'));
    // From the page's address (fav=): shown, but dimmed and not editable here.
    const locked = favorites.overridden.length > 0;
    const items = h('ol.fav-list', list.map((p, i) => h('li.fav', locked ? {} : {
      draggable: 'true',
      ondragstart: (e) => { dragFrom = i; e.dataTransfer.effectAllowed = 'move'; },
      ondragover: (e) => { e.preventDefault(); },
      ondrop: (e) => { e.preventDefault(); if (dragFrom >= 0) moveFavorite(dragFrom, i); dragFrom = -1; },
    },
    h('a.fav-name', { href: placeHash(p) }, h('span', { 'aria-hidden': 'true' }, flag(p.cc)), ` ${placeLabel(p)}`, i === 0 && h('span.fav-home', t('home'))),
    h('span.fav-actions',
      h('button.icon-btn', { type: 'button', disabled: locked || i === 0, 'aria-label': t('Move {name} up', { name: p.name }), onclick: () => moveFavorite(i, i - 1) }, icon('chevron-up')),
      h('button.icon-btn', { type: 'button', disabled: locked || i === list.length - 1, 'aria-label': t('Move {name} down', { name: p.name }), onclick: () => moveFavorite(i, i + 1) }, icon('chevron-down')),
      h('button.icon-btn', { type: 'button', disabled: locked, 'aria-label': t('Remove {name}', { name: p.name }), onclick: () => removeFavorite(p) }, icon('trash'))))));
    return [
      h('h2', t('Your places')),
      locked && h('p.small.muted.from-url-note', t('Set by this page\'s address.')),
      items,
    ];
  });
}
