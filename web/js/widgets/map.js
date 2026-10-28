// The world map beside the current conditions: the place on screen as a
// beacon, the favorites as dots (each a link to its dashboard) labelled
// with the temperature and today's high/low where there's room, and the
// night side shaded. It fills whatever space it's given; labels are placed
// again whenever its size changes (util/world.js placeLabels). The land
// is drawn from data/world-110m-v1.json (scripts/make-world-map.mjs),
// fetched once on first use.

import { h, icon } from '../core/h.js';
import { t } from '../core/i18n.js';
import { signal, onCleanup } from '../core/signal.js';
import { getJSON } from '../api/http.js';
import { settings } from '../state/settings.js';
import { favorites } from '../state/favorites.js';
import { favoritesWeather, watchFavoritesWeather } from '../state/favwx.js';
import { nextTurn } from '../state/rotate.js';
import { fmt, unitsFor } from '../util/units.js';
import { fmtTime } from '../util/time.js';
import { placeHash } from '../util/place.js';
import { VIEWBOX, fit, toPx, nightPath, placeLabels } from '../util/world.js';
import { s } from './charts.js';
import { scrollStrip } from './common.js';

const WORLD = new URL('../../data/world-110m-v1.json', import.meta.url).href;
let world = null;
const loadWorld = () => (world ??= getJSON(WORLD).catch((e) => { world = null; throw e; }));

/**
 * The label text a place can have, longest first, from the parts the user
 * chose (Settings › Map labels: city, temperature, high/low, local time):
 * the city over the rest, then city and the first of the rest on one line,
 * then one part alone. [] when nothing's chosen (or known): no label.
 * @param {string} name
 * @param {{ temp?: number|null, max?: number|null, min?: number|null, tz?: string } | null | undefined} wx
 * @param {Record<string,string>} units
 * @param {{ fields: { city: boolean, temp: boolean, hilo: boolean, time: boolean }, now?: number, clock?: string }} opts
 */
export function labelVariants(name, wx, units, { fields, now = Date.now(), clock = 'auto' }) {
  const rest = [
    fields.temp && wx?.temp != null && fmt('temp', wx.temp, units),
    fields.hilo && wx?.max != null && wx?.min != null && `${fmt('temp', wx.max, units)}/${fmt('temp', wx.min, units)}`,
    fields.time && wx?.tz && fmtTime(now, wx.tz, clock),
  ].filter(Boolean);
  const city = fields.city ? name : '';
  const variants = [];
  const add = (lines) => {
    const l = lines.filter(Boolean);
    if (l.length && !variants.some((v) => v.join('|') === l.join('|'))) variants.push(l);
  };
  add([city, rest.join(' · ')]);
  if (rest.length > 1) add([city, rest.slice(0, 2).join(' · ')]);
  add([[city, rest[0]].filter(Boolean).join(' ')]);
  add([city || rest[0]]);
  return variants;
}

/**
 * The map card for [place] ([tz]: its time zone, when known). A view calls
 * this once; it follows the favorites, their weather, the settings and its
 * own size by itself.
 */
export function worldMap(place, tz = () => null) {
  watchFavoritesWeather();
  const size = signal({ w: 0, h: 0 });
  const land = signal(/** @type {any} */ (null));
  loadWorld().then((d) => { land.value = d; }, () => { land.value = { land: '', borders: '' }; });
  const now = signal(Date.now());
  // Each minute: the night line moves slowly, but labels may show the time.
  const tick = setInterval(() => { now.value = Date.now(); }, 60e3);
  onCleanup(() => clearInterval(tick));

  const view = h('div.map-view');
  const sizes = new ResizeObserver(([e]) => {
    const { width, height } = e.contentRect;
    if (Math.abs(width - size.peek().w) > 1 || Math.abs(height - size.peek().h) > 1) size.value = { w: width, h: height };
  });
  sizes.observe(view);
  onCleanup(() => sizes.disconnect());

  const svg = () => {
    const d = land.value;
    return s('svg', { viewBox: VIEWBOX, preserveAspectRatio: 'xMidYMid meet', class: 'map-svg', 'aria-hidden': 'true' },
      s('rect', { x: 0, y: 0, width: 360, height: 180, class: 'map-sea' }),
      d && s('path', { d: d.land, class: 'map-land' }),
      d && s('path', { d: d.borders, class: 'map-borders' }),
      s('path', { d: nightPath(now.value), class: 'map-night' }));
  };

  const markers = () => {
    const { w, h: ht } = size.value;
    if (!w || !ht) return null;
    const f = fit(w, ht);
    const units = unitsFor(settings.value, navigator.language);
    const byId = favoritesWeather.value.byId;
    const others = favorites.value.list.filter((p) => p.id !== place.id);
    const here = toPx(f, place.lat, place.lon);
    const list = others.map((p) => ({ p, ...toPx(f, p.lat, p.lon) }));
    const ml = settings.value.mapLabels;
    const fields = ml.show ? ml : { city: false, temp: false, hilo: false, time: false };
    // Only the time follows the clock: reading it otherwise would redraw every minute for nothing.
    const at = fields.time ? now.value : now.peek();
    const opts = { fields, now: at, clock: settings.value.clock };
    const labels = placeLabels([
      // The place on screen first: its weather is in the hero, so just its name and time.
      { id: place.id, x: here.x, y: here.y, variants: labelVariants(place.name, { tz: tz() }, units, { ...opts, fields: { ...fields, temp: false, hilo: false } }) },
      ...list.map((m) => ({ id: m.p.id, x: m.x, y: m.y, variants: labelVariants(m.p.name, byId[m.p.id], units, opts) })),
    ], w, ht);
    const label = (id, cls, href) => {
      const l = labels[id];
      if (!l) return null;
      const style = { left: `${l.x}px`, top: `${l.y}px` };
      const lines = l.lines.map((line) => h('span', line));
      // The dot is the link for keyboards and screen readers; the label is a second way to click it.
      return href ? h(`a.map-label.${cls}`, { href, style, tabindex: -1, 'aria-hidden': 'true' }, lines) : h(`span.map-label.${cls}`, { style }, lines);
    };
    return [
      ...list.map((m) => {
        const wx = byId[m.p.id];
        const desc = wx?.temp != null ? t('{name}: {temp}, high {max}, low {min}', { name: m.p.name, temp: fmt('temp', wx.temp, units), max: fmt('temp', wx.max, units), min: fmt('temp', wx.min, units) }) : m.p.name;
        const href = placeHash(m.p);
        return [
          h('a.map-fav', { href, style: { left: `${m.x}px`, top: `${m.y}px` }, 'aria-label': t('Show {place}', { place: desc }), title: desc }, h('span.map-dot')),
          label(m.p.id, 'fav-label', href),
        ];
      }),
      h('span.map-beacon', { style: { left: `${here.x}px`, top: `${here.y}px` }, role: 'img', 'aria-label': t('{place} (shown now)', { place: place.name }) }),
      label(place.id, 'here-label'),
    ];
  };

  const rotateButton = () => {
    if (favorites.value.list.length < 2) return null;
    const on = settings.value.rotate;
    // Set by the page's address (rotate=): the button couldn't change it, so it's dimmed and off.
    const locked = settings.overridden.includes('rotate');
    return h('button.btn.btn-small.rotate-btn', {
      type: 'button', 'aria-pressed': String(on), class: { on }, disabled: locked,
      title: locked ? t('Set by this page\'s address') : on ? t('Stop rotating through your places') : t('Show each of your places in turn, {n} s each', { n: settings.value.dwell }),
      onclick: () => settings.update((x) => ({ ...x, rotate: !x.rotate })),
    }, icon('refresh'), on ? t('Rotating') : t('Rotate'));
  };

  // A thin bar that fills until the next place shows; restarted by a new key.
  const progress = () => {
    const end = nextTurn.value;
    if (!end) return null;
    return h('span.rotate-progress', { 'aria-hidden': 'true', style: { 'animation-duration': `${Math.max(0, end - Date.now())}ms` } });
  };

  // Your places as chips, for switching with one tap (the header has them only when the map is off).
  const chips = () => {
    const list = favorites.value.list;
    if (list.length < 2) return null;
    return scrollStrip(h('nav.fav-strip.map-chips', { 'aria-label': t('Switch place') },
      list.map((f) => h('a.fav-chip', { href: placeHash(f), 'aria-current': f.id === place.id ? 'page' : null }, f.name))), 'map');
  };

  view.append(...[svg, markers].map((fn) => h('div.map-layer', fn)));
  return h('section.card.card-map', { 'aria-labelledby': 'w-map' },
    h('div.map-head',
      h('h2.card-title#w-map', t('Your places')),
      rotateButton),
    chips,
    view,
    () => !favorites.value.list.some((p) => p.id !== place.id) && h('p.card-note', t('Star places to see them on the map.')),
    progress);
}
