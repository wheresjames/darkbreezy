// Hash router: #/c/linux@lemmy.ml?sort=New
//
// Routes are matched in order; ":name" captures one path segment. Each
// history entry is stamped with a key in history.state, so a revisited entry
// (back/forward, or a reload) can restore its scroll position and whatever
// else the view stored for it, while a fresh navigation starts at the top.

import { signal } from './signal.js';
import { readJSON, writeJSON } from './store.js';

const SCROLL_KEY = 'darkbreezy:scroll';
const MAX_SCROLL_ENTRIES = 100;

/** @typedef {{ path: string, query: URLSearchParams, params: Record<string,string>, name: string, key: string, revisit: boolean, hash: string }} Route */

/** @type {ReturnType<typeof signal<Route|null>>} */
export const route = signal(null);

let table = [];
const beforeHooks = [];

/** Parse "#/a/b?x=1" into its path and query. */
export function parseHash(hash) {
  const raw = hash.replace(/^#/, '') || '/';
  const q = raw.indexOf('?');
  const path = (q < 0 ? raw : raw.slice(0, q)) || '/';
  const query = new URLSearchParams(q < 0 ? '' : raw.slice(q + 1));
  return { path: path.startsWith('/') ? path : `/${path}`, query };
}

/**
 * Compile "/c/:name" into a matcher. A last "/*rest" captures the rest of
 * the path, kept as written (not decoded).
 */
export function compile(pattern) {
  const names = [];
  let splat = null;
  const source = pattern
    .replace(/\/\*(\w+)$/, (_, n) => { splat = n; return '/(.+)'; })
    .replace(/\/:(\w+)/g, (_, n) => { names.push(n); return '/([^/]+)'; });
  const re = new RegExp(`^${source}${splat ? '' : '/?'}$`);
  return (path) => {
    const m = path.match(re);
    if (!m) return null;
    const params = {};
    names.forEach((n, i) => {
      try { params[n] = decodeURIComponent(m[i + 1]); } catch { params[n] = m[i + 1]; }
    });
    if (splat) params[splat] = m[names.length + 1];
    return params;
  };
}

/** Match [path] against the table: { name, params } or null. */
export function match(path, routes = table) {
  for (const r of routes) {
    const params = r.match(path);
    if (params) return { name: r.name, params };
  }
  return null;
}

/**
 * An address for [path] and [query] ({ key: value }, empty values dropped).
 * @param {string} path
 * @param {Record<string, any>} [query]
 */
export function href(path, query) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(query || {})) if (v != null && v !== '' && v !== false) q.set(k, String(v));
  const s = q.toString();
  return `#${path}${s ? `?${s}` : ''}`;
}

/** Go to [to] ("#/..." or "/..."). */
export function navigate(to, { replace = false } = {}) {
  const hash = to.startsWith('#') ? to : `#${to}`;
  if (replace) {
    history.replaceState(null, '', hash);
    onChange();
  } else if (location.hash === hash) {
    onChange();
  } else {
    location.hash = hash;
  }
}

/** Run [fn] before each route change; it may return false to cancel. */
export function beforeNavigate(fn) { beforeHooks.push(fn); }

// --- scroll positions ----------------------------------------------------------

function positions() { return readJSON(SCROLL_KEY, 'session') || {}; }

export function saveScroll(key, y = window.scrollY) {
  if (!key) return;
  const all = positions();
  delete all[key];
  all[key] = Math.round(y);
  const keys = Object.keys(all);
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_SCROLL_ENTRIES))) delete all[k];
  writeJSON(SCROLL_KEY, all, 'session');
}

export function savedScroll(key) { return positions()[key]; }

/**
 * Per-entry view state ({ pages, cursor... }) in sessionStorage, so a reload
 * or back navigation can rebuild what was on screen.
 */
export function entryState(key, value) {
  const k = `darkbreezy:entry:${key}`;
  if (value === undefined) return readJSON(k, 'session');
  writeJSON(k, value, 'session');
  return value;
}

// --- running ----------------------------------------------------------------

let lastKey = null;
let counter = 0;

function stamp() {
  const state = history.state;
  if (state && state.dbKey) return { key: state.dbKey, revisit: true };
  const key = `${Date.now().toString(36)}-${(counter++).toString(36)}`;
  history.replaceState({ ...(state || {}), dbKey: key }, '');
  return { key, revisit: false };
}

function onChange() {
  const { path, query } = parseHash(location.hash);
  const found = match(path);
  for (const hook of beforeHooks) if (hook({ path, query }) === false) return;
  if (lastKey) saveScroll(lastKey);
  const { key, revisit } = stamp();
  lastKey = key;
  route.value = {
    path, query,
    params: found?.params || {},
    name: found?.name || 'notfound',
    key, revisit,
    hash: location.hash || '#/',
  };
}

/** Start routing with [routes]: [{ name, path: '/c/:name' }]. */
export function start(routes) {
  table = routes.map((r) => ({ ...r, match: compile(r.path) }));
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.addEventListener('hashchange', onChange);
  // Keep the scroll position of the entry being left on reload or close.
  window.addEventListener('pagehide', () => { if (lastKey) saveScroll(lastKey); });
  onChange();
}

/**
 * Scroll to where entry [key] was left, if it's a revisit, once the view
 * has content. Retries briefly while the page is still too short.
 */
export function restoreScroll(r) {
  const y = r.revisit ? savedScroll(r.key) : 0;
  if (!y) { window.scrollTo(0, 0); return; }
  let tries = 0;
  const attempt = () => {
    window.scrollTo(0, y);
    if (Math.abs(window.scrollY - y) > 2 && tries++ < 20) requestAnimationFrame(attempt);
  };
  requestAnimationFrame(attempt);
}
