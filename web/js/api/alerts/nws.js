// United States (and its territories): every NWS warning, watch and
// advisory in effect at a point. https://www.weather.gov/documentation/services-web-api

import { getJSON } from '../http.js';
import { alert } from './model.js';

export const id = 'nws';
export const issuer = 'US National Weather Service';
export const countries = ['US', 'PR', 'VI', 'GU', 'AS', 'MP', 'UM'];

export const alertsUrl = (p) => `https://api.weather.gov/alerts/active?point=${p.lat},${p.lon}`;

export function normalize(raw, p) {
  return (raw?.features || []).map((f) => {
    const a = f.properties || {};
    return alert({
      id: a.id || f.id,
      source: id,
      issuer: a.senderName ? `${issuer} (${a.senderName.replace(/^NWS\s+/, '')})` : issuer,
      event: a.event,
      severity: a.severity,
      headline: a.headline || a.event,
      description: a.description,
      instruction: a.instruction,
      area: a.areaDesc,
      onset: a.onset || a.effective,
      expires: a.ends || a.expires,
      url: `https://forecast.weather.gov/MapClick.php?lat=${p.lat}&lon=${p.lon}`,
      lang: 'en',
    });
  });
}

export async function fetchAlerts(p, { signal } = {}) {
  return normalize(await getJSON(alertsUrl(p), { signal, headers: { Accept: 'application/geo+json' } }), p);
}
