// Times are shown in the place's own time zone (the IANA name Open-Meteo
// sends), with the user's 12/24-hour choice. Formatters are costly to
// make, so they're kept per zone and pattern.

const cache = new Map();
function formatter(tz, opts) {
  const key = `${tz}|${JSON.stringify(opts)}`;
  let f = cache.get(key);
  if (!f) {
    try { f = new Intl.DateTimeFormat(undefined, { timeZone: tz, ...opts }); } catch { f = new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', ...opts }); }
    cache.set(key, f);
  }
  return f;
}

/** Whether to show 24-hour times: the setting, or what the browser's language does. */
export function is24h(clock = 'auto') {
  if (clock === '24') return true;
  if (clock === '12') return false;
  return !formatter('UTC', { hour: 'numeric' }).resolvedOptions().hour12;
}

/** "3:45 pm" / "15:45" */
export function fmtTime(ms, tz, clock) {
  if (ms == null) return '–';
  const h24 = is24h(clock);
  return formatter(tz, { hour: h24 ? '2-digit' : 'numeric', minute: '2-digit', hourCycle: h24 ? 'h23' : 'h12' }).format(ms);
}

/** Hour labels for the hourly strip: "3 pm" / "15". */
export function fmtHour(ms, tz, clock) {
  const h24 = is24h(clock);
  if (h24) return formatter(tz, { hour: '2-digit', hourCycle: 'h23' }).format(ms);
  return formatter(tz, { hour: 'numeric', hourCycle: 'h12' }).format(ms).replace(/\s?([AP])\.?M\.?/i, (_, x) => `${x.toLowerCase()}m`);
}

/** "Wed" */
export const fmtWeekday = (ms, tz) => formatter(tz, { weekday: 'short' }).format(ms);
/** "Wednesday, 28 October" */
export const fmtLongDate = (ms, tz) => formatter(tz, { weekday: 'long', day: 'numeric', month: 'long' }).format(ms);
/** "28 Oct" */
export const fmtShortDate = (ms, tz) => formatter(tz, { day: 'numeric', month: 'short' }).format(ms);
/** "28 Oct, 15:45" */
export const fmtDateTime = (ms, tz, clock) => `${fmtShortDate(ms, tz)}, ${fmtTime(ms, tz, clock)}`;

/** The calendar date at [ms] in [tz], as "YYYY-MM-DD". */
export function dateKey(ms, tz) {
  const parts = Object.fromEntries(formatter(tz, { year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(ms).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** The hour (0–23) at [ms] in [tz]. */
export function hourIn(ms, tz) {
  return Number(formatter(tz, { hour: '2-digit', hourCycle: 'h23' }).format(ms));
}

/** "just now", "4 min ago", "2 h ago", "3 days ago". */
export function ago(ms, now = Date.now()) {
  const s = Math.max(0, (now - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

/** "in 20 min", "in 1 h 15 min" */
export function inMinutes(min) {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `in ${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `in ${h} h ${r} min` : `in ${h} h`;
}

/** A length of time in seconds: "10 h 42 min". */
export function fmtDuration(sec) {
  const m = Math.round(Math.abs(sec) / 60);
  const h = Math.floor(m / 60);
  return h ? `${h} h ${m % 60} min` : `${m} min`;
}
