// Air quality (modeled, Copernicus CAMS through Open-Meteo) and pollen
// (Europe only: the card hides elsewhere, DARKBREEZY.md §3.2).

import { h } from '../core/h.js';
import { t } from '../core/i18n.js';
import { usAqiCategory, euAqiCategory, aqiScale, dominantPollutant, pollenRanked } from '../util/format.js';
import { card, withSlot, stat, levelChip } from './common.js';

const air = (ctx, id, title, draw) => withSlot(ctx.wx.air, id, title, draw, { retry: () => ctx.retry('air') });
const ug = (v) => (v == null ? '–' : `${Math.round(v)} µg/m³`);

export const aqi = {
  uses: ['air'],
  render(ctx) {
    return air(ctx, 'aqi', t('Air quality'), (a) => {
      const scale = aqiScale(ctx.s.aqi, ctx.place.cc);
      const value = scale === 'eu' ? a.euAqi : a.usAqi;
      if (value == null) return null;
      const cat = (scale === 'eu' ? euAqiCategory : usAqiCategory)(value);
      const top = dominantPollutant(a);
      const max = scale === 'eu' ? 120 : 300;
      return card('aqi', t('Air quality'), [
        h('p.big-value', String(Math.round(value)), levelChip(cat.level, cat.label)),
        h('div.meter.meter-aqi', { dataset: { scale }, 'aria-hidden': 'true' }, h('span.meter-mark', { style: { left: `${Math.min(100, (value / max) * 100)}%` } })),
        h('p.small.muted', scale === 'eu' ? t('European AQI') : t('US AQI'), top && top.ratio > 0.5 ? ` · ${t('mostly {p}', { p: top.name })}` : ''),
        h('dl.stats.stats-grid',
          stat('PM2.5', ug(a.pm25)), stat('PM10', ug(a.pm10)),
          stat(t('Ozone'), ug(a.o3)), stat('NO₂', ug(a.no2))),
      ], { level: cat.level, note: t('Modeled (Copernicus CAMS), not a sensor reading.') });
    });
  },
};

const PLANTS = { alder: 'Alder', birch: 'Birch', grass: 'Grass', mugwort: 'Mugwort', olive: 'Olive', ragweed: 'Ragweed' };

export const pollen = {
  uses: ['air'],
  render(ctx) {
    return air(ctx, 'pollen', t('Pollen'), (a) => {
      if (!a.pollen) return null;
      const rows = pollenRanked(a.pollen);
      const worst = rows[0];
      return card('pollen', t('Pollen'), [
        h('p.card-lead', worst.lvl.level === 0 ? t('Little or no pollen right now.') : t('Highest: {plant}, {level}', { plant: t(PLANTS[worst.k]), level: worst.lvl.label.toLowerCase() })),
        h('dl.stats', rows.map((r) => stat(t(PLANTS[r.k]), levelChip(r.lvl.level, r.lvl.label), ` ${Math.round(r.v)}/m³`))),
      ], { note: t('Modeled pollen (CAMS), Europe only.') });
    });
  },
};
