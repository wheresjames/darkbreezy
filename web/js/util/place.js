// Places: { id, name, admin1, country, cc, lat, lon }. Coordinates are
// rounded to 2 decimals (about 1 km) everywhere they're stored or sent:
// better cache hits, and a little privacy (DARKBREEZY.md §6).

export const round2 = (x) => Math.round(Number(x) * 100) / 100;

/** "52.52,13.41": the key a place's cached data is stored under. */
export const coordKey = (p) => `${round2(p.lat).toFixed(2)},${round2(p.lon).toFixed(2)}`;

/** A place with its coordinates rounded and an id made from them. */
export function makePlace({ name, admin1 = '', country = '', cc = '', lat, lon }) {
  const p = { name: String(name || '').trim() || coordName(lat, lon), admin1, country, cc: String(cc || '').toUpperCase(), lat: round2(lat), lon: round2(lon) };
  return { id: coordKey(p), ...p };
}

/** "52.52°N 13.41°E" for a place without a name. */
export function coordName(lat, lon) {
  const la = round2(lat);
  const lo = round2(lon);
  return `${Math.abs(la).toFixed(2)}°${la >= 0 ? 'N' : 'S'} ${Math.abs(lo).toFixed(2)}°${lo >= 0 ? 'E' : 'W'}`;
}

/** Valid coordinates? */
export const validCoords = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

/** "40.71, -74.01" typed into the search box, or null. */
export function parseCoords(text) {
  const m = String(text).trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  return validCoords(lat, lon) ? { lat, lon } : null;
}

/** "New-York" for addresses. */
export const slug = (name) => String(name || '').normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

/** The place's address in the app: #/place/40.71,-74.01/New-York?n=..&a=..&c=..&cc=.. */
export function placeHash(p) {
  const q = new URLSearchParams();
  q.set('n', p.name);
  if (p.admin1) q.set('a', p.admin1);
  if (p.country) q.set('c', p.country);
  if (p.cc) q.set('cc', p.cc);
  return `#/place/${coordKey(p)}/${slug(p.name) || 'here'}?${q}`;
}

/** The place an address names (route params and query), or null. */
export function placeFromRoute(params, query) {
  const [lat, lon] = String(params.coords || '').split(',').map(Number);
  if (!validCoords(lat, lon)) return null;
  const name = query.get('n') || (params.slug ? params.slug.replace(/-/g, ' ') : '');
  return makePlace({ name, admin1: query.get('a') || '', country: query.get('c') || '', cc: query.get('cc') || '', lat, lon });
}

/** "Berlin, Germany" / "Springfield, Illinois, United States" */
export function placeLabel(p, { full = false } = {}) {
  const parts = [p.name];
  if (full && p.admin1 && p.admin1 !== p.name) parts.push(p.admin1);
  if (p.country && p.country !== p.name) parts.push(p.country);
  return parts.join(', ');
}

/** The flag emoji for a country code. */
export function flag(cc) {
  if (!/^[A-Z]{2}$/i.test(cc || '')) return '';
  return String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** Great-circle distance in km. */
export function distanceKm(a, b) {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
