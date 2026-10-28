// The user's settings (darkbreezy:settings), as a signal. Everything has a
// default that follows the browser, so a first visit needs no setup.

import { persisted } from '../core/store.js';
import { WIDGETS, DEFAULTS, DWELLS, PAGE_WIDTHS } from './defaults.js';
import { parseParams, layoutFrom } from '../util/params.js';

export { WIDGETS, DEFAULTS, DWELLS, PAGE_WIDTHS };

/** [list] with [id] moved to just after [after] (unless it's already later). */
export function moveAfter(list, id, after) {
  const i = list.indexOf(id);
  const j = list.indexOf(after);
  if (i < 0 || j < 0 || i > j) return list;
  const out = list.filter((x) => x !== id);
  out.splice(out.indexOf(after) + 1, 0, id);
  return out;
}

const stored = persisted('settings', {
  version: 4,
  defaults: DEFAULTS,
  migrations: {
    // 2: "Next hours" moved after Hourly and Daily.
    2: (d) => (Array.isArray(d.order) ? { ...d, order: moveAfter(d.order, 'nowcast', 'daily') } : d),
    // 3: wallpaper mode comes only from the address now (a saved switch left no way back).
    3: (d) => ({ ...d, wallpaper: false }),
    // 4: "Large-screen layout" and "Fit to the window" became one setting, Layout.
    4: ({ wallMode, fit, ...d }) => ({ ...d, layout: layoutFrom(wallMode, fit) ?? 'auto' }),
  },
});

/** Deep-merge [patch] (plain objects merge; anything else replaces) over [base]. */
export function overlay(base, patch) {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' ? overlay(base[k], v) : v;
  }
  return out;
}

/**
 * A stored area seen through [patch]: reads show the stored value with
 * [patch] laid over it; writes go to storage as usual (and the patch still
 * wins while this page is open). `overridden` lists what the patch sets.
 */
export function layered(area, patch) {
  if (!patch || !Object.keys(patch).length) return Object.assign(area, { overridden: [] });
  let base;
  let merged;
  const view = (b) => (b === base ? merged : (base = b, merged = overlay(b, patch)));
  return {
    key: area.key,
    get value() { return view(area.value); },
    peek: () => view(area.peek()),
    set: (v) => area.set(v),
    update: (fn) => area.set(fn(area.peek())),
    reload: () => area.reload(),
    overridden: Object.keys(patch),
  };
}

/** Settings and favorites given in the address (util/params.js): this page only, never saved. */
export const fromAddress = typeof location === 'undefined' ? { settings: {}, favorites: null, used: [] } : parseParams(location.search);

export const settings = layered(stored, fromAddress.settings);

/** Wallpaper mode: only ever from the address (?wallpaper=1), never stored, so a normal visit can't land in it. */
export const wallpaperFromAddress = fromAddress.settings.wallpaper === true;

/** The widget order, with any widgets added since the user's order was saved at the end. */
export function widgetOrder(s = settings.peek()) {
  const known = new Set(WIDGETS.map(([id]) => id));
  const order = s.order.filter((id) => known.has(id));
  for (const [id] of WIDGETS) if (!order.includes(id)) order.push(id);
  return order;
}
