// The dashboard's regional extras: the aurora forecast (NOAA SWPC, for
// high latitudes) and the latest radar frame (RainViewer) for the radar
// preview card.

import { getJSON } from './http.js';

export const AURORA_URL = 'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json';
/** Aurora is worth showing from this far towards a pole (geographic, a rough stand-in for magnetic). */
export const AURORA_LATITUDE = 50;

/**
 * Chance of seeing aurora from [p]: the highest probability on the grid
 * within ~5° poleward and 10° of longitude (aurora is seen low on the
 * horizon, so the oval nearby counts, not only overhead). 0–100.
 */
export function auroraChance(raw, p) {
  const pole = Math.sign(p.lat) || 1;
  let best = 0;
  for (const [lon360, lat, v] of raw?.coordinates || []) {
    const lon = lon360 > 180 ? lon360 - 360 : lon360;
    const dLat = (lat - p.lat) * pole;
    let dLon = Math.abs(lon - p.lon);
    if (dLon > 180) dLon = 360 - dLon;
    if (dLat >= -1 && dLat <= 5 && dLon <= 10 && v > best) best = v;
  }
  return { chance: best, forecastTime: Date.parse(raw?.['Forecast Time'] || '') || null };
}

export async function fetchAurora(p, { signal } = {}) {
  if (Math.abs(p.lat) < AURORA_LATITUDE) return null;
  return auroraChance(await getJSON(AURORA_URL, { signal, timeout: 20000 }), p);
}

export const RADAR_URL = 'https://api.rainviewer.com/public/weather-maps.json';

/**
 * The radar frames RainViewer has: the last 2 hours, every 10 minutes,
 * oldest first: { host, frames: [{ time (ms), path }] }. Plain data, so
 * it can be cached.
 */
export function radarFrames(raw) {
  const past = raw?.radar?.past || [];
  if (!past.length || !raw.host) return null;
  return { host: raw.host, frames: past.map((f) => ({ time: f.time * 1000, path: f.path })) };
}

/** Frames from cached radar data, including the one-frame shape saved by earlier versions. */
export function framesOf(data) {
  if (!data) return [];
  if (Array.isArray(data.frames)) return data.frames.map((f) => ({ ...f, host: data.host }));
  return data.path ? [{ time: data.time, path: data.path, host: data.host }] : [];
}

/** A radar tile of [frame] ({ host, path }): 256 px, color scheme 2 (universal blue), smoothed, with snow. */
export const radarTile = (frame, z, x, y) => `${frame.host}${frame.path}/256/${z}/${x}/${y}/2/1_1.png`;

/** NASA GIBS base map tiles for the radar card: land and water, then borders and coastlines. */
export const baseTile = (z, x, y) => `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/OSM_Land_Water_Map/default/default/GoogleMapsCompatible_Level9/${z}/${y}/${x}.png`;
export const linesTile = (z, x, y) => `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/Reference_Features_15m/default/default/GoogleMapsCompatible_Level13/${z}/${y}/${x}.png`;

export async function fetchRadar({ signal } = {}) {
  return radarFrames(await getJSON(RADAR_URL, { signal }));
}

/** The tile (x, y) at zoom [z] holding [lat],[lon], and where in it the point is (0–1). */
export function tileFor(lat, lon, z) {
  const n = 2 ** z;
  const x = ((lon + 180) / 360) * n;
  const r = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  return { x: Math.floor(x), y: Math.floor(y), fx: x - Math.floor(x), fy: y - Math.floor(y) };
}

/** RainViewer makes a frame every 10 minutes, on the 10-minute mark, and publishes it about a minute later. */
export const RADAR_STEP = 10 * 60e3;
export const RADAR_LAG = 90e3;

/**
 * When to ask RainViewer for frames again (ms): when the frame after the
 * newest we have should be out. If we've asked since then and it wasn't,
 * a minute after that ask (every 5 minutes once it's more than 10 minutes
 * late). [data]: what we have; [fetchedAt]: when we got it.
 */
export function nextRadarCheck(data, fetchedAt) {
  const frames = framesOf(data);
  if (!frames.length || !fetchedAt) return 0;
  const due = frames.at(-1).time + RADAR_STEP + RADAR_LAG;
  if (fetchedAt < due) return due;
  return fetchedAt + (fetchedAt - due > RADAR_STEP ? 5 * 60e3 : 60e3);
}
