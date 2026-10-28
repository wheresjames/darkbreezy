// Finding places: type-ahead search with Open-Meteo's geocoder (GeoNames,
// allowed for autocomplete), street addresses with Photon, and "my
// location" names with Photon's reverse geocoder. Nominatim is the
// reverse fallback only, once per tap, with a Referer (its policy wants
// one; the page's own policy sends none). DARKBREEZY.md §2, §9 #7.

import { getJSON, url } from './http.js';
import { makePlace } from '../util/place.js';

const lang = () => (navigator.language || 'en').slice(0, 2);

export const searchUrl = (q, language = 'en') => url('https://geocoding-api.open-meteo.com/v1/search', { name: q, count: 8, language, format: 'json' });

/** Open-Meteo's results as places, biggest first when names tie. */
export function normalizeSearch(raw) {
  return (raw?.results || []).map((r) => ({
    ...makePlace({ name: r.name, admin1: r.admin1 || '', country: r.country || '', cc: r.country_code || '', lat: r.latitude, lon: r.longitude }),
    population: r.population || 0,
    kind: r.feature_code || '',
  }));
}

/** Photon features as places (street addresses keep their street). */
export function normalizePhoton(raw) {
  return (raw?.features || []).map((f) => {
    const a = f.properties || {};
    const [lon, lat] = f.geometry?.coordinates || [];
    const town = a.city || a.town || a.village || a.district || a.locality;
    const name = a.osm_key === 'place' ? a.name : (a.street ? [a.street, a.housenumber].filter(Boolean).join(' ') + (town ? `, ${town}` : '') : (a.name || town));
    return makePlace({ name: name || town || a.county || a.state, admin1: a.state || '', country: a.country || '', cc: a.countrycode || '', lat, lon });
  }).filter((p) => Number.isFinite(p.lat));
}

export async function searchPlaces(q, { signal } = {}) {
  return normalizeSearch(await getJSON(searchUrl(q, lang()), { signal }));
}

export async function searchAddresses(q, { signal } = {}) {
  return normalizePhoton(await getJSON(url('https://photon.komoot.io/api/', { q, limit: 8, lang: 'en' }), { signal }));
}

/** The town at [lat],[lon] as a place (the name of the settlement, not the street). */
export function normalizeReverse(raw, lat, lon) {
  const a = raw?.features?.[0]?.properties;
  if (!a) return null;
  const name = a.city || a.town || a.village || a.district || a.locality || a.county || a.name;
  return makePlace({ name, admin1: a.state || '', country: a.country || '', cc: a.countrycode || '', lat, lon });
}

export async function reverse(lat, lon, { signal } = {}) {
  try {
    const p = normalizeReverse(await getJSON(url('https://photon.komoot.io/reverse', { lat, lon, lang: 'en', limit: 1 }), { signal }), lat, lon);
    if (p) return p;
  } catch (e) {
    if (signal?.aborted) throw e;
  }
  const n = await getJSON(url('https://nominatim.openstreetmap.org/reverse', { lat, lon, format: 'jsonv2', zoom: 10, 'accept-language': 'en' }),
    { signal, referrerPolicy: 'strict-origin' });
  const a = n?.address || {};
  return makePlace({ name: a.city || a.town || a.village || a.county || n?.name, admin1: a.state || '', country: a.country || '', cc: a.country_code || '', lat, lon });
}
