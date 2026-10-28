// Warnings as a thin bar, for the large-screen and wallpaper layouts
// (views/dashboard.js), where the full card took too much room:
//
//   [SEVERE Coastal Flood Warning · Coastal Duval · until 2 am] | (Rip Current) (High Surf)
//    …minor to moderate flooding of low-lying property is expected…   2/4
//
// One warning at a time sits in the "hot seat" (left), most severe first,
// with the others waiting beside it as chips. Its text shows underneath a
// page at a time (a sentence or two, as many as fit the line), each for
// about as long as it takes to read; after its last page the next warning
// takes the seat. Extreme ones go through twice. A single warning stays.
// The bar takes the hot seat's severity color.
//
// Nothing moves under reduced motion (the pages just change). In the
// interactive layout, hovering pauses it, and a click opens every warning
// in full; in wallpaper mode it just goes round. Screen readers get the
// whole list as hidden text, not an announcement at every change.

import { h, icon } from '../core/h.js';
import { t } from '../core/i18n.js';
import { signal, effect, onCleanup } from '../core/signal.js';
import { fmtTime } from '../util/time.js';

const SEVERITY = { extreme: 'Extreme', severe: 'Severe', moderate: 'Moderate', minor: 'Minor', unknown: 'Notice' };
export const MIN_PAGE = 3500;   // ms a page shows at least
export const MAX_PAGE = 12000;  // and at most
const PER_WORD = 300;           // ms a word: about 200 words a minute

/** Everything a warning says, in reading order: headline (if it adds anything), instruction, description. */
export function warningText(a) {
  const parts = [a.headline && a.headline !== a.event ? a.headline : '', a.instruction, a.description];
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * [text] in pages of at most [budget] characters, split between sentences
 * where it can, between words where a sentence is too long.
 */
export function pages(text, budget) {
  const sentences = String(text).match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g)?.map((x) => x.trim()).filter(Boolean) || [];
  const out = [];
  let page = '';
  const push = () => { if (page) out.push(page); page = ''; };
  for (const sentence of sentences) {
    if (sentence.length > budget) {
      push();
      let line = '';
      for (const word of sentence.split(' ')) {
        if (line && (line + ' ' + word).length > budget) { out.push(line); line = ''; }
        line = line ? `${line} ${word}` : word;
      }
      page = line;
      continue;
    }
    if (page && (page + ' ' + sentence).length > budget) push();
    page = page ? `${page} ${sentence}` : sentence;
  }
  push();
  return out;
}

/** How long a page shows: its reading time, within bounds. */
export const pageTime = (text) => Math.min(MAX_PAGE, Math.max(MIN_PAGE, String(text).split(/\s+/).length * PER_WORD));

/**
 * The bar for [alerts] (most severe first). [ctx]: the card context
 * (tz, clock); [interactive]: hover pauses, click opens every warning in full.
 */
/** Whose turn it is, by the set of warnings: a refresh with the same warnings carries on. */
const turns = new Map();

export function alertBar(alerts, ctx, { interactive = true } = {}) {
  const key = alerts.map((a) => a.id).join('|');
  const kept = turns.get(key);
  const current = signal(kept?.current ?? 0);
  const page = signal(0);
  const budget = signal(140);
  const paused = signal(false);
  const open = signal(false);
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const texts = alerts.map(warningText);
  const pagesOf = (i) => pages(texts[i] || alerts[i].event, budget.value);

  const until = (a) => (a.expires ? t('until {time}', { time: fmtTime(a.expires, ctx.tz, ctx.clock) }) : '');
  const seat = (a) => h('div.ab-seat', { dataset: { severity: a.severity } },
    h('span.ab-badge', t(SEVERITY[a.severity])),
    h('span.ab-event', a.event),
    h('span.ab-where', [a.area && a.area.length < 50 ? a.area : '', until(a)].filter(Boolean).join(' · ')));

  // Turns: each page for its reading time; after the last, the next warning (extreme ones twice).
  let timer = 0;
  let passes = kept?.passes ?? 0;
  const remember = () => { turns.clear(); turns.set(key, { current: current.peek(), passes }); };
  const schedule = () => {
    clearTimeout(timer);
    if (paused.peek() || open.peek()) return;
    const list = pagesOf(current.peek());
    const text = list[page.peek()] || '';
    timer = setTimeout(() => {
      if (document.visibilityState !== 'visible') { schedule(); return; }
      if (page.peek() + 1 < list.length) { page.value += 1; schedule(); return; }
      const a = alerts[current.peek()];
      passes += 1;
      if (alerts.length > 1 && !(a.severity === 'extreme' && passes < 2)) {
        passes = 0;
        current.value = (current.peek() + 1) % alerts.length;
      }
      remember();
      page.value = 0;
      schedule();
    }, pageTime(text));
  };
  onCleanup(() => clearTimeout(timer));

  const body = h('div.ab-body', { 'aria-hidden': 'true' });
  // As many characters as fit the line (about 7.5 px each at this size).
  const sizes = new ResizeObserver(([e]) => {
    const fit = Math.max(40, Math.floor(e.contentRect.width / 7.5));
    if (Math.abs(fit - budget.peek()) > 8) { budget.value = fit; page.value = 0; }
  });
  sizes.observe(body);
  onCleanup(() => sizes.disconnect());
  effect(() => {
    const list = pagesOf(current.value);
    const n = Math.min(page.value, list.length - 1);
    body.replaceChildren(...[
      h('span.ab-text', { class: { animate: !reduced }, dataset: { key: `${current.value}.${n}` } }, list[n] || ''),
      list.length > 1 && h('span.ab-count', `${n + 1}/${list.length}`),
    ].filter(Boolean));   // replaceChildren would write a false out as text
  });
  effect(() => { paused.value; open.value; schedule(); });

  const top = h('div.ab-top', { 'aria-hidden': 'true' }, () => {
    const i = current.value;
    const rest = alerts.map((a, k) => [a, k]).filter(([, k]) => k !== i);
    return [
      h('div.ab-seat-wrap', { class: { animate: !reduced }, dataset: { key: i } }, seat(alerts[i])),
      rest.length > 0 && h('ul.ab-queue', rest.map(([a]) => h('li.ab-chip', { dataset: { severity: a.severity } }, a.event))),
    ];
  });

  // Every warning in full: for screen readers always, on screen when the bar is clicked.
  const full = (cls) => h(`div.${cls}`, alerts.map((a) => h('section.ab-full-item', { dataset: { severity: a.severity } },
    h('h3', `${t(SEVERITY[a.severity])}: ${a.event}`),
    h('p.small.muted', [a.area, until(a), t('Issued by {issuer}', { issuer: a.issuer })].filter(Boolean).join(' · ')),
    a.headline && a.headline !== a.event && h('p.ab-full-headline', a.headline),
    a.instruction && h('p.alert-text.alert-instruction', { lang: a.lang }, a.instruction),
    a.description && h('p.alert-text', { lang: a.lang }, a.description),
    a.url && h('p.small', h('a', { href: a.url, target: '_blank', rel: 'noopener' }, t('Official page'))))));

  const bar = h('section.card.card-warnings.alert-bar', {
    dataset: { widget: 'warnings' },
    'aria-label': t('Warnings ({n})', { n: alerts.length }),
    onmouseenter: interactive ? () => { paused.value = true; } : undefined,
    onmouseleave: interactive ? () => { paused.value = false; } : undefined,
  },
  interactive
    ? h('button.ab-main', { type: 'button', 'aria-expanded': () => String(open.value), onclick: () => { open.value = !open.value; },
      title: t('Show every warning in full') }, top, body, icon('chevron-down', 'ab-chevron'))
    : h('div.ab-main', top, body),
  full('visually-hidden'),
  () => open.value && h('div.ab-panel', { role: 'dialog', 'aria-label': t('Warnings in full'),
    onkeydown: (e) => { if (e.key === 'Escape') open.value = false; } },
  h('button.icon-btn.ab-close', { type: 'button', 'aria-label': t('Close'), onclick: () => { open.value = false; } }, icon('close')),
  full('ab-full')));
  // The bar takes the hot seat's color (h() sets data- attributes once, so follow it here).
  effect(() => { bar.dataset.severity = alerts[current.value].severity; });
  return bar;
}
