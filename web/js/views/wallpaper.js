// Wallpaper mode (?wallpaper=1&dim=40 in the address; Settings › Wallpaper
// builds the address and opens it in a new window to try): for a desktop
// wallpaper app, where nobody can click. Only the address turns it on: a
// stored switch would leave a normal visit with no controls and no way back. The
// dashboard uses the large-screen layout at any size, the header and every
// control are hidden (css/layout.css body.wallpaper), the screen is dimmed
// by a black layer over everything that lets clicks through (html::after,
// --dim; set before first paint by theme-init.js), and a new version
// installs itself.
//
// Esc or a double-click shows a small bar for a few seconds: Exit (the same
// page without the parameter) and Settings.

import { h } from '../core/h.js';
import { t } from '../core/i18n.js';
import { effect } from '../core/signal.js';
import { navigate, route } from '../core/router.js';
import { settings, wallpaperFromAddress } from '../state/settings.js';

const SHOW_FOR = 6000;

/** Whether route [r] is the dashboard: the wallpaper itself (settings, search, about stay as usual). */
export const onDashboard = (r) => !r || r.name === 'home' || r.name === 'place';

/** Follow the setting: dimming and the page's wallpaper look, on the dashboard. Call once at start-up. */
export function startWallpaper() {
  const html = document.documentElement;
  effect(() => {
    const wallpaper = wallpaperFromAddress && onDashboard(route.value);
    const { dim } = settings.value;
    html.toggleAttribute('data-wallpaper', wallpaper);
    html.style.setProperty('--dim', String(Math.max(0, Math.min(90, Number(dim) || 0)) / 100));
    document.body.classList.toggle('wallpaper', wallpaper);
  });

  let bar = null;
  let timer = 0;
  const hide = () => { bar?.remove(); bar = null; };
  const show = () => {
    if (!wallpaperFromAddress || !onDashboard(route.peek())) return;
    clearTimeout(timer);
    timer = setTimeout(hide, SHOW_FOR);
    if (bar) return;
    bar = h('div.wallpaper-bar', { role: 'status' },
      h('span', t('Wallpaper mode')),
      h('button.btn.btn-small', { type: 'button', onclick: () => location.replace(withoutWallpaper(location.href)) }, t('Exit')),
      h('button.btn.btn-small', { type: 'button', onclick: () => { hide(); navigate('#/settings'); } }, t('Settings')));
    document.body.append(bar);
  };
  addEventListener('keydown', (e) => { if (e.key === 'Escape') show(); });
  addEventListener('dblclick', show);
}

/** In wallpaper mode nobody can press "Reload": install a new version as soon as it's found. */
export const autoUpdate = () => wallpaperFromAddress;

/** [href] without the wallpaper parameters: the same page, as usual. */
export function withoutWallpaper(href) {
  const u = new URL(href);
  u.searchParams.delete('wallpaper');
  u.searchParams.delete('dim');
  return u.href;
}
