// Dark Breezy: bootstrap. Waits for the updater's check, then mounts the
// header and footer and renders a view per route. Every module of the app
// is reached from here by static imports or import(), so the development
// cache buster (cache-bust.js) can find them all.

import { updated, watchForUpdates, applyPendingUpdate, updatePending, watchCopyright, refresh, installed } from './update.js';
import { h, fill, icon } from './core/h.js';
import { effect, root, untrack, getOwner, setFallbackOwner, signal } from './core/signal.js';
import { route, start, beforeNavigate, navigate } from './core/router.js';
import { storageFailed } from './core/store.js';
import { reportError, ignorable } from './core/errors.js';
import { t, setLanguage } from './core/i18n.js';
import { settings } from './state/settings.js';
import { favorites, isFavorite, toggleFavorite } from './state/favorites.js';
import { placeHash, placeLabel } from './util/place.js';
import { clearSky } from './sky/sky.js';
import { dashboardView } from './views/dashboard.js';
import { spinner } from './views/common.js';
import { scrollStrip } from './widgets/common.js';
import { startWallpaper, autoUpdate } from './views/wallpaper.js';

// The dashboard is the landing page and loads with the app; the rest
// loads when first visited.
const lazy = (load, name) => () => load().then((m) => m[name]);
const searchView = lazy(() => import('./views/search.js'), 'searchView');
const settingsView = lazy(() => import('./views/settings.js'), 'settingsView');
const aboutView = lazy(() => import('./views/about.js'), 'aboutView');

const ROUTES = [
  { name: 'home', path: '/', view: () => dashboardView },
  { name: 'place', path: '/place/:coords', view: () => dashboardView },
  { name: 'place', path: '/place/:coords/:slug', view: () => dashboardView },
  { name: 'search', path: '/search', view: searchView },
  { name: 'settings', path: '/settings', view: settingsView },
  { name: 'about', path: '/about', view: aboutView },
];
const VIEWS = new Map(ROUTES.map((r) => [r.name, r]));

/** What the header shows: the place on screen (null on other pages). */
const chrome = { place: signal(null) };

/** Browsers too old for the app get a message instead of a broken page. */
function supported() {
  try {
    return typeof structuredClone === 'function'
      && typeof AbortSignal.timeout === 'function'
      && typeof AbortSignal.any === 'function'
      && CSS.supports('selector(:has(*))');
  } catch { return false; }
}

// --- appearance ------------------------------------------------------------------

function applyAppearance() {
  effect(() => {
    const w = Number(settings.value.maxWidth);
    document.documentElement.style.setProperty('--page-max', w > 0 ? `${w}px` : 'none');
  });
  effect(() => {
    const theme = settings.value.theme;
    const html = document.documentElement;
    if (theme === 'auto') {
      html.removeAttribute('data-theme');
      html.style.colorScheme = '';
    } else {
      html.setAttribute('data-theme', theme);
      html.style.colorScheme = theme === 'light' ? 'light' : 'dark';
    }
  });
}

// --- views -------------------------------------------------------------------------

const main = () => document.getElementById('main');
let disposeView = null;
let abort = null;
let firstRender = true;

async function render(r) {
  disposeView?.();
  abort?.abort();
  abort = new AbortController();
  const { signal: aborted } = abort;
  chrome.place.value = null;
  const def = VIEWS.get(r.name);
  const el = main();
  document.body.classList.toggle('has-sky', r.name === 'home' || r.name === 'place');
  if (!def) {
    clearSky();
    el.replaceChildren(h('div.error-box', h('h1', t('Page not found')), h('p', h('a', { href: '#/' }, t('Go to the dashboard')))));
    return;
  }
  if (r.name !== 'home' && r.name !== 'place') clearSky();

  let viewFn;
  try {
    viewFn = await def.view();
  } catch (e) {
    // Old and new files mixed: theme-init.js fetches them all again (once a session).
    window.darkbreezyStale?.(String(e?.message || e));
    reportError(e, 'loading a page');
    el.replaceChildren(h('div.error-box', h('h1', t('Part of the app couldn\'t be loaded')), h('p', t('Check your connection and try again.')),
      h('button.btn', { type: 'button', onclick: () => render(route.peek()) }, t('Try again'))));
    return;
  }
  if (aborted.aborted) return;

  root((dispose) => {
    setFallbackOwner(getOwner());
    disposeView = () => {
      setFallbackOwner(null);
      dispose();
    };
    let node;
    try {
      node = untrack(() => viewFn(r, { signal: aborted, chrome }));
    } catch (e) {
      reportError(e, `page ${r.name}`);
      node = h('div.error-box', h('h1', t('Something went wrong')), h('p', String(e?.message || e)));
    }
    el.replaceChildren(node);
  });
  window.scrollTo(0, 0);
  // Focus follows navigation, so screen readers and keyboards start at the content.
  if (!firstRender) el.focus({ preventScroll: true });
  firstRender = false;
}

// --- chrome ----------------------------------------------------------------------------

function mountHeader() {
  const header = document.getElementById('header');
  fill(header, h('div.app-header',
    h('a.brand', { href: '#/', 'aria-label': t('Dark Breezy home') }, h('img', { src: 'assets/favicon.svg', alt: '', width: 28, height: 28 }), h('span.brand-name', 'Dark Breezy')),
    () => {
      const p = chrome.place.value;
      return h('a.place-button', { href: '#/search', title: t('Find a place') }, icon('search'), h('span', p ? placeLabel(p) : t('Find a place')));
    },
    h('div.header-actions',
      () => {
        const p = chrome.place.value;
        if (!p) return null;
        const fav = isFavorite(p, favorites.value.list);
        // Places from the page's address (fav=): starring couldn't change them, so it's dimmed and off.
        const locked = favorites.overridden.length > 0;
        return h('button.icon-btn', { type: 'button', class: { 'is-favorite': fav }, 'aria-pressed': String(fav), disabled: locked,
          'aria-label': fav ? t('Remove {name} from your places', { name: p.name }) : t('Add {name} to your places', { name: p.name }),
          title: locked ? t('Your places are set by this page\'s address') : fav ? t('In your places') : t('Add to your places'), onclick: () => toggleFavorite(p) }, icon(fav ? 'star-fill' : 'star'));
      },
      () => chrome.place.value && 'share' in navigator && h('button.icon-btn', { type: 'button', 'aria-label': t('Share'), title: t('Share'),
        onclick: () => navigator.share({ title: `${chrome.place.peek().name} · Dark Breezy`, url: location.href }).catch(() => {}) }, icon('share')),
      fullscreenButton(),
      h('a.icon-btn', { href: '#/settings', 'aria-label': t('Settings'), title: t('Settings') }, icon('gear')))),
  () => {
    // Favorites as chips, for switching with one tap: here only when the map is off (they're on its card otherwise).
    const list = favorites.value.list;
    const p = chrome.place.value;
    if (!p || list.length < 2 || settings.value.showMap) return null;
    return scrollStrip(h('nav.fav-strip', { 'aria-label': t('Your places') }, list.map((f) => h('a.fav-chip', { href: placeHash(f), 'aria-current': f.id === p.id ? 'page' : null }, f.name))), 'header');
  });
}

/** Full screen, for a wall display: the whole window for the dashboard. */
function fullscreenButton() {
  if (!document.fullscreenEnabled) return null;
  const on = signal(!!document.fullscreenElement);
  document.addEventListener('fullscreenchange', () => { on.value = !!document.fullscreenElement; });
  return h('button.icon-btn', {
    type: 'button',
    'aria-pressed': () => String(on.value),
    'aria-label': () => (on.value ? t('Exit full screen') : t('Full screen')),
    title: () => (on.value ? t('Exit full screen') : t('Full screen')),
    onclick: () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {}),
  }, () => icon(on.value ? 'fullscreen-exit' : 'fullscreen'));
}

/** In-page links (the skip link) mustn't go through the hash router. */
function interceptAnchors() {
  document.addEventListener('click', (e) => {
    const a = /** @type {HTMLElement} */ (e.target)?.closest?.('a[href^="#"]');
    if (!a) return;
    const target = a.getAttribute('href').slice(1);
    if (target.startsWith('/')) return;
    e.preventDefault();
    document.getElementById(target)?.focus();
  });
}

/** On phones, a sideways swipe on the dashboard moves to the next or previous favorite. */
function swipeFavorites() {
  let start = null;
  document.addEventListener('touchstart', (e) => {
    const target = /** @type {Element} */ (e.target);
    // Not on things that scroll sideways themselves.
    if (e.touches.length !== 1 || target.closest?.('.hourly-scroll, .fav-strip, input, select')) { start = null; return; }
    start = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    const p = chrome.place.peek();
    if (!start || !p) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    const quick = Date.now() - start.t < 600;
    start = null;
    if (!quick || Math.abs(dx) < 80 || Math.abs(dy) > Math.abs(dx) / 2) return;
    const list = favorites.peek().list;
    const i = list.findIndex((f) => f.id === p.id);
    if (i < 0 || list.length < 2) return;
    const next = list[(i + (dx < 0 ? 1 : -1) + list.length) % list.length];
    navigate(placeHash(next));
  }, { passive: true });
}

function mountBanners() {
  const box = document.getElementById('banners');
  effect(() => {
    if (!storageFailed.value) return;
    box.appendChild(h('div.banner', { role: 'status' }, h('p', t('This browser won\'t let Dark Breezy save anything (private mode or blocked site data). Places and settings last until you close the tab.'))));
  });
  watchForUpdates(() => {
    if (autoUpdate()) { applyPendingUpdate(); return; }
    box.appendChild(h('div.banner', { role: 'status' }, h('p', t('A new version of Dark Breezy is available.')),
      h('button.btn.btn-small', { type: 'button', onclick: () => applyPendingUpdate() }, t('Reload'))));
  });
  // At the next route change, install it (nothing here is ever unsaved).
  beforeNavigate(() => {
    if (updatePending()) applyPendingUpdate();
    return true;
  });
}

function mountFooter() {
  const footer = document.getElementById('footer');
  fill(footer, h('div.app-footer',
    h('ul.footer-links',
      h('li', h('a', { href: '#/about' }, t('About & data sources'))),
      h('li', h('a', { href: '#/settings' }, t('Settings'))),
      h('li', h('a', { href: 'reset.html' }, t('App not working? Reset')))),
    // Open-Meteo's licence (CC BY 4.0) asks for this credit, linked, where its data shows; the rest is on the About page.
    h('p.footer-credit', t('Weather data by '), h('a', { href: 'https://open-meteo.com/', target: '_blank', rel: 'noopener' }, 'Open-Meteo.com')),
    h('p#copyright', '© 2026 Dark Breezy')));
  watchCopyright(document.getElementById('copyright'));
}

/** Unexpected errors from now on go to the error log (core/errors.js), shown in Settings › Advanced. */
function catchErrors() {
  for (const m of window.darkbreezyErrors || []) if (!/^failed to load/.test(m)) reportError(new Error(m), 'start-up');
  window.addEventListener('error', (e) => {
    if (e.target && e.target !== window) return;   // an image that didn't load (radar tiles)
    if (ignorable(e.error, e.message || '', e.filename || '')) return;
    reportError(e.error || new Error(e.message), 'uncaught');
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    if (ignorable(r, String(r?.message || r || ''))) return;
    reportError(r instanceof Error ? r : Object.assign(new Error(String(r?.message || r)), r?.kind ? { kind: r.kind } : {}), 'unhandled');
  });
}

/**
 * The service worker: an offline copy of the app's own files (sw.js), never
 * weather data. Only on a built site, which has the updater's file list.
 */
async function registerWorker() {
  const files = installed()?.files;
  if (!('serviceWorker' in navigator) || !files) return;
  try {
    const reg = await navigator.serviceWorker.register('sw.js');
    await navigator.serviceWorker.ready;
    (reg.active || navigator.serviceWorker.controller)?.postMessage({ type: 'precache', paths: Object.keys(files) });
  } catch { /* blocked: the app works without it */ }
}

async function boot() {
  if (!supported()) {
    main().replaceChildren(h('div.error-box', h('h1', 'Please update your browser'), h('p', 'Dark Breezy needs a recent version of Firefox, Chrome, Edge or Safari.')));
    return;
  }
  // An update found at startup reloads the page before the app appears.
  await updated;
  setLanguage(navigator.language);
  applyAppearance();
  startWallpaper();
  catchErrors();
  mountHeader();
  mountBanners();
  mountFooter();
  swipeFavorites();
  interceptAnchors();
  start(ROUTES);
  effect(() => {
    const r = route.value;
    if (r) render(r);
  });
  registerWorker();
  if (!main().childNodes.length) main().replaceChildren(spinner(t('Loading…')));
}

// For the Settings › Advanced button and debugging from the console.
window.darkbreezy = { refresh };
boot();
