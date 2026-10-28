// Compact cards: each small card in one line, its one number to glance at,
// at normal text size. The large-screen and wallpaper layouts switch cards
// to these (and then drop them) from the bottom of the user's card order
// when the full ones don't fit the window (views/wall.js fitWall). The
// feature tiles (radar, map, hourly, 10 days) have none.
//
// Each takes the same context as the full card and returns a node, or null
// when the full card would hide too (no data for this place).

import { h } from '../core/h.js';
import { t } from '../core/i18n.js';
import { fmt, fmtPrecip, fmtDistance, compass } from '../util/units.js';
import { fmtTime, dateKey } from '../util/time.js';
import { uvCategory, usAqiCategory, euAqiCategory, aqiScale, pollenRanked, pressureTrend, visibilityLabel } from '../util/format.js';
import { sunTimes } from '../util/sun.js';
import { moonIllumination, phaseName } from '../util/moon.js';
import { nowcastSummary } from './summary.js';
import { ahead, rowAt } from './common.js';
import { midnight } from './sun.js';

/** One line: a small label, the value, a muted extra, and a category dot. */
export function compactCard(id, label, value, extra = '', level = null) {
  return h(`section.card.compact.card-${id}`, { dataset: { widget: id, level: level ?? undefined } },
    h('span.compact-label', label),
    h('span.compact-value', level != null && h('span.compact-dot', { 'aria-hidden': 'true' }), value),
    extra && h('span.compact-extra', extra));
}

/** Loading, couldn't load, or nothing here: the compact equivalents of withSlot's states. */
function slotted(slot, id, label, draw) {
  if (!slot) return null;
  if (slot.data != null) return draw(slot.data);
  if (slot.error) return compactCard(id, label, '–', t('couldn\'t load'));
  if (!slot.at) return compactCard(id, label, '…');
  return null;
}
const fc = (ctx, id, label, draw) => slotted(ctx.wx.forecast, id, label, draw);

export const COMPACT = {
  warnings: (ctx) => slotted(ctx.wx.alerts, 'warnings', t('Warnings'), (r) => (r.alerts.length
    ? compactCard('warnings', t('Warnings'), String(r.alerts.length), r.alerts[0].event)
    : r.failed.length && !r.service && r.coverage !== 'national'
      ? compactCard('warnings', t('Warnings'), '–', t('couldn\'t check'))
      : compactCard('warnings', t('Warnings'), t('None')))),

  nowcast: (ctx) => fc(ctx, 'nowcast', t('Next 2 hours'), (f) => compactCard('nowcast', t('Next 2 hours'),
    nowcastSummary(f.minutely, ctx.now) || t('Dry'))),

  precip: (ctx) => fc(ctx, 'precip', t('Precipitation'), (f) => {
    const next = ahead(f.hourly, ctx.now, 24);
    const sum = next.reduce((a, r) => a + (r.precip ?? 0), 0);
    const pop = Math.max(0, ...next.map((r) => r.pop ?? 0));
    return compactCard('precip', t('Precipitation'), fmtPrecip(sum, ctx.units), t('24 h · {n}%', { n: pop }));
  }),

  wind: (ctx) => fc(ctx, 'wind', t('Wind'), (f) => {
    const c = f.current;
    return compactCard('wind', t('Wind'), `${fmt('wind', c.wind, ctx.units)} ${compass(c.windDir)}`.trim(),
      c.gust != null ? t('gusts {g}', { g: fmt('wind', c.gust, ctx.units, { bare: true }) }) : '');
  }),

  sun: (ctx) => {
    const f = ctx.wx.forecast?.data;
    const p = ctx.place;
    const day = sunTimes(midnight(ctx.now, f?.utcOffset ?? Math.round(p.lon / 15) * 3600) + 12 * 36e5, p.lat, p.lon);
    const m = moonIllumination(ctx.now);
    const time = (ms) => (ms ? fmtTime(ms, ctx.tz, ctx.clock) : '–');
    const value = day.polarDay ? t('Up all day') : day.polarNight ? t('Down all day') : t('Rise {a} · Set {b}', { a: time(day.sunrise), b: time(day.sunset) });
    return compactCard('sun', t('Sun'), value, `${phaseName(m.phase)} ${Math.round(m.fraction * 100)}%`);
  },

  uv: (ctx) => fc(ctx, 'uv', t('UV index'), (f) => {
    const cat = uvCategory(f.current.uv);
    const today = dateKey(ctx.now, ctx.tz);
    const peak = Math.max(0, ...f.hourly.filter((r) => dateKey(r.t, ctx.tz) === today).map((r) => r.uv ?? 0));
    return compactCard('uv', t('UV index'), f.current.uv == null ? '–' : `${Math.round(f.current.uv)} ${cat.label}`,
      t('peak {n}', { n: Math.round(peak) }), cat?.level);
  }),

  aqi: (ctx) => slotted(ctx.wx.air, 'aqi', t('Air quality'), (a) => {
    const scale = aqiScale(ctx.s.aqi, ctx.place.cc);
    const value = scale === 'eu' ? a.euAqi : a.usAqi;
    if (value == null) return null;
    const cat = (scale === 'eu' ? euAqiCategory : usAqiCategory)(value);
    return compactCard('aqi', t('Air quality'), `${Math.round(value)} ${cat.label}`, scale === 'eu' ? 'EU' : 'US', cat.level);
  }),

  pollen: (ctx) => slotted(ctx.wx.air, 'pollen', t('Pollen'), (a) => {
    if (!a.pollen) return null;
    const { k: kind, lvl } = pollenRanked(a.pollen)[0];
    return compactCard('pollen', t('Pollen'), lvl.level === 0 ? t('None') : lvl.label, lvl.level === 0 ? '' : t(kind[0].toUpperCase() + kind.slice(1)), lvl.level);
  }),

  humidity: (ctx) => fc(ctx, 'humidity', t('Humidity'), (f) => compactCard('humidity', t('Humidity'),
    f.current.humidity == null ? '–' : `${Math.round(f.current.humidity)}%`, t('dew {d}', { d: fmt('temp', f.current.dew, ctx.units) }))),

  pressure: (ctx) => fc(ctx, 'pressure', t('Pressure'), (f) => {
    const c = f.current;
    const before = rowAt(f.hourly, c.t - 3 * 36e5);
    const trend = pressureTrend(c.pressure != null && before?.pressure != null ? c.pressure - before.pressure : null);
    return compactCard('pressure', t('Pressure'), fmt('pressure', c.pressure, ctx.units), trend.label);
  }),

  visibility: (ctx) => fc(ctx, 'visibility', t('Visibility'), (f) => (f.current.visibility == null ? null
    : compactCard('visibility', t('Visibility'), fmtDistance(f.current.visibility, ctx.units), visibilityLabel(f.current.visibility)))),

  clouds: (ctx) => fc(ctx, 'clouds', t('Cloud cover'), (f) => compactCard('clouds', t('Cloud cover'),
    f.current.cloud == null ? '–' : `${Math.round(f.current.cloud)}%`)),

  feels: (ctx) => fc(ctx, 'feels', t('Feels like'), (f) => compactCard('feels', t('Feels like'),
    fmt('temp', f.current.feels, ctx.units), t('actual {temp}', { temp: fmt('temp', f.current.temp, ctx.units) }))),

  station: (ctx) => slotted(ctx.wx.obs, 'station', t('Station'), (o) => compactCard('station', t('Station'),
    fmt('temp', o.temp, ctx.units), ctx.wx.forecast?.data ? t('model {temp}', { temp: fmt('temp', ctx.wx.forecast.data.current.temp, ctx.units) }) : '')),

  discussion: (ctx) => slotted(ctx.wx.discussion, 'discussion', t('Forecaster\'s discussion'), (d) => compactCard('discussion',
    t('Forecaster'), `NWS ${d.office}`, fmtTime(d.issued, ctx.tz, ctx.clock))),

  marine: (ctx) => {
    const m = ctx.wx.marine?.data;
    if (!m) return null;
    return compactCard('marine', t('Sea'), fmt('height', m.waveHeight, ctx.units, { digits: 1 }), m.sst != null ? t('water {temp}', { temp: fmt('temp', m.sst, ctx.units) }) : '');
  },

  aurora: (ctx) => slotted(ctx.wx.aurora, 'aurora', t('Aurora'), (a) => {
    const c = a.chance;
    const [level, label] = c < 10 ? [0, t('Unlikely')] : c < 30 ? [1, t('Possible')] : c < 50 ? [2, t('Likely')] : [3, t('High')];
    return compactCard('aurora', t('Aurora'), `${Math.round(c)}%`, label, level);
  }),
};
