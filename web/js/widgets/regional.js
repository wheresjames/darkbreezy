// Cards that exist only where their data does (DARKBREEZY.md §2): the
// nearest station's reading (US, Canada, Germany), the NWS forecaster's
// discussion (US), the sea (coasts), aurora (high latitudes), and a radar
// loop has its own module (widgets/radar.js).

import { h } from '../core/h.js';
import { t } from '../core/i18n.js';
import { fmt, fmtDistance, compass } from '../util/units.js';
import { ago, fmtDateTime, fmtTime } from '../util/time.js';
import { card, withSlot, stat, levelChip } from './common.js';

// --- station reading ---------------------------------------------------------------

export const station = {
  uses: ['obs', 'forecast'],
  render(ctx) {
    const slot = ctx.wx.obs;
    if (!slot) return null;
    return withSlot(slot, 'station', t('Station reading'), (o) => {
      const model = ctx.wx.forecast?.data?.current?.temp;
      return card('station', t('Station reading'), [
        h('p.big-value', fmt('temp', o.temp, ctx.units), model != null && h('span.big-label', t('model {temp}', { temp: fmt('temp', model, ctx.units) }))),
        o.text && h('p.value-label', o.text),
        h('dl.stats',
          o.wind != null && stat(t('Wind'), `${fmt('wind', o.wind, ctx.units)}${o.windDir != null ? ` ${compass(o.windDir)}` : ''}`),
          o.humidity != null && stat(t('Humidity'), `${Math.round(o.humidity)}%`),
          o.pressure != null && stat(t('Pressure'), fmt('pressure', o.pressure, ctx.units)),
          o.visibility != null && stat(t('Visibility'), fmtDistance(o.visibility, ctx.units))),
        h('p.small.muted', [o.station, o.distanceKm != null && fmtDistance(o.distanceKm * 1000, ctx.units), ago(o.t, ctx.now)].filter(Boolean).join(' · ')),
      ], { note: t('Measured by {source}.', { source: o.source }) });
    }, { retry: () => ctx.retry('obs') });
  },
};

// --- forecast discussion -----------------------------------------------------------------

const openDiscussion = { value: false };

export const discussion = {
  uses: ['discussion'],
  render(ctx) {
    const slot = ctx.wx.discussion;
    if (!slot) return null;
    return withSlot(slot, 'discussion', t('Forecaster\'s discussion'), (d) => {
      const keyMessages = d.text.match(/\.KEY MESSAGES\.\.\.\n([\s\S]*?)(\n&&|\n\.[A-Z])/);
      const preview = (keyMessages ? keyMessages[1] : d.text.split('\n\n').slice(1, 3).join('\n\n')).trim().slice(0, 600);
      return card('discussion', t('Forecaster\'s discussion'), [
        h('p.discussion-preview', preview),
        h('details.discussion', { open: openDiscussion.value, ontoggle: (e) => { openDiscussion.value = e.target.open; } },
          h('summary', t('Full discussion')),
          h('pre.discussion-text', d.text)),
        h('p.small.muted', t('NWS {office} · {time}', { office: d.office, time: fmtDateTime(d.issued, ctx.tz, ctx.clock) })),
      ], { cls: 'span2' });
    }, { retry: () => ctx.retry('discussion'), cls: 'span2' });
  },
};

// --- sea -------------------------------------------------------------------------------

export const marine = {
  uses: ['marine'],
  render(ctx) {
    const m = ctx.wx.marine?.data;
    if (!m) return null;
    return card('marine', t('Sea'), [
      h('p.big-value', fmt('height', m.waveHeight, ctx.units, { digits: 1 }), h('span.big-label', t('waves'))),
      h('dl.stats',
        m.wavePeriod != null && stat(t('Period'), `${Math.round(m.wavePeriod)} s`),
        m.waveDir != null && stat(t('From'), compass(m.waveDir)),
        m.swell != null && stat(t('Swell'), fmt('height', m.swell, ctx.units, { digits: 1 })),
        m.sst != null && stat(t('Water'), fmt('temp', m.sst, ctx.units))),
    ], { note: t('Nearest sea point; not for navigation.') });
  },
};

// --- aurora ----------------------------------------------------------------------------

export const aurora = {
  uses: ['aurora', 'forecast'],
  render(ctx) {
    const slot = ctx.wx.aurora;
    if (!slot) return null;
    return withSlot(slot, 'aurora', t('Aurora'), (a) => {
      const c = a.chance;
      const [level, label] = c < 10 ? [0, t('Unlikely')] : c < 30 ? [1, t('Possible')] : c < 50 ? [2, t('Likely')] : [3, t('High')];
      const cloud = ctx.wx.forecast?.data?.current?.cloud;
      return card('aurora', t('Aurora'), [
        h('p.big-value', `${Math.round(c)}%`, levelChip(level, label)),
        h('p.small', cloud != null && cloud > 70 ? t('Clouds may hide it right now.') : t('Best seen on a dark, clear night, looking toward the pole.')),
        a.forecastTime && h('p.small.muted', t('Forecast for {time}', { time: fmtTime(a.forecastTime, ctx.tz, ctx.clock) })),
      ], { note: t('NOAA SWPC aurora forecast (OVATION).') });
    }, { retry: () => ctx.retry('aurora') });
  },
};
