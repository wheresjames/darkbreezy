// The US National Weather Service beyond warnings: the gridpoint lookup
// for a place (kept for a month: it doesn't change), the nearest station's
// latest reading, and the forecaster's discussion.
// https://www.weather.gov/documentation/services-web-api

import { getJSON } from './http.js';
import { readJSON, writeJSON, PREFIX } from '../core/store.js';
import { coordKey } from '../util/place.js';

const API = 'https://api.weather.gov';
const MONTH = 30 * 864e5;
const GEO = { Accept: 'application/geo+json' };

/** { gridId, stations (URL), station (id, filled later) } for place [p], cached. */
export async function points(p, { signal } = {}) {
  const key = `${PREFIX}nws:${coordKey(p)}`;
  const cached = readJSON(key);
  if (cached && Date.now() - cached.at < MONTH) return cached;
  const raw = await getJSON(`${API}/points/${p.lat},${p.lon}`, { signal, headers: GEO });
  const pr = raw.properties || {};
  const value = { at: Date.now(), gridId: pr.gridId, stations: pr.observationStations, station: null, stationName: '' };
  writeJSON(key, value);
  return value;
}

function remember(p, patch) {
  const key = `${PREFIX}nws:${coordKey(p)}`;
  writeJSON(key, { ...readJSON(key), ...patch });
}

const val = (q) => (q && q.value != null ? q.value : null);

/** An NWS observation as a station reading (util: api/obs.js). */
export function normalizeObs(raw, distanceM = null) {
  const o = raw?.properties;
  if (!o || val(o.temperature) == null) return null;
  const pressure = val(o.seaLevelPressure) ?? val(o.barometricPressure);
  return {
    source: 'US National Weather Service',
    station: o.stationName || o.stationId || '',
    distanceKm: distanceM == null ? null : distanceM / 1000,
    t: Date.parse(o.timestamp),
    temp: val(o.temperature),
    humidity: val(o.relativeHumidity),
    dew: val(o.dewpoint),
    wind: val(o.windSpeed),
    windDir: val(o.windDirection),
    gust: val(o.windGust),
    pressure: pressure == null ? null : pressure / 100,
    visibility: val(o.visibility),
    text: o.textDescription || '',
  };
}

export async function observation(p, { signal } = {}) {
  const pt = await points(p, { signal });
  let { station, stationDistance } = pt;
  if (!station) {
    const list = await getJSON(`${pt.stations}?limit=1`, { signal, headers: GEO });
    const f = list.features?.[0];
    if (!f) return null;
    station = f.properties.stationIdentifier;
    stationDistance = f.properties.distance?.value ?? null;
    remember(p, { station, stationDistance });
  }
  // The latest reading often lacks a temperature (quality control): take
  // the newest of the last few that has one.
  const recent = await getJSON(`${API}/stations/${station}/observations?limit=6`, { signal, headers: GEO });
  return latestObs(recent, stationDistance);
}

/** The newest observation in a collection that has a temperature, as a reading. */
export function latestObs(collection, distanceM = null) {
  for (const f of collection?.features || []) {
    const r = normalizeObs(f, distanceM);
    if (r) return r;
  }
  return null;
}

/** The discussion's text without the transmission header (the lines before "Area Forecast Discussion"). */
export function cleanDiscussion(text) {
  const t = String(text || '').replace(/\r/g, '');
  const at = t.indexOf('Area Forecast Discussion');
  return (at >= 0 ? t.slice(at) : t).replace(/\n\$\$[\s\S]*$/, '').trim();
}

/** The latest Area Forecast Discussion for the place's office: { issued, office, text }. */
export async function discussion(p, { signal } = {}) {
  const pt = await points(p, { signal });
  if (!pt.gridId) return null;
  const list = await getJSON(`${API}/products/types/AFD/locations/${pt.gridId}`, { signal });
  const latest = list['@graph']?.[0];
  if (!latest) return null;
  const product = await getJSON(latest['@id'], { signal });
  return { issued: Date.parse(product.issuanceTime), office: pt.gridId, text: cleanDiscussion(product.productText) };
}
