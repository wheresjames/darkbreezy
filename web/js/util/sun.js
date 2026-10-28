// The sun's position and the day's sun times, computed here (no network,
// works at the poles). The formulas are SunCalc's (Vladimir Agafonkin,
// BSD-2-Clause, https://github.com/mourner/suncalc), after
// https://aa.quae.nl/en/reken/zonpositie.html.

const RAD = Math.PI / 180;
const DAY_MS = 864e5;
const J1970 = 2440588;
const J2000 = 2451545;
const E = RAD * 23.4397;   // obliquity of the Earth

export const toJulian = (ms) => ms / DAY_MS - 0.5 + J1970;
export const fromJulian = (j) => (j + 0.5 - J1970) * DAY_MS;
export const toDays = (ms) => toJulian(ms) - J2000;

export const rightAscension = (l, b) => Math.atan2(Math.sin(l) * Math.cos(E) - Math.tan(b) * Math.sin(E), Math.cos(l));
export const declination = (l, b) => Math.asin(Math.sin(b) * Math.cos(E) + Math.cos(b) * Math.sin(E) * Math.sin(l));
export const azimuth = (H, phi, dec) => Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
export const altitude = (H, phi, dec) => Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
export const siderealTime = (d, lw) => RAD * (280.16 + 360.9856235 * d) - lw;

const solarMeanAnomaly = (d) => RAD * (357.5291 + 0.98560028 * d);
function eclipticLongitude(M) {
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  return M + C + RAD * 102.9372 + Math.PI;
}
export function sunCoords(d) {
  const M = solarMeanAnomaly(d);
  const L = eclipticLongitude(M);
  return { dec: declination(L, 0), ra: rightAscension(L, 0) };
}

/** Where the sun is overhead at [ms]: { lat, lon } in degrees. */
export function subsolar(ms) {
  const d = toDays(ms);
  const c = sunCoords(d);
  let lon = (c.ra - siderealTime(d, 0)) / RAD;
  lon = ((lon % 360) + 360) % 360;
  if (lon > 180) lon -= 360;
  return { lat: c.dec / RAD, lon };
}

/** The sun at time [ms] seen from [lat],[lon]: altitude above the horizon and azimuth, in degrees. */
export function sunPosition(ms, lat, lon) {
  const lw = RAD * -lon;
  const phi = RAD * lat;
  const d = toDays(ms);
  const c = sunCoords(d);
  const H = siderealTime(d, lw) - c.ra;
  return { altitude: altitude(H, phi, c.dec) / RAD, azimuth: (azimuth(H, phi, c.dec) / RAD + 180) % 360 };
}

const J0 = 0.0009;
const julianCycle = (d, lw) => Math.round(d - J0 - lw / (2 * Math.PI));
const approxTransit = (Ht, lw, n) => J0 + (Ht + lw) / (2 * Math.PI) + n;
const solarTransitJ = (ds, M, L) => J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
const hourAngle = (h, phi, d) => Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d)));
const observerAngle = (height) => -2.076 * Math.sqrt(height) / 60;

/** Altitudes (degrees) that name the day's sun times: [angle, morning name, evening name]. */
const TIMES = [
  [-0.833, 'sunrise', 'sunset'],
  [-6, 'dawn', 'dusk'],
  [-12, 'nauticalDawn', 'nauticalDusk'],
  [-18, 'astroDawn', 'astroDusk'],
  [6, 'goldenEnd', 'golden'],
];

/**
 * The sun times (ms, or null when it doesn't happen: polar day or night)
 * for the day around [ms] at [lat],[lon], plus solar noon, its altitude,
 * and whether the sun stays up or down all day.
 */
export function sunTimes(ms, lat, lon, height = 0) {
  const lw = RAD * -lon;
  const phi = RAD * lat;
  const dh = observerAngle(height);
  const d = toDays(ms);
  const n = julianCycle(d, lw);
  const ds = approxTransit(0, lw, n);
  const M = solarMeanAnomaly(ds);
  const L = eclipticLongitude(M);
  const dec = declination(L, 0);
  const Jnoon = solarTransitJ(ds, M, L);
  const result = { solarNoon: fromJulian(Jnoon), nadir: fromJulian(Jnoon - 0.5) };
  for (const [angle, rise, set] of TIMES) {
    const h0 = (angle + (angle === -0.833 ? dh : 0)) * RAD;
    const w = hourAngle(h0, phi, dec);
    if (Number.isNaN(w)) { result[rise] = null; result[set] = null; continue; }
    const a = approxTransit(w, lw, n);
    const Jset = solarTransitJ(a, M, L);
    const Jrise = Jnoon - (Jset - Jnoon);
    result[rise] = fromJulian(Jrise);
    result[set] = fromJulian(Jset);
  }
  const noonAlt = sunPosition(result.solarNoon, lat, lon).altitude;
  result.noonAltitude = noonAlt;
  result.polarDay = result.sunrise == null && noonAlt > 0;
  result.polarNight = result.sunrise == null && noonAlt <= 0;
  return result;
}

/** The light outside for a sun altitude: night, astronomical/nautical/civil twilight, golden hour or day. */
export function skyPhase(alt) {
  if (alt < -18) return 'night';
  if (alt < -12) return 'astro';
  if (alt < -6) return 'nautical';
  if (alt < -0.833) return 'civil';
  if (alt < 6) return 'golden';
  return 'day';
}

/** Day length in seconds (24 h in polar day, 0 in polar night). */
export function dayLength(t) {
  if (t.polarDay) return 86400;
  if (t.polarNight) return 0;
  return (t.sunset - t.sunrise) / 1000;
}
