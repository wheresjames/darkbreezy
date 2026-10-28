// The dashboard (#/ and #/place/...): the hero and the cards for one place,
// drawn at once from the cache and refreshed behind it (state/weather.js).
// Each card re-renders on its own when its data changes, so a slow source
// only holds up its own card.

import { h, dynamic, icon } from '../core/h.js';
import { t } from '../core/i18n.js';
import { effect, signal, untrack, computed, onCleanup } from '../core/signal.js';
import { navigate } from '../core/router.js';
import { settings, widgetOrder, wallpaperFromAddress, WIDGETS } from '../state/settings.js';
import { homePlace, rememberPlace, refreshFavorite, isFavorite, favorites } from '../state/favorites.js';
import { placeWeather } from '../state/weather.js';
import { readCache, writeCache } from '../state/cache.js';
import { unitsFor } from '../util/units.js';
import { ago } from '../util/time.js';
import { placeFromRoute, placeHash, placeLabel } from '../util/place.js';
import { reverse } from '../api/geocode.js';
import { hero } from '../widgets/hero.js';
import { WIDGET_IMPLS } from '../widgets/index.js';
import { setSky, clearSky } from '../sky/sky.js';
import { wallMode, fitToScreen } from './wall.js';
import { COMPACT } from '../widgets/compact.js';
import { masonry, naturalHeight } from '../widgets/masonry.js';
import { worldMap } from '../widgets/map.js';
import { rotateFrom } from '../state/rotate.js';
import { setTitle } from './common.js';

/** A clock that ticks once a minute (until [abort]), for "updated 4 min ago" and the hero. */
function minuteClock(abort) {
  const now = signal(Date.now());
  const timer = setInterval(() => { now.value = Date.now(); }, 60e3);
  abort.addEventListener('abort', () => clearInterval(timer));
  return now;
}

export function dashboardView(r, { signal: abort, chrome }) {
  let place = r.name === 'place' ? placeFromRoute(r.params, r.query) : homePlace();
  if (!place) {
    clearSky();
    return welcome();
  }
  // Home (#/) shows the home place under its own address, so it can be shared.
  if (r.name === 'home') history.replaceState(history.state, '', placeHash(place));
  rememberPlace(place);
  chrome.place.value = place;
  setTitle(placeLabel(place));

  const now = minuteClock(abort);
  const wx = placeWeather(place);

  // A place from bare coordinates (a shared link, "lat,lon" typed in) has no
  // country yet, and the country picks the warning sources: look it up once.
  if (!place.cc) {
    const kept = readCache('wx', place)?.named;
    const named = kept || reverse(place.lat, place.lon, { signal: abort }).then((p) => { writeCache('wx', place, { named: p }); return p; });
    Promise.resolve(named).then((p) => {
      if (abort.aborted || !p) return;
      const better = { ...place, cc: p.cc, country: p.country, admin1: p.admin1, name: /°[NS]/.test(place.name) ? p.name : place.name };
      // Only when it found something: at sea there's no country, and the same address again would
      // look it up again, round and round.
      if (placeHash(better) !== placeHash(place)) navigate(placeHash(better), { replace: true });
    }, () => { /* stays without a country: global warnings only */ });
  }
  // Favorites keep the latest details (name, country) found for them.
  if (isFavorite(place, untrack(() => favorites.peek().list))) refreshFavorite(place);

  wx.refresh();

  // Cards read the clock without following it: re-drawing them every minute
  // would reset the hourly strip's scroll. They move on with each refresh.
  const ctx = ({ live = false } = {}) => {
    const s = settings.value;
    const values = {};
    return {
      place,
      s,
      units: unitsFor(s, navigator.language),
      clock: s.clock,
      tz: wx.forecast.value.data?.tz || 'UTC',
      now: live ? now.value : now.peek(),
      wx: values,
      retry: (name) => wx.refresh({ force: true, only: name }),
      read(names) { for (const n of names) if (wx.has(n)) values[n] = wx[n].value; return this; },
    };
  };

  // The sky follows the current weather at the place.
  effect(() => {
    const f = wx.forecast.value.data;
    setSky({ lat: place.lat, lon: place.lon, code: f?.current.code ?? 0, cloud: f?.current.cloud ?? 0 });
  });
  abort.addEventListener('abort', clearSky);

  const status = () => {
    const slots = Object.keys(wx).filter((k) => wx.has(k)).map((k) => wx[k].value);
    const f = wx.forecast.value;
    const loading = slots.some((x) => x.loading);
    const offline = f.error && f.data;
    return h('div.updated',
      h('span', f.at ? t('Updated {ago}', { ago: ago(f.at, now.value) }) : t('Loading…')),
      offline && h('span.stale-note', t('(couldn\'t refresh: showing saved data)')),
      h('button.icon-btn', { type: 'button', class: { 'is-loading': loading }, 'aria-label': t('Refresh'), title: t('Refresh'), onclick: () => wx.refresh({ force: true }) }, icon('refresh')));
  };

  rotateFrom(place);
  effect(() => { document.body.classList.toggle('map-on', settings.value.showMap); });
  abort.addEventListener('abort', () => document.body.classList.remove('map-on'));
  const map = worldMap(place, () => wx.forecast.value.data?.tz);
  // Made once, placed by whichever layout is on.
  const heroSide = h('div.hero-side',
    dynamic(() => hero(ctx({ live: true }).read(['forecast']))),
    dynamic(status));

  // With no warnings in effect (known, not just not loaded yet), their card goes last.
  const quiet = computed(() => wx.alerts.value.data?.alerts?.length === 0);
  const inEffect = computed(() => (wx.alerts.value.data?.alerts?.length || 0) > 0);
  // [extra]: more for the card's context (an object, or a function read inside its update).
  const card = (id, extra = {}) => {
    const w = WIDGET_IMPLS[id];
    return dynamic(() => w.render(Object.assign(ctx().read(w.uses), typeof extra === 'function' ? extra() : extra)));
  };
  const shown = (s) => widgetOrder(s).filter((id) => !s.hidden.includes(id) && WIDGET_IMPLS[id]);

  /** Today's layout: the hero (with the map beside it) and every card, packed (widgets/masonry.js). */
  function normal() {
    const heroCell = h('div.hero-cell.no-fill', { class: { 'has-map': () => settings.value.showMap } },
      heroSide,
      () => settings.value.showMap && map);
    const grid = h('div.grid', () => {
      const ids = shown(settings.value);
      if (quiet.value && ids.includes('warnings')) ids.push(...ids.splice(ids.indexOf('warnings'), 1));
      return [heroCell, ...ids.map((id) => card(id))];
    });
    onCleanup(masonry(grid));
    return grid;
  }

  /**
   * The large-screen layout (views/wall.js decides when): warnings in effect
   * across the top, then a band of feature tiles sharing the height that's
   * left (now, map, radar, hourly over 10 days), and the other cards along
   * the bottom at their natural size.
   */
  function wallLayout() {
    // Warnings in effect: the thin bar across the top. Loading, couldn't check, or none:
    // the usual card, last among the small cards.
    const strip = () => inEffect.value && shown(settings.value).includes('warnings') && h('div.wall-alerts', card('warnings', { bar: true, wallpaper: wallpaperFromAddress }));
    // Hourly shows as many hours as read well in half the forecast tile.
    const timeSize = signal({ w: 0, h: 0 });
    const band = () => {
      const s = settings.value;
      const ids = shown(s);
      const tiles = [h('div.feature.feature-now', { dataset: { weight: 3 } }, heroSide)];
      // Map and radar side by side, or one over the other when the band is tall (css/layout.css).
      const pair = [];
      if (s.showMap) pair.push(h('div.feature.feature-map', map));
      if (ids.includes('radar')) pair.push(h('div.feature.feature-radar', card('radar', { large: true })));
      if (pair.length) tiles.push(h('div.feature-pair', { dataset: { weight: 4 * pair.length + 1 } }, pair));
      const time = ['hourly', 'daily'].filter((id) => ids.includes(id));
      if (time.length) {
        const tile = h('div.feature.feature-time', { dataset: { weight: 5 } }, time.map((id) => card(id, id === 'hourly' ? () => ({ large: true, hours: hoursFor(timeSize.value, time.length) }) : { large: true })));
        const sizes = new ResizeObserver(([e]) => {
          const { width, height } = e.contentRect;
          if (Math.abs(width - timeSize.peek().w) > 20 || Math.abs(height - timeSize.peek().h) > 20) timeSize.value = { w: width, h: height };
        });
        sizes.observe(tile);
        onCleanup(() => sizes.disconnect());
        tiles.push(tile);
      }
      return h('div.feature-band', { style: { 'grid-template-columns': tiles.map((x) => `minmax(0, ${x.dataset.weight}fr)`).join(' ') } }, tiles);
    };
    // The small cards: each full or compact (widgets/compact.js), and some dropped, as
    // fitting the window needs (views/wall.js); the most wanted first, by the card order.
    const level = new Map();
    const levelOf = (id) => { if (!level.has(id)) level.set(id, signal('full')); return level.get(id); };
    const dropped = signal(/** @type {string[]} */ ([]));
    const interactive = !wallpaperFromAddress;
    const smallIds = () => {
      const ids = shown(settings.value).filter((id) => !FEATURED.has(id) && (id !== 'warnings' || !inEffect.value));
      // Quiet warnings: last, as in the usual layout.
      if (ids.includes('warnings')) ids.push(...ids.splice(ids.indexOf('warnings'), 1));
      return ids;
    };
    const smallCard = (id) => {
      const w = WIDGET_IMPLS[id];
      return dynamic(() => {
        const c = ctx().read(w.uses);
        return levelOf(id).value === 'compact' && COMPACT[id] ? COMPACT[id](c) : w.render(c);
      });
    };
    const moreOpen = signal(false);
    const instruments = h('div.grid.instruments', () => {
      const gone = dropped.value;
      const ids = smallIds().filter((id) => !gone.includes(id));
      return [...ids.map(smallCard), interactive && gone.length > 0 && moreCard(gone, moreOpen, (id) => {
        const w = WIDGET_IMPLS[id];
        return dynamic(() => w.render(ctx().read(w.uses)));
      })];
    });
    onCleanup(masonry(instruments));
    const wallEl = h('div.wall', strip, band, instruments);
    const cards = {
      more: interactive ? 64 : 0,
      reset() { dropped.value = []; for (const s of level.values()) s.value = 'full'; },
      measure() {
        dropped.value = [];
        const ids = smallIds();
        const height = (lv) => {
          for (const id of ids) levelOf(id).value = lv;
          return Object.fromEntries(ids.map((id) => {
            const el = instruments.querySelector(`:scope > [data-widget="${id}"]`);
            return [id, el ? naturalHeight(el) : 0];
          }));
        };
        const full = height('full');
        const compact = height('compact');
        return ids.filter((id) => full[id] > 0).map((id) => {
          const el = instruments.querySelector(`:scope > [data-widget="${id}"]`);
          const cs = el ? getComputedStyle(el) : null;
          const span = cs && /span 2/.test(`${cs.gridColumnStart} ${cs.gridColumnEnd}`) ? 2 : 1;
          return { id, span, full: full[id], compact: compact[id] || full[id] };
        });
      },
      apply({ level: chosen, dropped: gone }) {
        for (const [id, lv] of Object.entries(chosen)) levelOf(id).value = lv;
        dropped.value = gone;
      },
    };
    // Fitted to the window (views/wall.js): compact and drop cards, shrink only as a last resort.
    onCleanup(fitToScreen(wallEl, { cards }));
    return wallEl;
  }

  const wall = wallMode(abort);
  effect(() => { document.body.classList.toggle('wall-mode', wall.value); });
  abort.addEventListener('abort', () => document.body.classList.remove('wall-mode'));
  return h('div.dashboard', dynamic(() => {
    const on = wall.value;
    return untrack(() => (on ? wallLayout() : normal()));
  }));
}

/**
 * How many hours the hourly chart shows in a [size] forecast tile shared
 * by [cards] cards: enough to fill the width when the chart is scaled to
 * its share of the height (its drawing is 58 × 196 px per hour), 6 to 24:
 * fewer hours, bigger, rather than all of them too small to read.
 */
export function hoursFor(size, cards = 2) {
  if (!size.w || !size.h) return 24;
  const chartHeight = Math.max(120, size.h / cards - 70);   // less the card's title and padding
  return Math.max(6, Math.min(24, Math.round((size.w - 32) / (58 * chartHeight / 196))));
}

/** "+N more": the small cards there wasn't room for, opened in a panel. */
function moreCard(ids, open, render) {
  const names = Object.fromEntries(WIDGETS);
  return h('div.more-wrap', { dataset: { widget: 'more' } },
    h('button.card.compact.more-cards', { type: 'button', 'aria-expanded': () => String(open.value), onclick: () => { open.value = !open.value; } },
      h('span.compact-label', t('More cards')),
      h('span.compact-value', `+${ids.length}`),
      h('span.compact-extra', ids.map((id) => t(names[id])).join(', '))),
    () => open.value && h('div.more-panel', { role: 'dialog', 'aria-label': t('More cards'), onkeydown: (e) => { if (e.key === 'Escape') open.value = false; } },
      h('div.more-panel-head', h('strong', t('More cards')),
        h('button.icon-btn', { type: 'button', 'aria-label': t('Close'), onclick: () => { open.value = false; } }, icon('close'))),
      ids.map(render)));
}

/** Cards the large-screen layout shows as feature tiles rather than among the instruments. */
const FEATURED = new Set(['hourly', 'daily', 'radar']);

function welcome() {
  setTitle('');
  return h('div.sheet.welcome',
    h('h1', t('Weather, without the clutter')),
    h('p', t('Dark Breezy is a fast, private weather dashboard. No accounts, no ads, no tracking: everything stays in your browser.')),
    h('div.welcome-actions',
      h('a.btn.btn-primary', { href: '#/search' }, icon('search'), t('Find a place')),
      h('a.btn', { href: '#/search?locate=1' }, icon('locate'), t('Use my location'))));
}
