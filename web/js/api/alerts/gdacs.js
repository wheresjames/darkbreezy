// Everywhere: GDACS (the UN and European Commission's Global Disaster
// Alert and Coordination System) orange and red alerts for tropical
// cyclones, floods, droughts, volcanoes and wildfires near the place or in
// its country. Coarse, but the only global baseline (DARKBREEZY.md §3.1).
// Earthquakes are left out: they're over before anyone reads a warning.

import { getJSON } from '../http.js';
import { alert } from './model.js';
import { distanceKm } from '../../util/place.js';

export const id = 'gdacs';
export const issuer = 'GDACS (UN / European Commission)';

const DAY = 864e5;
export const eventsUrl = (now = Date.now()) => `https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC;FL;DR;VO;WF&alertlevel=Orange;Red&fromdate=${new Date(now - 21 * DAY).toISOString().slice(0, 10)}`;

const NAMES = { TC: 'Tropical cyclone', FL: 'Flood', DR: 'Drought', VO: 'Volcanic eruption', WF: 'Wildfire' };
/** How far from the event's point it can matter, in km; countrywide events also match on country. */
const REACH = { TC: 1200, FL: 300, DR: 0, VO: 150, WF: 150 };
const COUNTRYWIDE = new Set(['TC', 'FL', 'DR']);

/** Does event [f] concern place [p]? */
export function concerns(f, p) {
  const e = f.properties;
  if (COUNTRYWIDE.has(e.eventtype) && p.cc && (e.affectedcountries || []).some((c) => c.iso2 === p.cc)) return true;
  const [lon, lat] = f.geometry?.coordinates || [];
  return Number.isFinite(lat) && REACH[e.eventtype] > 0 && distanceKm(p, { lat, lon }) <= REACH[e.eventtype];
}

export function normalize(raw, p, now = Date.now()) {
  return (raw?.features || [])
    .filter((f) => f.properties?.iscurrent === 'true' && concerns(f, p))
    .map((f) => {
      const e = f.properties;
      const to = Date.parse(e.todate);
      return alert({
        id: `gdacs-${e.eventtype}-${e.eventid}-${e.episodeid}`,
        source: id,
        issuer,
        event: `${NAMES[e.eventtype] || 'Disaster'}${e.eventtype === 'TC' && e.eventname ? ` ${e.eventname.replace(/-\d+$/, '')}` : ''}`,
        kind: 'disaster',
        severity: e.alertlevel === 'Red' ? 'severe' : 'moderate',
        headline: `${e.alertlevel} alert: ${e.name || NAMES[e.eventtype]}${e.country ? ` (${e.country})` : ''}`,
        description: [e.htmldescription || e.description, e.severitydata?.severitytext].filter(Boolean).join('\n\n'),
        area: (e.affectedcountries || []).map((c) => c.countryname).join(', ') || e.country,
        onset: `${e.fromdate}Z`,
        // GDACS's end date is the last update for events still going.
        expires: Number.isFinite(to) && to + 3 * DAY > now ? null : now - 1,
        url: e.url?.report || 'https://www.gdacs.org/',
        lang: 'en',
      });
    });
}

export async function fetchAlerts(p, { signal } = {}) {
  return normalize(await getJSON(eventsUrl(), { signal }), p);
}
