// The moon: phase, how much of it is lit, and when it rises and sets.
// SunCalc's formulas (Vladimir Agafonkin, BSD-2-Clause), like util/sun.js.

import { toDays, rightAscension, declination, altitude, siderealTime, sunCoords } from './sun.js';

const RAD = Math.PI / 180;
const HOUR = 36e5;

function moonCoords(d) {
  const L = RAD * (218.316 + 13.176396 * d);
  const M = RAD * (134.963 + 13.064993 * d);
  const F = RAD * (93.272 + 13.22935 * d);
  const l = L + RAD * 6.289 * Math.sin(M);
  const b = RAD * 5.128 * Math.sin(F);
  const dist = 385001 - 20905 * Math.cos(M);
  return { ra: rightAscension(l, b), dec: declination(l, b), dist };
}

/** The moon's altitude in degrees (refraction-corrected) at [ms]. */
export function moonAltitude(ms, lat, lon) {
  const lw = RAD * -lon;
  const phi = RAD * lat;
  const d = toDays(ms);
  const c = moonCoords(d);
  const H = siderealTime(d, lw) - c.ra;
  let h = altitude(H, phi, c.dec);
  const alt = h < 0 ? 0 : h;
  h += 0.0002967 / Math.tan(alt + 0.00312536 / (alt + 0.08901179));
  return h / RAD;
}

/**
 * Lit fraction (0–1) and phase (0 new, 0.25 first quarter, 0.5 full,
 * 0.75 last quarter) at [ms].
 */
export function moonIllumination(ms) {
  const d = toDays(ms);
  const s = sunCoords(d);
  const m = moonCoords(d);
  const sdist = 149598000;
  const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
  const inc = Math.atan2(sdist * Math.sin(phi), m.dist - sdist * Math.cos(phi));
  const angle = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra),
    Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
  return {
    fraction: (1 + Math.cos(inc)) / 2,
    phase: 0.5 + 0.5 * inc * (angle < 0 ? -1 : 1) / Math.PI,
  };
}

const NAMES = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
/** The phase's name: "Waxing gibbous". */
export function phaseName(phase) {
  return NAMES[Math.round(phase * 8) % 8];
}

const SHORT = { 0: 'New', 0.25: 'First qtr', 0.5: 'Full', 0.75: 'Last qtr' };
/** A short name for a new moon, quarter or full moon (0, 0.25, 0.5, 0.75): "First qtr". */
export const shortPhaseName = (phase) => SHORT[phase];

/**
 * Moonrise and moonset (ms or null) in the 24 hours from [startMs]
 * (the place's local midnight), scanning in 2-hour steps with a quadratic
 * fit, as SunCalc does.
 */
export function moonTimes(startMs, lat, lon) {
  const hc = 0.133;
  let h0 = moonAltitude(startMs, lat, lon) - hc;
  let rise = null;
  let set = null;
  let ye = 0;
  for (let i = 1; i <= 24; i += 2) {
    const h1 = moonAltitude(startMs + i * HOUR, lat, lon) - hc;
    const h2 = moonAltitude(startMs + (i + 1) * HOUR, lat, lon) - hc;
    const a = (h0 + h2) / 2 - h1;
    const b = (h2 - h0) / 2;
    const xe = -b / (2 * a);
    ye = (a * xe + b) * xe + h1;
    const d = b * b - 4 * a * h1;
    let roots = 0;
    let x1 = 0;
    let x2 = 0;
    if (d >= 0) {
      const dx = Math.sqrt(d) / (Math.abs(a) * 2);
      x1 = xe - dx;
      x2 = xe + dx;
      if (Math.abs(x1) <= 1) roots++;
      if (Math.abs(x2) <= 1) roots++;
      if (x1 < -1) x1 = x2;
    }
    if (roots === 1) {
      if (h0 < 0) rise = i + x1; else set = i + x1;
    } else if (roots === 2) {
      rise = i + (ye < 0 ? x2 : x1);
      set = i + (ye < 0 ? x1 : x2);
    }
    if (rise != null && set != null) break;
    h0 = h2;
  }
  return {
    rise: rise == null ? null : startMs + rise * HOUR,
    set: set == null ? null : startMs + set * HOUR,
    alwaysUp: rise == null && set == null && ye > 0,
    alwaysDown: rise == null && set == null && ye <= 0,
  };
}

/**
 * When the phase [k] comes (ms): k counts phases from the new moon of
 * 6 January 2000, in quarters (k = 1.5: the full moon a month and a half
 * later). Meeus, Astronomical Algorithms ch. 49, without the planetary
 * terms: within a few minutes.
 */
export function phaseTime(k) {
  const T = k / 1236.85;
  const sin = (deg) => Math.sin(deg * RAD);
  const cos = (deg) => Math.cos(deg * RAD);
  let jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T ** 2 - 0.00000015 * T ** 3 + 0.00000000073 * T ** 4;
  const E = 1 - 0.002516 * T - 0.0000074 * T ** 2;
  const M = 2.5534 + 29.1053567 * k - 0.0000014 * T ** 2 - 0.00000011 * T ** 3;
  const Mp = 201.5643 + 385.81693528 * k + 0.0107582 * T ** 2 + 0.00001238 * T ** 3 - 0.000000058 * T ** 4;
  const F = 160.7108 + 390.67050284 * k - 0.0016118 * T ** 2 - 0.00000227 * T ** 3 + 0.000000011 * T ** 4;
  const O = 124.7746 - 1.56375588 * k + 0.0020672 * T ** 2 + 0.00000215 * T ** 3;
  const q = ((k % 1) + 1) % 1;
  if (q === 0 || q === 0.5) {
    const full = q === 0.5;
    jde += (full ? -0.40614 : -0.4072) * sin(Mp) + (full ? 0.17302 : 0.17241) * E * sin(M)
      + (full ? 0.01614 : 0.01608) * sin(2 * Mp) + (full ? 0.01043 : 0.01039) * sin(2 * F)
      + (full ? 0.00734 : 0.00739) * E * sin(Mp - M) - (full ? 0.00515 : 0.00514) * E * sin(Mp + M)
      + (full ? 0.00209 : 0.00208) * E * E * sin(2 * M) - 0.00111 * sin(Mp - 2 * F) - 0.00057 * sin(Mp + 2 * F)
      + 0.00056 * E * sin(2 * Mp + M) - 0.00042 * sin(3 * Mp) + 0.00042 * E * sin(M + 2 * F)
      + 0.00038 * E * sin(M - 2 * F) - 0.00024 * E * sin(2 * Mp - M) - 0.00017 * sin(O);
  } else {
    jde += -0.62801 * sin(Mp) + 0.17172 * E * sin(M) - 0.01183 * E * sin(Mp + M) + 0.00862 * sin(2 * Mp)
      + 0.00804 * sin(2 * F) + 0.00454 * E * sin(Mp - M) + 0.00204 * E * E * sin(2 * M) - 0.0018 * sin(Mp - 2 * F)
      - 0.0007 * sin(Mp + 2 * F) - 0.0004 * sin(3 * Mp) - 0.00034 * E * sin(2 * Mp - M) + 0.00032 * E * sin(M + 2 * F)
      + 0.00032 * E * sin(M - 2 * F) - 0.00028 * E * E * sin(Mp + 2 * M) + 0.00027 * E * sin(2 * Mp + M) - 0.00017 * sin(O);
    const W = 0.00306 - 0.00038 * E * cos(M) + 0.00026 * cos(Mp) - 0.00002 * cos(Mp - M) + 0.00002 * cos(Mp + M) + 0.00002 * cos(2 * F);
    jde += q === 0.25 ? W : -W;
  }
  return Math.round((jde - 2440587.5) * 864e5);
}

/**
 * The next [n] new moons, first quarters, full moons and last quarters
 * after [ms], in order: [{ phase (0, 0.25, 0.5 or 0.75), t (ms) }].
 */
export function nextPhases(ms, n = 4) {
  let k = Math.floor((ms / 864e5 + 2440587.5 - 2451550.09766) / 29.530588861) - 1;
  const out = [];
  while (out.length < n) {
    const t = phaseTime(k);
    if (t > ms) out.push({ phase: ((k % 1) + 1) % 1, t });
    k += 0.25;
  }
  return out;
}

/**
 * The moon's pass across the sky that's on now, or the next one if it's
 * down: { rise, set, up } (ms or null; [up]: it's in the sky at [now]).
 * [start]: the place's local midnight today. Rise and set come from the
 * day before to the day after, so a pass that crosses midnight is whole.
 */
export function moonPass(now, start, lat, lon) {
  const DAY = 24 * HOUR;
  const events = [-1, 0, 1, 2].flatMap((i) => {
    const m = moonTimes(start + i * DAY, lat, lon);
    return [m.rise && { t: m.rise, rise: true }, m.set && { t: m.set, rise: false }].filter(Boolean);
  }).sort((x, y) => x.t - y.t);
  const before = events.filter((e) => e.t <= now).pop();
  const up = before ? before.rise : moonAltitude(now, lat, lon) > 0;
  const rise = up ? before?.t ?? null : events.find((e) => e.rise && e.t > now)?.t ?? null;
  const set = events.find((e) => !e.rise && e.t > (rise ?? now))?.t ?? null;
  return { rise, set, up };
}
