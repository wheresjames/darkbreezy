// Germany: Deutscher Wetterdienst warnings for a point, through Bright Sky
// (a free, open-source DWD wrapper), in English where DWD gives it.
// https://brightsky.dev/docs/#/operations/getAlerts

import { getJSON } from '../http.js';
import { alert } from './model.js';

export const id = 'dwd';
export const issuer = 'Deutscher Wetterdienst';
export const countries = ['DE'];

export const alertsUrl = (p) => `https://api.brightsky.dev/alerts?lat=${p.lat}&lon=${p.lon}`;

export function normalize(raw) {
  const where = raw?.location?.name || '';
  return (raw?.alerts || [])
    .filter((a) => a.status !== 'test')
    .map((a) => {
      const en = !!(a.headline_en || a.description_en);
      const event = (en ? a.event_en : a.event_de) || 'Warning';
      return alert({
        id: a.alert_id || a.id,
        source: id,
        issuer,
        event: event.charAt(0).toUpperCase() + event.slice(1),
        kind: 'warning',
        severity: a.severity,
        headline: en ? a.headline_en : a.headline_de,
        description: en ? a.description_en : a.description_de,
        instruction: en ? a.instruction_en : a.instruction_de,
        area: where,
        onset: a.onset || a.effective,
        expires: a.expires,
        url: 'https://www.dwd.de/DE/wetter/warnungen_gemeinden/warnWetter_node.html',
        lang: en ? 'en' : 'de',
      });
    });
}

export async function fetchAlerts(p, { signal } = {}) {
  return normalize(await getJSON(alertsUrl(p), { signal }));
}
