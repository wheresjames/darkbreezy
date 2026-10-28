// When the dashboard uses its large-screen ("wall") layout, and fitting it
// to the window (fitToScreen, below). Settings › Appearance › Layout:
// Scroll is the usual card grid; Fit is the wall, always; Auto is the wall
// for a page at least 1800 px wide in a window at least 900 px tall (room
// for a band of big feature tiles above the other cards), the grid below
// that. Also keeps --header-h current, so the layout can fill exactly the
// window's height below the header.

import { signal, effect } from '../core/signal.js';
import { settings, wallpaperFromAddress } from '../state/settings.js';
import { chooseLevels } from '../widgets/masonry.js';

export const WALL_WIDTH = 1800;
export const WALL_HEIGHT = 900;

/** Whether a [width]×[height] window with page width limit [maxWidth] ('none' or px) gets the wall with Layout [layout]. */
export function wallFor(layout, width, height, maxWidth = 'none') {
  if (layout === 'fit') return true;
  if (layout === 'scroll') return false;
  const page = Number(maxWidth) > 0 ? Math.min(width, Number(maxWidth)) : width;
  return page >= WALL_WIDTH && height >= WALL_HEIGHT;
}

/** A signal: is the wall on? Follows the window and the settings until [abort]. */
export function wallMode(abort) {
  const size = signal({ w: innerWidth, h: innerHeight });
  const onResize = () => { size.value = { w: innerWidth, h: innerHeight }; };
  addEventListener('resize', onResize);
  abort.addEventListener('abort', () => removeEventListener('resize', onResize));
  const header = document.getElementById('header');
  const measure = new ResizeObserver(() => document.documentElement.style.setProperty('--header-h', `${header.getBoundingClientRect().height}px`));   // unrounded: no stray pixel of scroll
  measure.observe(header);
  abort.addEventListener('abort', () => measure.disconnect());
  const on = signal(false);
  effect(() => {
    const s = settings.value;
    // Wallpaper mode always uses it (views/wallpaper.js).
    on.value = wallpaperFromAddress || wallFor(s.layout, size.value.w, size.value.h, s.maxWidth);
  });
  return on;
}

/** The smallest the layout shrinks to, when even dropping every small card isn't enough. */
export const FIT_MIN = 0.3;

/**
 * Fit the large-screen layout [wall] to the window, so nothing scrolls:
 *
 *  1. Compact, then dropped: [cards] (the dashboard's small cards) switch
 *     to their one-line versions from the end of the user's card order,
 *     and then leave, also from the end (widgets/masonry.js chooseLevels).
 *  2. Only if even that isn't enough (a small window): shrinking, laid out
 *     wider than the window and scaled down by the same factor. Below
 *     FIT_MIN, full size, and the page scrolls.
 *
 * Re-checked when the content or the window changes size; returns the way
 * to stop.
 *
 * [cards]: { measure() → [{ id, span, full, compact }] (heights in layout
 * px, most wanted first), apply({ level, dropped }), reset(), more (the
 * "+N more" cell's height, 0 for none) }.
 */
export function fitToScreen(wall, { cards = null } = {}) {
  let scale = 1;
  let frame = 0;
  let rounds = 0;
  let phase = 'cards';           // 'cards' (compact and drop at full size), then 'shrink'
  let quietUntil = 0;            // our own changes while deciding: not a reason to decide again
  const header = document.getElementById('header');
  // The window less the header (none in wallpaper mode) and the credit's line.
  const available = () => innerHeight - header.getBoundingClientRect().height - 26;
  const apply = (fitted) => {
    wall.classList.toggle('fit', fitted);
    wall.style.setProperty('--fit', String(scale));
    wall.style.setProperty('--wall-h', `${available() / scale}px`);
  };
  const gapOf = () => parseFloat(getComputedStyle(wall).rowGap) || 0;
  const bandMin = (h) => Math.max(280, h * 0.45);   // css .wall.fit .feature-band

  /** Compact and drop small cards until they fit beside the band, at full size. False if even none fit. */
  function decide() {
    const grid = wall.querySelector('.instruments');
    if (!cards || !grid) return false;
    const measured = cards.measure();
    const gap = gapOf();
    const others = [...wall.children].filter((c) => c !== grid && !c.classList.contains('feature-band')).reduce((n, c) => n + c.offsetHeight + gap, 0);
    const room = available() - others - bandMin(available()) - gap;
    const cs = getComputedStyle(grid);
    const columns = cs.gridTemplateColumns.split(' ').filter(Boolean).length;
    const choice = chooseLevels(measured, columns, room, { row: parseFloat(cs.getPropertyValue('--row')) || 4, gap: parseFloat(cs.columnGap) || 0, more: cards.more });
    cards.apply(choice);
    quietUntil = performance.now() + 400;
    return choice.fits;
  }

  const fit = () => {
    frame = 0;
    if (phase === 'cards') {
      if (decide()) return;
      // Not even that's enough: shrink after all (keeping the cards as they are).
      phase = 'shrink';
    }
    // What doesn't stretch (the warnings strip, the small cards and the gaps) has to fit
    // beside the feature band's minimum (45 %, css .wall.fit); the band takes the rest.
    // Measured in layout px (before the scaling); the cards' height depends on the width.
    const band = wall.querySelector('.feature-band');
    const gap = gapOf();
    const fixed = [...wall.children].filter((c) => c !== band).reduce((n, c) => n + c.offsetHeight + gap, 0);
    const need = Math.max(fixed + 280, fixed / 0.55);
    // Only ever smaller while fitting: a smaller scale lays it out wider, the cards take fewer
    // rows, and there'd seem to be room to grow back, which narrows it again, round and round.
    // It starts again from full size when the window, or what's in the layout, changes.
    const target = Math.min(scale, available() / need);
    if (target < FIT_MIN) {
      scale = 1;
      apply(false);   // nothing for it: full size, and the page scrolls
      return;
    }
    if (Math.abs(target - scale) > 0.002 && rounds++ < 12) {
      scale = target;
      apply(true);
      frame = requestAnimationFrame(fit);      // the masonry re-packs at the new width first
    } else {
      apply(true);
    }
  };
  const again = () => {
    if (performance.now() < quietUntil) return;
    rounds = 0;
    if (!frame) frame = requestAnimationFrame(fit);
  };
  /** From the start: full size, every card full. */
  const resized = () => {
    scale = 1;
    phase = 'cards';
    cards?.reset();
    apply(true);
    quietUntil = 0;
    again();
  };
  const sizes = new ResizeObserver(again);
  sizes.observe(wall);
  for (const child of wall.children) sizes.observe(child);
  // The warnings strip coming or going: start again.
  const parts = new MutationObserver(() => { for (const child of wall.children) sizes.observe(child); resized(); });
  parts.observe(wall, { childList: true });
  addEventListener('resize', resized);
  resized();
  return () => {
    cancelAnimationFrame(frame);
    sizes.disconnect();
    parts.disconnect();
    removeEventListener('resize', resized);
    wall.classList.remove('fit');
    cards?.reset();
  };
}
