// Official warnings, from any source, in one shape (CAP-like), so the
// dashboard can merge, sort and show them the same way (DARKBREEZY.md §4).
// Dark Breezy never makes warnings of its own: every one carries the
// agency that issued it.

/**
 * @typedef {{
 *   id: string,
 *   source: string,          adapter id: 'nws', 'eccc', 'dwd', 'jma', 'hko', 'gdacs'
 *   issuer: string,          the agency, as shown: "US National Weather Service"
 *   event: string,           "Tornado Warning", "Flood"
 *   kind: 'warning'|'watch'|'advisory'|'statement'|'disaster',
 *   severity: 'extreme'|'severe'|'moderate'|'minor'|'unknown',
 *   headline: string,
 *   description: string,
 *   instruction: string,
 *   area: string,
 *   onset: number|null,      ms
 *   expires: number|null,    ms
 *   url: string,             the issuer's own page for it
 *   lang: string,            language of the text
 * }} Alert
 */

export const SEVERITIES = ['extreme', 'severe', 'moderate', 'minor', 'unknown'];
const RANK = Object.fromEntries(SEVERITIES.map((s, i) => [s, i]));

/** CAP's severity words, any case, to ours. */
export function capSeverity(s) {
  const v = String(s || '').toLowerCase();
  return SEVERITIES.includes(v) ? v : 'unknown';
}

/** Kind from an event name: "Tornado Watch" → watch. */
export function kindFromEvent(event) {
  const e = String(event || '').toLowerCase();
  if (/warning|warnung/.test(e)) return 'warning';
  if (/watch/.test(e)) return 'watch';
  if (/advisory/.test(e)) return 'advisory';
  return 'statement';
}

const ms = (t) => {
  if (t == null || t === '') return null;
  const v = typeof t === 'number' ? t : Date.parse(t);
  return Number.isFinite(v) ? v : null;
};

/** An Alert with every field present. */
export function alert(a) {
  return {
    id: String(a.id),
    source: a.source,
    issuer: a.issuer || '',
    event: a.event || 'Warning',
    kind: a.kind || kindFromEvent(a.event),
    severity: capSeverity(a.severity),
    headline: a.headline || '',
    description: String(a.description || '').trim(),
    instruction: String(a.instruction || '').trim(),
    area: a.area || '',
    onset: ms(a.onset),
    expires: ms(a.expires),
    url: a.url || '',
    lang: a.lang || 'en',
  };
}

/** Still in effect at [now]? (No expiry means until the issuer cancels it.) */
export const active = (a, now = Date.now()) => a.expires == null || a.expires > now;

/**
 * Merge lists from several sources: drop expired ones and duplicates (the
 * same event from the same issuer over several areas), most severe first,
 * then soonest.
 */
export function merge(lists, now = Date.now()) {
  const seen = new Map();
  for (const a of lists.flat()) {
    if (!active(a, now)) continue;
    const key = `${a.source}|${a.event}|${a.headline}`;
    const prev = seen.get(key);
    if (!prev || RANK[a.severity] < RANK[prev.severity]) seen.set(key, a);
  }
  return [...seen.values()].sort((a, b) => RANK[a.severity] - RANK[b.severity] || (a.onset ?? 0) - (b.onset ?? 0));
}
