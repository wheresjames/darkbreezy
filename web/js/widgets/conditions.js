// The "now" cards: wind, UV, humidity, pressure, visibility, cloud cover,
// feels-like. Each is one big value, a label, and a little detail.

import { h, icon } from '../core/h.js';
import { t } from '../core/i18n.js';
import { fmt, fmtDistance, compass, beaufort } from '../util/units.js';
import { fmtTime, dateKey } from '../util/time.js';
import { uvCategory, comfort, pressureTrend, visibilityLabel, feelsReason } from '../util/format.js';
import { card, withSlot, stat, levelChip, ahead, rowAt } from './common.js';
import { chart, s } from './charts.js';

const fc = (ctx, id, title, draw, cls) => withSlot(ctx.wx.forecast, id, title, draw, { retry: () => ctx.retry('forecast'), cls });

// --- wind ----------------------------------------------------------------------------

function dial(dir, label) {
  const R = 52;
  const ticks = [];
  for (let a = 0; a < 360; a += 30) {
    const r = (a * Math.PI) / 180;
    const long = a % 90 === 0;
    ticks.push(s('line', { x1: 60 + Math.sin(r) * (R - (long ? 9 : 5)), y1: 60 - Math.cos(r) * (R - (long ? 9 : 5)), x2: 60 + Math.sin(r) * R, y2: 60 - Math.cos(r) * R, class: 'tick' }));
  }
  const letters = [['N', 60, 22], ['E', 98, 64], ['S', 60, 104], ['W', 22, 64]].map(([l, x, y]) => s('text', { x, y, 'text-anchor': 'middle', class: 'compass-letter', text: l }));
  // The arrow points where the wind blows to: from [dir], plus 180.
  const arrow = dir == null ? null : s('g', { transform: `rotate(${(dir + 180) % 360} 60 60)` },
    s('path', { d: 'M60 30 L68 50 L61.5 47 L61.5 86 L58.5 86 L58.5 47 L52 50 Z', class: 'wind-arrow' }));
  return chart(120, 120, label, s('circle', { cx: 60, cy: 60, r: R, class: 'dial' }), ...ticks, ...letters, arrow);
}

export const wind = {
  uses: ['forecast'],
  render(ctx) {
    return fc(ctx, 'wind', t('Wind'), (f) => {
      const c = f.current;
      const from = compass(c.windDir);
      const bf = beaufort(c.wind ?? 0);
      return card('wind', t('Wind'), h('div.wind',
        dial(c.windDir, c.windDir == null ? t('Wind direction unknown') : t('Wind from the {dir}', { dir: from })),
        h('div',
          h('p.big-value', fmt('wind', c.wind, ctx.units)),
          h('p.value-label', `${bf.name}${from ? ` · ${t('from {dir}', { dir: from })}` : ''}`),
          h('dl.stats', stat(t('Gusts'), fmt('wind', c.gust, ctx.units)),
            f.daily[0] && stat(t('Today\'s max'), fmt('wind', f.daily[0].windMax, ctx.units))))));
    });
  },
};

// --- UV -----------------------------------------------------------------------------

export const uv = {
  uses: ['forecast'],
  render(ctx) {
    return fc(ctx, 'uv', t('UV index'), (f) => {
      const now = f.current.uv;
      const cat = uvCategory(now);
      const today = dateKey(ctx.now, ctx.tz);
      const rows = f.hourly.filter((r) => dateKey(r.t, ctx.tz) === today && r.uv != null);
      const peak = rows.reduce((b, r) => (!b || r.uv > b.uv ? r : b), null);
      const peakCat = uvCategory(peak?.uv);
      return card('uv', t('UV index'), [
        h('p.big-value', now == null ? '–' : String(Math.round(now)), cat && levelChip(cat.level, cat.label)),
        h('div.meter', { 'aria-hidden': 'true' }, h('span.meter-mark', { style: { left: `${Math.min(100, ((now ?? 0) / 11) * 100)}%` } })),
        peak && peak.uv >= 1 && h('dl.stats', stat(t('Today\'s peak'), `${Math.round(peak.uv)} · ${peakCat.label}`, ` ${t('at {time}', { time: fmtTime(peak.t, ctx.tz, ctx.clock) })}`)),
        now != null && now >= 3 && h('p.small', t('Sun protection recommended.')),
      ], { level: cat?.level });
    });
  },
};

// --- humidity --------------------------------------------------------------------------

export const humidity = {
  uses: ['forecast'],
  render(ctx) {
    return fc(ctx, 'humidity', t('Humidity'), (f) => {
      const c = f.current;
      return card('humidity', t('Humidity'), [
        h('p.big-value', c.humidity == null ? '–' : `${Math.round(c.humidity)}%`),
        h('p.value-label', comfort(c.dew)),
        h('dl.stats', stat(t('Dew point'), fmt('temp', c.dew, ctx.units))),
      ]);
    });
  },
};

// --- pressure --------------------------------------------------------------------------

export const pressure = {
  uses: ['forecast'],
  render(ctx) {
    return fc(ctx, 'pressure', t('Pressure'), (f) => {
      const c = f.current;
      const before = rowAt(f.hourly, c.t - 3 * 36e5);
      const trend = pressureTrend(c.pressure != null && before?.pressure != null ? c.pressure - before.pressure : null);
      const arrow = icon(trend.dir > 0 ? 'chevron-up' : trend.dir < 0 ? 'chevron-down' : 'chevron-right', 'trend');
      return card('pressure', t('Pressure'), [
        h('p.big-value', fmt('pressure', c.pressure, ctx.units)),
        trend.label && h('p.value-label', arrow, trend.label, h('span.muted', ` ${t('over 3 h')}`)),
      ]);
    });
  },
};

// --- visibility ------------------------------------------------------------------------

export const visibility = {
  uses: ['forecast'],
  render(ctx) {
    return fc(ctx, 'visibility', t('Visibility'), (f) => {
      const v = f.current.visibility;
      if (v == null) return null;
      return card('visibility', t('Visibility'), [
        h('p.big-value', fmtDistance(v, ctx.units)),
        h('p.value-label', visibilityLabel(v)),
      ]);
    });
  },
};

// --- clouds -----------------------------------------------------------------------------

export const clouds = {
  uses: ['forecast'],
  render(ctx) {
    return fc(ctx, 'clouds', t('Cloud cover'), (f) => {
      const c = f.current.cloud;
      const next = ahead(f.hourly, ctx.now, 12);
      const label = c == null ? '' : c < 15 ? t('Clear') : c < 40 ? t('Mostly clear') : c < 70 ? t('Partly cloudy') : c < 90 ? t('Mostly cloudy') : t('Overcast');
      const W = 240;
      const bw = W / Math.max(1, next.length);
      const bars = next.map((r, i) => s('rect', { x: i * bw + 2, y: 40 - ((r.cloud ?? 0) / 100) * 36, width: bw - 4, height: Math.max(1, ((r.cloud ?? 0) / 100) * 36), rx: 2, class: 'cloud-bar' }));
      return card('clouds', t('Cloud cover'), [
        h('p.big-value', c == null ? '–' : `${Math.round(c)}%`),
        h('p.value-label', label),
        next.length > 1 && chart(W, 44, t('Cloud cover for the next 12 hours: {list}', { list: next.map((r) => `${r.cloud ?? 0}%`).join(', ') }), ...bars),
        next.length > 1 && h('p.small.muted', t('Next 12 hours')),
      ]);
    });
  },
};

// --- feels like -------------------------------------------------------------------------

export const feels = {
  uses: ['forecast'],
  render(ctx) {
    return fc(ctx, 'feels', t('Feels like'), (f) => {
      const c = f.current;
      return card('feels', t('Feels like'), [
        h('p.big-value', fmt('temp', c.feels, ctx.units)),
        h('p.value-label', t('Actual {temp}', { temp: fmt('temp', c.temp, ctx.units) })),
        h('p.small', feelsReason(c)),
      ]);
    });
  },
};
