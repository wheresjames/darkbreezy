// Station readings: what was actually measured nearby, shown next to the
// model's numbers. Only where an open source exists: the US (NWS), Canada
// (ECCC SWOB) and Germany (DWD through Bright Sky). Elsewhere, null.
//
// A reading: { source, station, distanceKm, t, temp, humidity, dew, wind,
// windDir, gust, pressure, visibility, text }, metric, wind in km/h.

import { getJSON } from './http.js';
import { observation as nwsObservation } from './nws.js';
import { distanceKm } from '../util/place.js';

const OLD = 3 * 36e5;   // readings older than this aren't shown

/** Bright Sky's current_weather as a reading. */
export function normalizeBrightSky(raw) {
  const w = raw?.weather;
  const s = raw?.sources?.find((x) => x.id === w?.source_id) || raw?.sources?.[0];
  if (!w || w.temperature == null) return null;
  return {
    source: 'Deutscher Wetterdienst',
    station: s?.station_name || '',
    distanceKm: s?.distance != null ? s.distance / 1000 : null,
    t: Date.parse(w.timestamp),
    temp: w.temperature,
    humidity: w.relative_humidity ?? null,
    dew: w.dew_point ?? null,
    wind: w.wind_speed_10 ?? null,
    windDir: w.wind_direction_10 ?? null,
    gust: w.wind_gust_speed_10 ?? null,
    pressure: w.pressure_msl ?? null,
    visibility: w.visibility ?? null,
    text: w.condition && w.condition !== 'dry' ? w.condition[0].toUpperCase() + w.condition.slice(1) : '',
  };
}

const SWOB_PROPS = 'stn_nam-value,obs_date_tm,air_temp,rel_hum,avg_wnd_spd_10m_pst10mts,avg_wnd_dir_10m_pst10mts,max_wnd_gst_spd_10m_pst10mts,mslp,vis';
export const swobUrl = (p, now = Date.now()) => {
  const since = new Date(now - 90 * 60e3).toISOString().slice(0, 19);
  return `https://api.weather.gc.ca/collections/swob-realtime/items?f=json&limit=100&bbox=${p.lon - 0.3},${p.lat - 0.25},${p.lon + 0.3},${p.lat + 0.25}&datetime=${since}Z/..&sortby=-obs_date_tm&properties=${SWOB_PROPS}`;
};

/**
 * ECCC's SWOB records (newest first, many stations, many minutes) as one
 * reading: the nearest station with a temperature, each value its latest.
 */
export function normalizeSwob(raw, p) {
  const byStation = new Map();
  for (const f of raw?.features || []) {
    const name = f.properties['stn_nam-value'];
    if (!byStation.has(name)) byStation.set(name, { name, coords: f.geometry?.coordinates, records: [] });
    byStation.get(name).records.push(f.properties);
  }
  const stations = [...byStation.values()]
    .filter((s) => s.coords && s.records.some((r) => r.air_temp != null))
    .map((s) => ({ ...s, km: distanceKm(p, { lat: s.coords[1], lon: s.coords[0] }) }))
    .sort((a, b) => a.km - b.km);
  const s = stations[0];
  if (!s) return null;
  const latest = (k) => s.records.find((r) => r[k] != null)?.[k] ?? null;
  const first = s.records.find((r) => r.air_temp != null);
  return {
    source: 'Environment and Climate Change Canada',
    station: s.name.replace(/\b([A-Z])([A-Z]+)\b/g, (_, a, b) => a + b.toLowerCase()),
    distanceKm: s.km,
    t: Date.parse(first.obs_date_tm),
    temp: first.air_temp,
    humidity: latest('rel_hum'),
    dew: null,
    wind: latest('avg_wnd_spd_10m_pst10mts'),
    windDir: latest('avg_wnd_dir_10m_pst10mts'),
    gust: latest('max_wnd_gst_spd_10m_pst10mts'),
    pressure: latest('mslp'),
    visibility: latest('vis') == null ? null : latest('vis') * 1000,
    text: '',
  };
}

const SOURCES = {
  US: (p, o) => nwsObservation(p, o),
  PR: (p, o) => nwsObservation(p, o),
  CA: async (p, o) => normalizeSwob(await getJSON(swobUrl(p), o), p),
  DE: async (p, o) => normalizeBrightSky(await getJSON(`https://api.brightsky.dev/current_weather?lat=${p.lat}&lon=${p.lon}`, o)),
};

/** Whether readings exist for country [cc]. */
export const hasObservations = (cc) => !!SOURCES[cc];

/** The latest nearby reading, or null (none here, or too old). */
export async function fetchObservation(p, { signal } = {}) {
  const get = SOURCES[p.cc];
  if (!get) return null;
  const r = await get(p, { signal });
  return r && Date.now() - r.t < OLD ? r : null;
}
