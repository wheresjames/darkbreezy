// Sun and Moon cards, all computed here (util/sun.js, util/moon.js). The
// sun: the day's arc with the sun on it, sunrise and sunset, day length
// against yesterday, golden hour; works in polar day and night, where
// there's no sunrise to show. The moon: its pass across the sky with the
// moon on it as it looks now, how much is lit, and a timeline of the next
// four phases.

import { h } from '../core/h.js';
import { t } from '../core/i18n.js';
import { fmtTime, fmtDuration, fmtWeekday, fmtShortDate, dateKey } from '../util/time.js';
import { sunTimes, sunPosition, dayLength } from '../util/sun.js';
import { moonIllumination, moonAltitude, moonPass, nextPhases, phaseName, shortPhaseName } from '../util/moon.js';
import { card, stat } from './common.js';
import { chart, s } from './charts.js';

/** The place's local midnight (ms) before [now], from its UTC offset (seconds). */
export function midnight(now, utcOffset = 0) {
  const day = 864e5;
  return now - ((((now + utcOffset * 1000) % day) + day) % day);
}

// The curve's top is halfway to its control point (base + peak) / 2: room above for the sun on it, none to spare.
const ARC = { W: 260, H: 86, base: 76, peak: -54 };
const ARC_PATH = `M20 ${ARC.base} Q${ARC.W / 2} ${ARC.peak} ${ARC.W - 20} ${ARC.base}`;

/** Where on the arc a body is, [f] (0–1) of the way from rising to setting. */
function onArc(f) {
  const x = (1 - f) ** 2 * 20 + 2 * (1 - f) * f * (ARC.W / 2) + f ** 2 * (ARC.W - 20);
  const y = (1 - f) ** 2 * ARC.base + 2 * (1 - f) * f * ARC.peak + f ** 2 * ARC.base;
  return { x, y };
}

/** The sky's arc from [rise] to [set] (ms), with [body](x, y) drawn on it when [now] is between them. */
function arc(rise, set, now, label, cls, body) {
  const up = rise && set && now >= rise && now <= set;
  const at = up && onArc((now - rise) / (set - rise));
  return chart(ARC.W, ARC.H, label,
    s('line', { x1: 8, x2: ARC.W - 8, y1: ARC.base, y2: ARC.base, class: 'horizon' }),
    s('path', { d: ARC_PATH, class: cls }),
    at && body(at.x, at.y));
}

const sunArc = (times, now, p) => {
  const alt = sunPosition(now, p.lat, p.lon).altitude;
  return arc(times.sunrise, times.sunset, now,
    alt > 0 ? t('The sun is {deg}° above the horizon', { deg: Math.round(alt) }) : t('The sun is below the horizon'),
    'sun-arc', (x, y) => s('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 8, class: 'sun-dot' }));
};

/**
 * The moon as seen, centered on [cx],[cy] with radius [r]: a disc lit by
 * [fraction], waxing on the right (southern hemisphere: mirrored).
 */
function moonShape(cx, cy, r, phase, fraction, south) {
  const waxing = phase < 0.5;
  const k = Math.cos(Math.PI * 2 * phase) * r; // terminator ellipse half-width
  const right = waxing !== south;
  const sweepOuter = right ? 1 : 0;
  const sweepInner = (fraction < 0.5) === right ? 0 : 1;
  const top = `${cx} ${cy - r}`;
  const d = `M${top} A${r} ${r} 0 0 ${sweepOuter} ${cx} ${cy + r} A${Math.abs(k).toFixed(2)} ${r} 0 0 ${sweepInner} ${top} Z`;
  return s('g', { class: 'moon-shape' },
    s('circle', { cx, cy, r, class: 'moon-dark' }),
    fraction > 0.02 && s('path', { d, class: 'moon-lit' }));
}

/** A moon disc on its own, [size] px across. */
const moonDisc = (size, phase, fraction, south) => chart(size, size, null, moonShape(size / 2, size / 2, size / 2 - 1, phase, fraction, south));

/** How much of the moon is lit at each of the four phases. */
const LIT = { 0: 0, 0.25: 0.5, 0.5: 1, 0.75: 0.5 };

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
    const time = (ms) => (ms ? fmtTime(ms, tz, clock) : '–');
    let lead;
    if (today.polarDay) lead = h('p.card-lead', t('Midnight sun: the sun doesn\'t set today.'));
    else if (today.polarNight) lead = h('p.card-lead', t('Polar night: the sun doesn\'t rise today.'));
    else lead = h('div.sun-times', h('div', h('span.muted', t('Sunrise')), h('strong', time(today.sunrise))), h('div', h('span.muted', t('Sunset')), h('strong', time(today.sunset))));
    const longer = Math.abs(diff) < 30 ? '' : diff > 0 ? t('{d} longer than yesterday', { d: fmtDuration(diff) }) : t('{d} shorter than yesterday', { d: fmtDuration(diff) });
    return card('sun', t('Sun'), [
      !today.polarDay && !today.polarNight && sunArc(today, now, p),
      lead,
      h('dl.stats',
        stat(t('Day length'), fmtDuration(len), longer && ` · ${longer}`),
        today.golden && stat(t('Golden hour'), t('from {time}', { time: time(today.golden) })),
        (today.polarNight && today.dawn) && stat(t('Twilight'), `${time(today.dawn)} – ${time(today.dusk)}`)),
    ]);
  },
};

export const moon = {
  uses: ['forecast'],
  render(ctx) {
    const { place: p, tz, clock, now } = ctx;
    const f = ctx.wx.forecast?.data;
    const start = midnight(now, f?.utcOffset ?? Math.round(p.lon / 15) * 3600);
    const south = p.lat < 0;
    const m = moonIllumination(now);
    const pass = moonPass(now, start, p.lat, p.lon);
    const today = dateKey(now, tz);
    // Rise and set of the pass on now (or next): the weekday too when it's not today.
    const time = (ms) => (!ms ? '–' : dateKey(ms, tz) === today ? fmtTime(ms, tz, clock) : `${fmtWeekday(ms, tz)} ${fmtTime(ms, tz, clock)}`);
    const alt = moonAltitude(now, p.lat, p.lon);
    const label = alt > 0 ? t('The moon is {deg}° above the horizon', { deg: Math.round(alt) }) : t('The moon is below the horizon');
    const phases = nextPhases(now, 4);
    // The phase in the middle, under the top of the arc; rise and set either side when there are any.
    const phaseNow = h('div.moon-now', h('strong', phaseName(m.phase)), h('span.muted', t('{n}% lit', { n: Math.round(m.fraction * 100) })));
    const lead = pass.rise || pass.set
      ? h('div.sun-times', h('div', h('span.muted', t('Moonrise')), h('strong', time(pass.rise))), phaseNow, h('div', h('span.muted', t('Moonset')), h('strong', time(pass.set))))
      : h('div.sun-times', h('div', h('span.muted', t('Moon')), h('strong', alt > 0 ? t('Up all day') : t('Down all day'))), phaseNow);
    return card('moon', t('Moon'), [
      pass.rise && pass.set && arc(pass.rise, pass.set, now, label, 'moon-arc', (x, y) => moonShape(+x.toFixed(1), +y.toFixed(1), 9, m.phase, m.fraction, south)),
      lead,
      h('ol.moon-timeline', { 'aria-label': t('Coming phases') },
        phases.map((x) => {
          const date = `${fmtWeekday(x.t, tz)} ${fmtShortDate(x.t, tz)}`;
          return h('li', { 'aria-label': `${phaseName(x.phase)}, ${date}` },
            moonDisc(26, x.phase, LIT[x.phase], south),
            h('strong', { 'aria-hidden': 'true' }, shortPhaseName(x.phase)),
            h('span.muted', { 'aria-hidden': 'true' }, date));
        })),
    ]);
  },
};
