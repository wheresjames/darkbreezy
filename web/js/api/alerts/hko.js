// Hong Kong: the Hong Kong Observatory's warning signals in force, with
// their full text. https://data.weather.gov.hk/weatherAPI/doc/HKO_Open_Data_API_Documentation.pdf

import { getJSON } from '../http.js';
import { alert } from './model.js';

export const id = 'hko';
export const issuer = 'Hong Kong Observatory';
export const countries = ['HK'];

const BASE = 'https://data.weather.gov.hk/weatherAPI/opendata/weather.php?lang=en&dataType=';
export const summaryUrl = `${BASE}warnsum`;
export const detailUrl = `${BASE}warningInfo`;

/** Severity by signal code (the summary's `code`). */
const SEVERITY = {
  TC1: 'minor', TC3: 'moderate', TC8NE: 'severe', TC8SE: 'severe', TC8SW: 'severe', TC8NW: 'severe', TC9: 'extreme', TC10: 'extreme',
  WRAINA: 'moderate', WRAINR: 'severe', WRAINB: 'extreme',
  WFIREY: 'minor', WFIRER: 'moderate',
  WTS: 'moderate', WL: 'severe', WFNTSA: 'moderate', WTMW: 'extreme', WMSGNL: 'minor',
  WHOT: 'minor', WCOLD: 'minor', WFROST: 'minor',
};

export function normalize(summary, details) {
  const text = new Map((details?.details || []).map((d) => [d.warningStatementCode, (d.contents || []).join('\n\n')]));
  return Object.entries(summary || {})
    .filter(([, w]) => w && w.actionCode !== 'CANCEL')
    .map(([type, w]) => alert({
      id: `hko-${w.code || type}-${w.issueTime}`,
      source: id,
      issuer,
      event: w.name || type,
      kind: 'warning',
      severity: SEVERITY[w.code] || SEVERITY[type] || 'moderate',
      headline: w.name || type,
      description: text.get(type) || '',
      area: 'Hong Kong',
      onset: w.issueTime,
      expires: w.expireTime || null,
      url: 'https://www.hko.gov.hk/en/wxinfo/dailywx/wxwarntoday.htm',
      lang: 'en',
    }));
}

export async function fetchAlerts(p, { signal } = {}) {
  const summary = await getJSON(summaryUrl, { signal });
  // The full text is only worth a second request when something's in force.
  const details = Object.keys(summary || {}).length ? await getJSON(detailUrl, { signal }).catch(() => null) : null;
  return normalize(summary, details);
}
