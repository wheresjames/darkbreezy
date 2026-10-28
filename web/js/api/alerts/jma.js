// Japan: Japan Meteorological Agency warnings and advisories for the
// place's municipality. Best effort: JMA's bosai JSON is what its own
// website reads, not a documented API (DARKBREEZY.md §9 #2).
//
//   place → municipality code (GSI's reverse geocoder)
//         → forecast office (data/jma-areas-v1.json, scripts/make-jma-areas.mjs)
//         → that office's warning file → this municipality's entries.
//
// Warnings are coded; the English names below are JMA's own translations.

import { getJSON } from '../http.js';
import { alert } from './model.js';

export const id = 'jma';
export const issuer = 'Japan Meteorological Agency';
export const countries = ['JP'];

export const gsiUrl = (p) => `https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${p.lat}&lon=${p.lon}`;
export const warningUrl = (office) => `https://www.jma.go.jp/bosai/warning/data/warning/${office}.json`;
const AREAS = new URL('../../../data/jma-areas-v1.json', import.meta.url).href;

/** code → [English name, severity] */
export const CODES = {
  32: ['Snowstorm Emergency Warning', 'extreme'], 33: ['Heavy Rain Emergency Warning', 'extreme'],
  35: ['Storm Emergency Warning', 'extreme'], 36: ['Heavy Snow Emergency Warning', 'extreme'],
  37: ['High Wave Emergency Warning', 'extreme'], 38: ['Storm Surge Emergency Warning', 'extreme'],
  '02': ['Snowstorm Warning', 'severe'], '03': ['Heavy Rain Warning', 'severe'], '04': ['Flood Warning', 'severe'],
  '05': ['Storm Warning', 'severe'], '06': ['Heavy Snow Warning', 'severe'], '07': ['High Wave Warning', 'severe'],
  '08': ['Storm Surge Warning', 'severe'],
  10: ['Heavy Rain Advisory', 'minor'], 12: ['Heavy Snow Advisory', 'minor'], 13: ['Snowstorm Advisory', 'minor'],
  14: ['Thunderstorm Advisory', 'minor'], 15: ['Strong Wind Advisory', 'minor'], 16: ['High Wave Advisory', 'minor'],
  17: ['Snow Melting Advisory', 'minor'], 18: ['Flood Advisory', 'minor'], 19: ['Storm Surge Advisory', 'minor'],
  20: ['Dense Fog Advisory', 'minor'], 21: ['Dry Air Advisory', 'minor'], 22: ['Avalanche Advisory', 'minor'],
  23: ['Low Temperature Advisory', 'minor'], 24: ['Frost Advisory', 'minor'], 25: ['Ice Accretion Advisory', 'minor'],
  26: ['Snow Accretion Advisory', 'minor'],
};
// 発表 issued, 継続 continuing; 解除 (lifted) and "none" are left out.
const IN_EFFECT = new Set(['発表', '継続']);

// One load, shared by every page that asks: not cancelled with the first one to ask
// (it would fail the others too). Each caller still stops waiting when its own page goes.
let areas = null;
async function areaTable(signal) {
  areas ??= getJSON(AREAS).catch((e) => { areas = null; throw e; });
  if (!signal) return areas;
  return Promise.race([areas, new Promise((_, reject) => {
    const stop = () => reject(Object.assign(new Error('Cancelled'), { kind: 'aborted' }));
    if (signal.aborted) stop(); else signal.addEventListener('abort', stop, { once: true });
  })]);
}

/** The municipality's class20 code from GSI's answer, or null outside Japan. */
export const municipality = (gsi) => (gsi?.results?.muniCd ? `${gsi.results.muniCd}00` : null);

/** The warnings in [file] (an office's warning JSON) for municipality [code], named [name]. */
export function normalize(file, code, name) {
  const entry = (file?.areaTypes || []).flatMap((t) => t.areas || []).find((a) => a.code === code);
  const issued = file?.reportDatetime || null;
  return (entry?.warnings || [])
    .filter((w) => w.code && IN_EFFECT.has(w.status))
    .map((w) => {
      const [event, severity] = CODES[w.code] || [`Warning (code ${w.code})`, 'unknown'];
      return alert({
        id: `jma-${code}-${w.code}-${issued}`,
        source: id,
        issuer,
        event,
        kind: /Advisory/.test(event) ? 'advisory' : 'warning',
        severity,
        headline: `${event} for ${name}`,
        // JMA's summary for the whole office area, in Japanese (§9 #8).
        description: file.headlineText || '',
        area: name,
        onset: issued,
        expires: null,
        url: `https://www.jma.go.jp/bosai/warning/#area_type=class20s&area_code=${code}&lang=en`,
        lang: file.headlineText ? 'ja' : 'en',
      });
    });
}

export async function fetchAlerts(p, { signal } = {}) {
  const [gsi, table] = await Promise.all([getJSON(gsiUrl(p), { signal }), areaTable(signal)]);
  const code = municipality(gsi);
  const hit = code && table[code];
  if (!hit) return [];
  const [office, name] = hit;
  return normalize(await getJSON(warningUrl(office), { signal }), code, name);
}
