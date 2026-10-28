// Units: every value arrives metric (°C, km/h, hPa, mm, m) and is
// converted here for display (DARKBREEZY.md §4). The unit for each kind of
// quantity comes from the settings: a system (auto picks one from the
// browser's language), or custom, one unit per quantity.

export const UNITS = {
  temp: { c: 'Celsius (°C)', f: 'Fahrenheit (°F)' },
  wind: { kmh: 'km/h', mph: 'mph', ms: 'm/s', kn: 'knots' },
  pressure: { hpa: 'hPa', inhg: 'inHg', mmhg: 'mmHg', kpa: 'kPa' },
  precip: { mm: 'mm', in: 'inches' },
  distance: { km: 'km', mi: 'miles' },
  height: { m: 'metres', ft: 'feet' },
};

export const SYSTEMS = {
  metric: { temp: 'c', wind: 'kmh', pressure: 'hpa', precip: 'mm', distance: 'km', height: 'm' },
  imperial: { temp: 'f', wind: 'mph', pressure: 'inhg', precip: 'in', distance: 'mi', height: 'ft' },
  uk: { temp: 'c', wind: 'mph', pressure: 'hpa', precip: 'mm', distance: 'mi', height: 'm' },
};

/** The system a browser language suggests: imperial for the US (and Liberia, Myanmar), UK's mix for Britain. */
export function systemFor(locale = 'en') {
  const region = (() => {
    try { return new Intl.Locale(locale).maximize().region; } catch { return ''; }
  })();
  if (['US', 'LR', 'MM'].includes(region)) return 'imperial';
  if (region === 'GB') return 'uk';
  return 'metric';
}

/** The unit for each quantity, from settings { units, custom }. */
export function unitsFor(s, locale) {
  const system = s.units === 'auto' || !s.units ? systemFor(locale) : s.units;
  if (system === 'custom') return { ...SYSTEMS.metric, ...(s.custom || {}) };
  return { ...(SYSTEMS[system] || SYSTEMS.metric) };
}

/** [v], metric, in [unit]. */
export function convert(v, unit) {
  if (v == null || Number.isNaN(v)) return null;
  switch (unit) {
    case 'f': return v * 9 / 5 + 32;
    case 'mph': return v / 1.609344;
    case 'ms': return v / 3.6;
    case 'kn': return v / 1.852;
    case 'inhg': return v / 33.8639;
    case 'mmhg': return v / 1.33322;
    case 'kpa': return v / 10;
    case 'in': return v / 25.4;
    case 'mi': return v / 1.609344;
    case 'ft': return v / 0.3048;
    default: return v;
  }
}

const SUFFIX = { c: '°', f: '°', kmh: ' km/h', mph: ' mph', ms: ' m/s', kn: ' kn', hpa: ' hPa', inhg: ' inHg',
  mmhg: ' mmHg', kpa: ' kPa', mm: ' mm', in: ' in', km: ' km', mi: ' mi', m: ' m', ft: ' ft' };
const DIGITS = { inhg: 2, kpa: 1, in: 2, ms: 1 };

/** The short unit label shown after a number ("km/h", "°"). */
export const suffix = (unit) => SUFFIX[unit] ?? '';

/** Round [v] for display in [unit]: whole numbers, more digits for the coarse units. */
export function round(v, unit, digits = DIGITS[unit] ?? 0) {
  if (v == null) return null;
  const f = 10 ** digits;
  const r = Math.round(v * f) / f;
  return Object.is(r, -0) ? 0 : r;
}

/**
 * [v] (metric) as text in the user's unit for quantity [q]: "12°", "8 km/h".
 * @param {keyof typeof UNITS} q
 * @param {number|null} v
 * @param {Record<string,string>} units from unitsFor()
 * @param {{ bare?: boolean, digits?: number }} [opts] bare: no unit
 */
export function fmt(q, v, units, { bare = false, digits } = {}) {
  const unit = units[q];
  const n = round(convert(v, unit), unit, digits);
  if (n == null) return '–';
  const text = n.toLocaleString(undefined, { minimumFractionDigits: digits ?? DIGITS[unit] ?? 0, maximumFractionDigits: digits ?? DIGITS[unit] ?? 0 });
  return bare ? text : `${text}${suffix(unit)}`;
}

/** Precipitation, with "<0.1" style for traces and none for zero. */
export function fmtPrecip(mm, units) {
  if (mm == null) return '–';
  if (mm === 0) return `0${suffix(units.precip)}`;
  const unit = units.precip;
  const small = unit === 'in' ? 0.01 : 0.1;
  const v = convert(mm, unit);
  if (v < small) return `<${small}${suffix(unit)}`;
  return fmt('precip', mm, units, { digits: unit === 'in' ? 2 : (v < 10 ? 1 : 0) });
}

/** Visibility: kilometres or miles, in metres or feet when close. */
export function fmtDistance(m, units) {
  if (m == null) return '–';
  if (units.distance === 'mi') {
    const mi = m / 1609.344;
    return mi < 1 ? `${Math.round(m / 0.3048 / 10) * 10} ft` : `${round(mi, 'mi', mi < 10 ? 1 : 0)} mi`;
  }
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${round(m / 1000, 'km', m < 10000 ? 1 : 0)} km`;
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
/** Degrees (where the wind comes from) to a compass point: 225 → "SW". */
export function compass(deg) {
  if (deg == null) return '';
  return COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

/** Beaufort force for km/h, and its name. */
export function beaufort(kmh) {
  const limits = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118];
  const names = ['Calm', 'Light air', 'Light breeze', 'Gentle breeze', 'Moderate breeze', 'Fresh breeze',
    'Strong breeze', 'Near gale', 'Gale', 'Strong gale', 'Storm', 'Violent storm', 'Hurricane force'];
  let force = limits.findIndex((l) => kmh < l);
  if (force < 0) force = 12;
  return { force, name: names[force] };
}
