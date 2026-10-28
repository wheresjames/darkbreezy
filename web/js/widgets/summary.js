// The hero's one-line summaries, worked out from the forecast: rain
// starting or stopping soon, compared with yesterday, and the umbrella
// hint. Pure functions of the data (unit tested), no DOM.

import { convert, round } from '../util/units.js';
import { fmtTime, inMinutes } from '../util/time.js';
import { wmo } from '../util/wmo-codes.js';
import { t } from '../core/i18n.js';

const WET = 0.05;          // mm in 15 minutes that count as precipitation
const MIN = 60e3;

const kind = (code) => (wmo(code).precip === 'snow' ? 'snow' : wmo(code).precip === 'sleet' ? 'sleet' : 'rain');
const Kind = (k) => ({ rain: t('Rain'), snow: t('Snow'), sleet: t('Sleet') }[k]);

/**
 * "Rain starting in ~20 min" / "Rain stopping in ~45 min" / "Rain for at
 * least the next 2 hours", or null when it's dry for the next 2 hours.
 * [minutely] is the 15-minute rows; each covers the 15 minutes *before* its time.
 */
export function nowcastSummary(minutely, now) {
  const rows = minutely.filter((r) => r.t > now && r.t <= now + 2 * 36e5 + 15 * MIN);
  if (rows.length < 2) return null;
  const wet = rows.map((r) => (r.precip ?? 0) >= WET);
  if (wet[0]) {
    const dry = wet.indexOf(false);
    const k = Kind(kind(rows[0].code));
    if (dry < 0) return t('{kind} for at least the next 2 hours', { kind: k });
    const at = rows[dry].t - 15 * MIN;
    return t('{kind} stopping {when}', { kind: k, when: approx(at - now) });
  }
  const start = wet.indexOf(true);
  if (start < 0) return null;
  const at = rows[start].t - 15 * MIN;
  return t('{kind} starting {when}', { kind: Kind(kind(rows[start].code)), when: approx(at - now) });
}

/** "in ~20 min", rounded to 5 minutes. */
function approx(ms) {
  const min = Math.max(5, Math.round(ms / MIN / 5) * 5);
  return inMinutes(min).replace(/^in /, 'in ~');
}

/** "3° warmer than yesterday" from the hourly row 24 h ago, in the user's units; null without one. */
export function vsYesterday(current, hourly, units) {
  if (current?.temp == null) return null;
  const then = current.t - 864e5;
  const row = hourly.find((r) => Math.abs(r.t - then) <= 30 * MIN);
  if (row?.temp == null) return null;
  const d = round(convert(current.temp, units.temp) - convert(row.temp, units.temp), units.temp);
  if (Math.abs(d) < 1) return t('About the same as yesterday');
  return d > 0 ? t('{n}° warmer than yesterday', { n: d }) : t('{n}° colder than yesterday', { n: -d });
}

/**
 * The umbrella line: wet hours in the next 12, as "Umbrella from 3 pm",
 * "Umbrella needed now", "Snow from 3 pm"; null when it stays dry.
 */
export function umbrellaHint(hourly, now, tz, clock) {
  const next = hourly.filter((r) => r.t + 36e5 > now && r.t < now + 12 * 36e5);
  const wet = next.find((r) => (r.pop ?? 0) >= 50 && (r.precip ?? 0) >= 0.2);
  if (!wet) return null;
  const k = kind(wet.code);
  const soon = wet.t <= now;
  if (k === 'snow') return soon ? t('Snow now: dress warm') : t('Snow from {time}', { time: fmtTime(wet.t, tz, clock) });
  return soon ? t('Umbrella needed now') : t('Umbrella from {time}', { time: fmtTime(wet.t, tz, clock) });
}
