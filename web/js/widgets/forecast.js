// The forecast cards: the next two hours in 15-minute steps, the hourly
// strip, the 10-day list with range bars, and precipitation totals.

import { h, SPRITE } from '../core/h.js';
import { t } from '../core/i18n.js';
import { fmt, fmtPrecip, convert } from '../util/units.js';
import { fmtHour, fmtTime, fmtWeekday, dateKey, hourIn } from '../util/time.js';
import { wmo, wmoIcon } from '../util/wmo-codes.js';
import { card, withSlot, ahead, stat, wxIcon } from './common.js';
import { chart, s, smoothPath, scale, tempColor } from './charts.js';
import { nowcastSummary } from './summary.js';

const ICONS = `${SPRITE}#`;

// --- next hours ----------------------------------------------------------------

export const nowcast = {
  uses: ['forecast'],
  render(ctx) {
    return withSlot(ctx.wx.forecast, 'nowcast', t('Next 2 hours'), (f) => {
      const rows = f.minutely.filter((r) => r.t > ctx.now - 15 * 60e3).slice(0, 9);
      if (rows.length < 4) return null;
      const summary = nowcastSummary(f.minutely, ctx.now) || t('No precipitation expected in the next 2 hours.');
      const W = 300;
      const H = 90;
      const max = Math.max(1, ...rows.map((r) => r.precip ?? 0));
      const bw = W / rows.length;
      const y = scale(0, max, H - 18, 6);
      const bars = rows.map((r, i) => {
        const v = r.precip ?? 0;
        return s('rect', { x: i * bw + 3, y: y(v), width: bw - 6, height: Math.max(v > 0 ? 2 : 0, H - 18 - y(v)), rx: 3, class: `bar${wmo(r.code).precip === 'snow' ? ' is-snow' : ''}` });
      });
      const labels = [0, Math.floor(rows.length / 2), rows.length - 1].map((i) => s('text', {
        x: i * bw + bw / 2, y: H - 3, 'text-anchor': 'middle', class: 'axis', text: i === 0 ? t('Now') : fmtTime(rows[i].t - 15 * 60e3, ctx.tz, ctx.clock),
      }));
      const text = rows.map((r) => `${fmtTime(r.t - 15 * 60e3, ctx.tz, ctx.clock)}: ${fmtPrecip(r.precip, ctx.units)}`).join(', ');
      return card('nowcast', t('Next 2 hours'), [
        h('p.card-lead', summary),
        chart(W, H, null, s('line', { x1: 0, x2: W, y1: H - 18, y2: H - 18, class: 'baseline' }), ...bars, ...labels),
        h('p.visually-hidden', text),
      ], { note: t('15-minute model precipitation (not radar).') });
    }, { retry: () => ctx.retry('forecast') });
  },
};

// --- hourly ----------------------------------------------------------------------

const COL = 58;

export const hourly = {
  uses: ['forecast'],
  render(ctx) {
    return withSlot(ctx.wx.forecast, 'hourly', t('Hourly'), (f) => {
      // The large-screen layout shows what fits its tile (ctx.hours), scaled to fill it; otherwise two days, scrolling.
      const rows = ahead(f.hourly, ctx.now, ctx.large ? (ctx.hours || 24) : 48);
      if (!rows.length) return null;
      const W = rows.length * COL;
      const H = 196;
      const temps = rows.map((r) => convert(r.temp, ctx.units.temp));
      const lo = Math.min(...temps);
      const hi = Math.max(...temps);
      const ty = scale(lo, hi === lo ? lo + 1 : hi, 118, 78);
      const x = (i) => i * COL + COL / 2;
      const pts = rows.map((r, i) => [x(i), ty(temps[i])]);
      const content = [];
      rows.forEach((r, i) => {
        const midnight = i > 0 && hourIn(r.t, ctx.tz) === 0;
        if (midnight) {
          content.push(s('line', { x1: i * COL, x2: i * COL, y1: 4, y2: H - 4, class: 'day-line' }));
          content.push(s('text', { x: i * COL + 4, y: 12, class: 'day-label', text: fmtWeekday(r.t, ctx.tz) }));
        }
        content.push(s('text', { x: x(i), y: 28, 'text-anchor': 'middle', class: 'axis', text: i === 0 ? t('Now') : fmtHour(r.t, ctx.tz, ctx.clock) }));
        content.push(s('use', { href: ICONS + wmoIcon(r.code, r.isDay), x: x(i) - 14, y: 34, width: 28, height: 28 }));
        content.push(s('text', { x: x(i), y: pts[i][1] - 10, 'text-anchor': 'middle', class: 'temp-label', text: fmt('temp', r.temp, ctx.units) }));
        const pop = r.pop ?? 0;
        const bh = (pop / 100) * 34;
        content.push(s('rect', { x: x(i) - 10, y: 166 - bh, width: 20, height: bh, rx: 3, class: 'pop-bar', opacity: 0.35 + pop / 160 }));
        if (pop >= 10) content.push(s('text', { x: x(i), y: 180, 'text-anchor': 'middle', class: 'pop-label', text: `${pop}%` }));
        content.push(s('text', { x: x(i), y: 194, 'text-anchor': 'middle', class: 'wind-label', text: fmt('wind', r.wind, ctx.units, { bare: true }) }));
      });
      const grad = s('linearGradient', { id: 'hourly-temp', x1: 0, x2: 1, y1: 0, y2: 0 },
        ...rows.map((r, i) => s('stop', { offset: `${(i / Math.max(1, rows.length - 1)) * 100}%`, 'stop-color': tempColor(r.temp) })));
      const svg = chart(W, H, null, s('defs', {}, grad),
        s('path', { d: smoothPath(pts), class: 'temp-line', stroke: 'url(#hourly-temp)' }),
        ...pts.map(([px, py]) => s('circle', { cx: px, cy: py, r: 3, class: 'temp-dot' })),
        ...content);
      const text = rows.slice(0, 24).map((r) => `${fmtHour(r.t, ctx.tz, ctx.clock)} ${fmt('temp', r.temp, ctx.units)} ${wmo(r.code).label}, ${r.pop ?? 0}%`).join('; ');
      return card('hourly', t('Hourly'), [
        ctx.large ? h('div.hourly-fit', svg) : h('div.hourly-scroll', { tabindex: 0, role: 'region', 'aria-label': t('Hourly forecast, scrolls sideways') }, svg),
        h('p.visually-hidden', text),
      ], { cls: 'wide', note: t('Precipitation chance and wind ({unit}) along the bottom.', { unit: ctx.units.wind === 'kmh' ? 'km/h' : ctx.units.wind }) });
    }, { retry: () => ctx.retry('forecast'), cls: 'wide' });
  },
};

// --- daily -------------------------------------------------------------------------

export const daily = {
  uses: ['forecast'],
  render(ctx) {
    return withSlot(ctx.wx.forecast, 'daily', t('10 days'), (f) => {
      const days = f.daily.filter((d) => d.max != null);
      if (!days.length) return null;
      const lo = Math.min(...days.map((d) => d.min));
      const hi = Math.max(...days.map((d) => d.max));
      const pos = (v) => `${((v - lo) / (hi - lo || 1)) * 100}%`;
      const todayKey = dateKey(ctx.now, ctx.tz);
      const current = f.current.temp;
      const list = days.map((d) => {
        const key = dateKey(d.t + 12 * 36e5, ctx.tz);
        const isToday = key === todayKey;
        const c = wmo(d.code);
        return h('li.day', { class: { today: isToday } },
          h('span.day-name', isToday ? t('Today') : fmtWeekday(d.t + 12 * 36e5, ctx.tz)),
          wxIcon(wmoIcon(d.code, true), c.label, 'day-icon'),
          h('span.day-pop', (d.pop ?? 0) >= 20 ? `${d.pop}%` : ''),
          h('span.day-min', fmt('temp', d.min, ctx.units)),
          h('span.range', { 'aria-hidden': 'true' },
            h('span.range-fill', { style: { left: pos(d.min), right: `calc(100% - ${pos(d.max)})`, '--from': tempColor(d.min), '--to': tempColor(d.max) } }),
            isToday && current != null && h('span.range-now', { style: { left: pos(Math.min(d.max, Math.max(d.min, current))) } })),
          h('span.day-max', fmt('temp', d.max, ctx.units)),
          h('span.visually-hidden', `${c.label}, ${t('low {min}, high {max}', { min: fmt('temp', d.min, ctx.units), max: fmt('temp', d.max, ctx.units) })}${(d.pop ?? 0) >= 20 ? `, ${t('{n}% chance of precipitation', { n: d.pop })}` : ''}`));
      });
      return card('daily', t('10 days'), h('ol.days', list), { cls: 'span2' });
    }, { retry: () => ctx.retry('forecast'), cls: 'span2' });
  },
};

// --- precipitation ------------------------------------------------------------------

export const precip = {
  uses: ['forecast'],
  render(ctx) {
    return withSlot(ctx.wx.forecast, 'precip', t('Precipitation'), (f) => {
      const today = f.daily[0];
      const next = ahead(f.hourly, ctx.now, 24);
      const sum24 = next.reduce((a, r) => a + (r.precip ?? 0), 0);
      const snow24 = next.reduce((a, r) => a + (r.snow ?? 0), 0);
      const maxPop = Math.max(0, ...next.map((r) => r.pop ?? 0));
      const wetHour = next.find((r) => (r.precip ?? 0) >= 0.2);
      const kind = snow24 >= 0.5 ? t('Snow') : sum24 > 0 ? t('Rain') : '';
      return card('precip', t('Precipitation'), [
        h('p.big-value', fmtPrecip(sum24, ctx.units), h('span.big-label', t('next 24 h'))),
        h('dl.stats',
          stat(t('Today'), fmtPrecip(today?.precip, ctx.units)),
          snow24 >= 0.5 && stat(t('Snow, next 24 h'), fmt('precip', snow24 * 10, ctx.units, { digits: 0 })),
          stat(t('Highest chance'), `${maxPop}%`),
          kind && wetHour && stat(t('Next'), `${kind} · ${fmtTime(wetHour.t, ctx.tz, ctx.clock)}`)),
      ]);
    }, { retry: () => ctx.retry('forecast') });
  },
};
