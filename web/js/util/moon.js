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
