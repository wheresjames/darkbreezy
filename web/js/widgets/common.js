// What every widget uses: the card frame, the "loading" and "couldn't
// load" states, and the context a widget renders from.
//
// A widget is { uses: ['forecast', ...], render(ctx) → Node | null }.
// null hides the card (no data for this place: DARKBREEZY.md §2, "never
// shown as —"). ctx = { place, wx (slot values by source), units, s
// (settings), tz, clock, now, retry(source) }.

import { h, icon } from '../core/h.js';
import { t } from '../core/i18n.js';
import { onCleanup } from '../core/signal.js';

/**
 * A card: <section class="card"> with a heading and a body.
 * @param {string} id      widget id (data-widget, the heading's id)
 * @param {string} title
 * @param {any} body
 * @param {{ cls?: string, note?: any, level?: number|null, label?: string }} [opts]
 */
export function card(id, title, body, { cls = '', note = null, level = null } = {}) {
  return h(`section.card.card-${id}`, { class: cls, dataset: { widget: id, level: level ?? undefined }, 'aria-labelledby': `w-${id}` },
    h('h2.card-title', { id: `w-${id}` }, title),
    h('div.card-body', body),
    note && h('p.card-note', note));
}

/** A card still waiting for its first data. */
export const loadingCard = (id, title, cls) => card(id, title, h('div.card-loading', { role: 'status' }, t('Loading…')), { cls });

/** A card whose data couldn't be fetched (and nothing was kept from before). */
export function errorCard(id, title, error, retry, cls) {
  return card(id, title, h('div.card-error',
    h('p', explain(error)),
    retry && h('button.btn.btn-small', { type: 'button', onclick: retry }, icon('refresh'), t('Try again'))), { cls });
}

/** A short, honest sentence for a fetch error (api/http.js kinds). */
export function explain(e) {
  switch (e?.kind) {
    case 'rate': return t('The service is limiting requests right now. Showing what was saved, if anything.');
    case 'timeout': return t('The service took too long to answer.');
    case 'network': return navigator.onLine === false ? t('You\'re offline.') : t('Couldn\'t reach the service.');
    case 'http': return t('The service had a problem ({status}).', { status: e.status });
    default: return t('Something went wrong loading this.');
  }
}

/**
 * The usual life of a card: loading → error → data. [slot] is a source's
 * value ({ data, at, error, loading }); [draw] renders its data, or
 * returns null to hide the card. A card that fetched and got nothing hides.
 */
export function withSlot(slot, id, title, draw, { retry, cls } = {}) {
  if (!slot) return null;
  if (slot.data != null) return draw(slot.data);
  if (slot.error) return errorCard(id, title, slot.error, retry, cls);
  if (!slot.at) return loadingCard(id, title, cls);
  return null;
}

/** A label/value row for the cards' detail lists. */
export const stat = (label, value, extra) => h('div.stat', h('dt', label), h('dd', value, extra && h('span.stat-extra', extra)));

/** The hourly rows from [now] on (the current hour included). */
export function ahead(hourly, now, n = 48) {
  const i = hourly.findIndex((r) => r.t + 36e5 > now);
  return i < 0 ? [] : hourly.slice(i, i + n);
}

/** The hourly row nearest [ms]. */
export function rowAt(hourly, ms) {
  let best = null;
  for (const r of hourly) if (!best || Math.abs(r.t - ms) < Math.abs(best.t - ms)) best = r;
  return best && Math.abs(best.t - ms) <= 36e5 ? best : null;
}

/** A level chip ("Moderate"), colored by level 0–5. */
export const levelChip = (level, label) => h('span.level-chip', { dataset: { level } }, label);

/** A weather icon from the sprite, with a text alternative. */
export function wxIcon(name, label, cls = 'wx-icon') {
  const svg = icon(name, cls);
  if (label) {
    svg.setAttribute('role', 'img');
    svg.removeAttribute('aria-hidden');
    svg.setAttribute('aria-label', label);
  }
  return svg;
}

/** Where each chip strip was scrolled (by [key]), so the next page's strip can carry on from there. */
const stripAt = new Map();

/**
 * A row of chips that scrolls sideways ([strip], css .fav-strip): a mouse
 * wheel scrolls it too (it has no scrollbar), the current chip
 * ([aria-current]) moves to the middle, and the edges fade where there's
 * more (.fade-start, .fade-end). A new page builds a new strip: it starts
 * where the last one with the same [key] was and glides the newly chosen
 * chip to the middle, so walking through the chips is smooth. Returns [strip].
 */
export function scrollStrip(strip, key) {
  const fades = () => {
    const more = strip.scrollWidth - strip.clientWidth;
    strip.classList.toggle('fade-start', strip.scrollLeft > 1);
    strip.classList.toggle('fade-end', strip.scrollLeft < more - 1);
  };
  strip.addEventListener('scroll', () => { stripAt.set(key, strip.scrollLeft); fades(); }, { passive: true });
  // The wheel eases the strip toward where it points (each notch adds to it), rather than
  // jumping a notch at a time; under reduced motion it goes straight there.
  let target = null;
  let frame = 0;
  const glide = () => {
    const before = strip.scrollLeft;
    const d = target - before;
    if (Math.abs(d) >= 1) strip.scrollLeft = before + Math.sign(d) * Math.max(1, Math.abs(d) * 0.2);
    if (Math.abs(d) < 1 || strip.scrollLeft === before) { frame = 0; target = null; return; }   // there, or can't go further
    frame = requestAnimationFrame(glide);
  };
  onCleanup(() => cancelAnimationFrame(frame));
  strip.addEventListener('wheel', (e) => {
    const end = strip.scrollWidth - strip.clientWidth;
    if (end <= 0 || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault();
    const step = e.deltaY * (e.deltaMode === 1 ? 33 : 1);   // Firefox counts lines (3 a notch)
    target = Math.max(0, Math.min(end, (target ?? strip.scrollLeft) + step));
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { strip.scrollLeft = target; target = null; return; }
    if (!frame) frame = requestAnimationFrame(glide);
  }, { passive: false });
  // The current chip in the middle: at first (gliding from where the last page's strip was),
  // and again whenever the strip changes size (the layout settling, the window resized),
  // until someone scrolls it by hand.
  let first = true;
  let touched = false;
  for (const ev of ['wheel', 'pointerdown', 'touchstart']) strip.addEventListener(ev, () => { touched = true; }, { passive: true });
  const sizes = new ResizeObserver(() => {
    if (!strip.clientWidth) return;   // not on the page yet
    const current = !touched && strip.querySelector('[aria-current]');
    if (current) {
      const middle = current.offsetLeft - (strip.clientWidth - current.offsetWidth) / 2;
      const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (first && smooth && stripAt.has(key)) strip.scrollLeft = stripAt.get(key);   // where the last page left it
      if (smooth && (!first || stripAt.has(key))) strip.scrollTo({ left: middle, behavior: 'smooth' });
      else strip.scrollLeft = middle;
    }
    first = false;
    fades();
  });
  sizes.observe(strip);
  onCleanup(() => sizes.disconnect());
  return strip;
}
