// Canada: Environment and Climate Change Canada's public alerts, from the
// MSC GeoMet OGC API, by a tiny box around the point.
// https://api.weather.gc.ca/collections/weather-alerts

import { getJSON } from '../http.js';
import { alert } from './model.js';

export const id = 'eccc';
export const issuer = 'Environment and Climate Change Canada';
export const countries = ['CA'];

const D = 0.01;
export const alertsUrl = (p) => `https://api.weather.gc.ca/collections/weather-alerts/items?f=json&limit=50&bbox=${p.lon - D},${p.lat - D},${p.lon + D},${p.lat + D}`;

const COLOUR = { red: 'extreme', orange: 'severe', yellow: 'moderate' };
const TYPE = { warning: 'severe', watch: 'moderate', advisory: 'minor', statement: 'minor' };

export function normalize(raw) {
  return (raw?.features || [])
    .filter((f) => f.properties?.status_en !== 'ended')
    .map((f) => {
      const a = f.properties;
      const kind = ['warning', 'watch', 'advisory', 'statement'].includes(a.alert_type) ? a.alert_type : 'statement';
      const name = String(a.alert_name_en || '');
      return alert({
        id: `${a.alert_code}-${a.feature_id}-${a.publication_datetime}`,
        source: id,
        issuer,
        event: name.charAt(0).toUpperCase() + name.slice(1),
        kind,
        severity: COLOUR[a.risk_colour_en] || TYPE[kind],
        headline: `${name.charAt(0).toUpperCase() + name.slice(1)}${a.feature_name_en ? ` for ${a.feature_name_en}` : ''}`,
        description: [a.alert_text_en, a.impact_en && `Impact: ${a.impact_en}`, a.confidence_en && `Confidence: ${a.confidence_en}`].filter(Boolean).join('\n\n'),
        area: a.feature_name_en,
        onset: a.validity_datetime,
        expires: a.event_end_datetime || a.expiration_datetime,
        url: 'https://weather.gc.ca/warnings/index_e.html',
        lang: 'en',
      });
    });
}

export async function fetchAlerts(p, { signal } = {}) {
  return normalize(await getJSON(alertsUrl(p), { signal }));
}
