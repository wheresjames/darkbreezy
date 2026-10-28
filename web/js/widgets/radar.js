// The radar card: the last 2 hours around the place, as RainViewer keeps
// them (13 frames, every 10 minutes), played as a loop over a NASA GIBS
// base map. Each frame's 9 tiles are a layer of their own, loaded up
// front; playing shows one layer at a time, skips frames whose tiles
// haven't arrived, and holds on the latest one before starting over.
//
// In the large-screen layout (ctx.large) it fills a big tile, so it loads
// 5×5 tiles instead of 3×3: a wider area at the same sharpness.
//
// It plays by itself unless Settings › Radar says not to, the system asks
// for reduced motion, or the user paused it (remembered for the session).
// It pauses while the tab is hidden. The scrubber steps through frames by
// hand (and pauses).

import { h, icon } from '../core/h.js';
import { t } from '../core/i18n.js';
import { signal, effect, onCleanup } from '../core/signal.js';
import { settings } from '../state/settings.js';
import { fmtTime } from '../util/time.js';
import { tileFor, radarTile, baseTile, linesTile, framesOf } from '../api/extras.js';
import { loadRadarTile } from '../api/tiles.js';
import { card, withSlot } from './common.js';

const Z = 7;
export const STEP = 500;       // ms per frame
export const HOLD = 4;         // steps to stay on the latest frame

/** A credit link (the data's terms ask for one). */
const credit = (href, text) => h('a', { href, target: '_blank', rel: 'noopener' }, text);

/** Set when the user pauses, so a refresh or another place doesn't start it again. */
let pausedByUser = false;

/**
 * The tiles around the place, [r] each way (r = 1: 3×3, a 768 px mosaic;
 * r = 2: 5×5, 1280 px, for the large-screen layout's bigger radar):
 * [{ x, y, left, top }], and where the place is in the mosaic (px, py).
 */
export function tilesAround(lat, lon, r = 1) {
  const { x, y, fx, fy } = tileFor(lat, lon, Z);
  const n = 2 ** Z;
  const out = [];
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const ty = y + dy;
      if (ty < 0 || ty >= n) continue;
      out.push({ x: (x + dx + n) % n, y: ty, left: (dx + r) * 256, top: (dy + r) * 256 });
    }
  }
  return { tiles: out, px: r * 256 + fx * 256, py: r * 256 + fy * 256, size: (2 * r + 1) * 256 };
}

/**
 * The next frame to show after [i] of [n], given which are [ready]: the
 * next ready one, wrapping round; [i] itself when none is.
 */
export function nextReady(i, ready) {
  const n = ready.length;
  for (let k = 1; k <= n; k++) {
    const j = (i + k) % n;
    if (ready[j]) return j;
  }
  return i;
}

/** "−40 min" from the latest frame, or "Latest". */
export function frameAge(frame, latest) {
  const min = Math.round((latest.time - frame.time) / 60e3);
  return min <= 0 ? t('Latest') : t('−{n} min', { n: min });
}

export const radar = {
  uses: ['radar'],
  render(ctx) {
    const slot = ctx.wx.radar;
    if (!slot) return null;
    return withSlot(slot, 'radar', t('Radar'), (data) => {
      const frames = framesOf(data);
      if (!frames.length) return null;
      const last = frames.length - 1;
      const { tiles, px, py, size } = tilesAround(ctx.place.lat, ctx.place.lon, ctx.large ? 2 : 1);
      const index = signal(last);
      const ready = signal(frames.map(() => false));
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const playing = signal(frames.length > 1 && !pausedByUser && !reduced && settings.peek().radarAutoplay);

      // A map tile that doesn't load (a timeout, say) leaves a gap rather than the browser's broken-image box.
      const tile = (src, cls, style) => h(`img.tile${cls}`, { src, alt: '', style, decoding: 'async', onerror: (e) => { e.target.style.visibility = 'hidden'; } });
      const at = (p) => ({ left: `${p.left}px`, top: `${p.top}px` });
      // One layer per frame, its tiles fetched through RainViewer's rate limit
      // (api/tiles.js): the newest frame first, the middle tiles first. A frame
      // is ready when every tile has arrived, or is known to have no radar (an
      // error other than the rate limit, which the loader waits out and retries).
      const ctrl = new AbortController();
      onCleanup(() => ctrl.abort());
      const centre = Math.floor(tiles.length / 2);
      const layers = frames.map((f, i) => {
        let pending = tiles.length;
        const done = () => {
          if (--pending > 0) return;
          const r = [...ready.peek()];
          r[i] = true;
          ready.value = r;
        };
        return h('div.radar-layer', tiles.map((p, k) => {
          const img = h('img.tile.tile-radar', { alt: '', style: at(p), decoding: 'async', onerror: (e) => { e.target.style.visibility = 'hidden'; } });
          img.addEventListener('load', done, { once: true });
          loadRadarTile(radarTile(f, Z, p.x, p.y), { signal: ctrl.signal, priority: (last - i) * 100 + Math.abs(k - centre) })
            .then((src) => { img.src = src; }, (e) => { if (e?.name !== 'AbortError') done(); });
          return img;
        }));
      });
      effect(() => {
        const i = index.value;
        layers.forEach((l, k) => l.classList.toggle('is-shown', k === i));
      });

      let hold = 0;
      const timer = setInterval(() => {
        if (!playing.peek() || document.visibilityState !== 'visible') return;
        const i = index.peek();
        if (i === last && hold++ < HOLD) return;
        hold = 0;
        index.value = nextReady(i, ready.peek());
      }, STEP);
      onCleanup(() => clearInterval(timer));

      const toggle = () => {
        const now = !playing.peek();
        playing.value = now;
        pausedByUser = !now;
        if (now && index.peek() === last) { hold = HOLD; }
      };
      const scrub = h('input.radar-scrub', {
        type: 'range', min: 0, max: last, step: 1, value: () => String(index.value),
        'aria-label': t('Radar frame'),
        'aria-valuetext': () => `${fmtTime(frames[index.value].time, ctx.tz, ctx.clock)}, ${frameAge(frames[index.value], frames[last])}`,
        oninput: (e) => { playing.value = false; pausedByUser = true; index.value = Number(e.target.value); },
      });

      const mosaic = h('div.radar-mosaic', { style: { '--px': `${px}px`, '--py': `${py}px`, '--size': `${size}px` } },
        tiles.map((p) => tile(baseTile(Z, p.x, p.y), '.tile-base', at(p))),
        layers,
        tiles.map((p) => tile(linesTile(Z, p.x, p.y), '', at(p))));
      // Large: scale the mosaic up, around the place, until it covers the frame (no empty edges).
      if (ctx.large) {
        const fit = new ResizeObserver(([e]) => {
          const { width, height } = e.contentRect;
          const room = Math.min(px, size - px, py, size - py);
          mosaic.style.setProperty('--scale', String(Math.max(1, (Math.max(width, height) / 2) / room)));
        });
        queueMicrotask(() => { const frame = mosaic.parentNode; if (frame) fit.observe(frame); });
        onCleanup(() => fit.disconnect());
      }
      const loading = () => ready.value.filter(Boolean).length < frames.length;
      return card('radar', t('Radar'), [
        h('div.radar-frame', { role: 'img', 'aria-label': t('Radar for the last 2 hours around {place}', { place: ctx.place.name }) },
          mosaic,
          h('span.radar-pin', { 'aria-hidden': 'true' }),
          h('span.radar-stamp', { 'aria-hidden': 'true' }, () => fmtTime(frames[index.value].time, ctx.tz, ctx.clock))),
        frames.length > 1 && h('div.radar-controls',
          h('button.icon-btn.radar-play', { type: 'button', 'aria-label': () => (playing.value ? t('Pause radar') : t('Play radar')), 'aria-pressed': () => String(playing.value), onclick: toggle },
            () => icon(playing.value ? 'pause' : 'play')),
          scrub,
          h('span.radar-when', { 'aria-live': 'off' }, () => frameAge(frames[index.value], frames[last]))),
        () => loading() && frames.length > 1 && h('p.small.muted.radar-loading', t('Loading frames… {n} of {total}', { n: ready.value.filter(Boolean).length, total: frames.length })),
      ], { note: [t('Radar: '), credit('https://www.rainviewer.com/', 'RainViewer'), t(', last 2 hours. Map: '), credit('https://earthdata.nasa.gov/gibs', 'NASA GIBS'),
        ', © ', credit('https://www.openstreetmap.org/copyright', t('OpenStreetMap contributors')), '.'] });
    }, { retry: () => ctx.retry('radar') });
  },
};
