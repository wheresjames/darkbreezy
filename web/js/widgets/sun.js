// Sun & moon, all computed here (util/sun.js, util/moon.js): the day's arc
// with the sun on it, sunrise and sunset, day length against yesterday,
// golden hour, and the moon's phase, rise and set. Works in polar day and
// night, where there's no sunrise to show.

import { h } from '../core/h.js';
import { t } from '../core/i18n.js';
import { fmtTime, fmtDuration } from '../util/time.js';
import { sunTimes, sunPosition, dayLength } from '../util/sun.js';
import { moonIllumination, moonTimes, phaseName } from '../util/moon.js';
import { card, stat } from './common.js';
import { chart, s } from './charts.js';

/** The place's local midnight (ms) before [now], from its UTC offset (seconds). */
export function midnight(now, utcOffset = 0) {
  const day = 864e5;
  return now - ((((now + utcOffset * 1000) % day) + day) % day);
}

function arc(times, now, p) {
  const W = 260;
  const H = 110;
  const base = 92;
  const path = `M20 ${base} Q${W / 2} -38 ${W - 20} ${base}`;
  let dot = null;
  if (times.sunrise && times.sunset && now >= times.sunrise && now <= times.sunset) {
    const f = (now - times.sunrise) / (times.sunset - times.sunrise);
    // Point on the quadratic curve at f.
    const x = (1 - f) ** 2 * 20 + 2 * (1 - f) * f * (W / 2) + f ** 2 * (W - 20);
    const y = (1 - f) ** 2 * base + 2 * (1 - f) * f * -38 + f ** 2 * base;
    dot = s('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 8, class: 'sun-dot' });
  }
  const alt = sunPosition(now, p.lat, p.lon).altitude;
  return chart(W, H, alt > 0 ? t('The sun is {deg}° above the horizon', { deg: Math.round(alt) }) : t('The sun is below the horizon'),
    s('line', { x1: 8, x2: W - 8, y1: base, y2: base, class: 'horizon' }),
    s('path', { d: path, class: 'sun-arc' }),
    dot);
}

/** The moon as seen: a disc lit by [fraction], waxing on the right (southern hemisphere: mirrored). */
function moonDisc(phase, fraction, south) {
  const r = 22;
  const waxing = phase < 0.5;
  const k = Math.cos(Math.PI * 2 * phase) * r; // terminator ellipse half-width
  const right = waxing !== south;
  const sweepOuter = right ? 1 : 0;
  const sweepInner = (fraction < 0.5) === right ? 0 : 1;
  const d = `M24 2 A${r} ${r} 0 0 ${sweepOuter} 24 46 A${Math.abs(k).toFixed(2)} ${r} 0 0 ${sweepInner} 24 2 Z`;
  return chart(48, 48, null,
    s('circle', { cx: 24, cy: 24, r, class: 'moon-dark' }),
    fraction > 0.02 && s('path', { d, class: 'moon-lit' }));
}

export const sun = {
  uses: ['forecast'],
  render(ctx) {
    const { place: p, tz, clock, now } = ctx;
    const f = ctx.wx.forecast?.data;
    const start = midnight(now, f?.utcOffset ?? Math.round(p.lon / 15) * 3600);
    const noon = start + 12 * 36e5;
    const today = sunTimes(noon, p.lat, p.lon, f?.elevation || 0);
    const yesterday = sunTimes(noon - 864e5, p.lat, p.lon, f?.elevation || 0);
    const len = dayLength(today);
    const diff = len - dayLength(yesterday);
    const m = moonIllumination(now);
    const mt = moonTimes(start, p.lat, p.lon);
    const time = (ms) => (ms ? fmtTime(ms, tz, clock) : '–');
    let lead;
    if (today.polarDay) lead = h('p.card-lead', t('Midnight sun: the sun doesn\'t set today.'));
    else if (today.polarNight) lead = h('p.card-lead', t('Polar night: the sun doesn\'t rise today.'));
    else lead = h('div.sun-times', h('div', h('span.muted', t('Sunrise')), h('strong', time(today.sunrise))), h('div', h('span.muted', t('Sunset')), h('strong', time(today.sunset))));
    const longer = Math.abs(diff) < 30 ? '' : diff > 0 ? t('{d} longer than yesterday', { d: fmtDuration(diff) }) : t('{d} shorter than yesterday', { d: fmtDuration(diff) });
    return card('sun', t('Sun & moon'), [
      !today.polarDay && !today.polarNight && arc(today, now, p),
      lead,
      h('dl.stats',
        stat(t('Day length'), fmtDuration(len), longer && ` · ${longer}`),
        today.golden && stat(t('Golden hour'), t('from {time}', { time: time(today.golden) })),
        (today.polarNight && today.dawn) && stat(t('Twilight'), `${time(today.dawn)} – ${time(today.dusk)}`)),
      h('div.moon',
        moonDisc(m.phase, m.fraction, p.lat < 0),
        h('div',
          h('strong', phaseName(m.phase)),
          h('p.small.muted', t('{n}% lit', { n: Math.round(m.fraction * 100) })),
          h('p.small', mt.alwaysUp ? t('Up all day') : mt.alwaysDown ? t('Down all day')
            : [mt.rise && t('Rises {time}', { time: time(mt.rise) }), mt.set && t('Sets {time}', { time: time(mt.set) })].filter(Boolean).join(' · ')))),
    ]);
  },
};
