// The hero: the place, the big temperature and condition, feels-like and
// today's high/low, and a line or two of summary. Straight on the sky.

import { h } from '../core/h.js';
import { t } from '../core/i18n.js';
import { fmt } from '../util/units.js';
import { wmo, wmoIcon } from '../util/wmo-codes.js';
import { placeLabel } from '../util/place.js';
import { nowcastSummary, vsYesterday, umbrellaHint } from './summary.js';
import { wxIcon } from './common.js';

export function hero(ctx) {
  const { place, units, tz, clock, now } = ctx;
  const f = ctx.wx.forecast?.data;
  if (!f) return h('div.hero', h('p.hero-place', placeLabel(place, { full: true })));
  const c = f.current;
  const today = f.daily[0];
  const code = wmo(c.code);
  const lines = [nowcastSummary(f.minutely, now), umbrellaHint(f.hourly, now, tz, clock), vsYesterday(c, f.hourly, units)].filter(Boolean);
  return h('div.hero',
    h('p.hero-place', placeLabel(place, { full: true })),
    h('div.hero-main',
      h('div.hero-temp', { 'aria-label': t('{temp} now', { temp: fmt('temp', c.temp, units) }) }, fmt('temp', c.temp, units)),
      wxIcon(wmoIcon(c.code, c.isDay), code.label, 'hero-icon')),
    h('p.hero-condition', code.label),
    h('div.hero-meta',
      h('span', t('Feels like {temp}', { temp: fmt('temp', c.feels, units) })),
      today && h('span', t('H {max} · L {min}', { max: fmt('temp', today.max, units), min: fmt('temp', today.min, units) }))),
    lines.length > 0 && h('div.hero-summary', lines.map((l) => h('p', l))));
}
