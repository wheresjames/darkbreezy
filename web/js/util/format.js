// Categories and labels the widgets share: UV, air quality, pollen,
// comfort, pressure trend, visibility. Each `level` is 0 (best) and up,
// for the cards' category colors (css/widgets.css .lvl-N).

/** UV index → WHO category. */
export function uvCategory(uv) {
  if (uv == null) return null;
  if (uv < 3) return { level: 0, label: 'Low' };
  if (uv < 6) return { level: 1, label: 'Moderate' };
  if (uv < 8) return { level: 2, label: 'High' };
  if (uv < 11) return { level: 3, label: 'Very high' };
  return { level: 4, label: 'Extreme' };
}

/** US EPA AQI → category. */
export function usAqiCategory(v) {
  if (v == null) return null;
  if (v <= 50) return { level: 0, label: 'Good' };
  if (v <= 100) return { level: 1, label: 'Moderate' };
  if (v <= 150) return { level: 2, label: 'Unhealthy for sensitive groups' };
  if (v <= 200) return { level: 3, label: 'Unhealthy' };
  if (v <= 300) return { level: 4, label: 'Very unhealthy' };
  return { level: 5, label: 'Hazardous' };
}

/** European AQI → category. */
export function euAqiCategory(v) {
  if (v == null) return null;
  if (v <= 20) return { level: 0, label: 'Good' };
  if (v <= 40) return { level: 1, label: 'Fair' };
  if (v <= 60) return { level: 2, label: 'Moderate' };
  if (v <= 80) return { level: 3, label: 'Poor' };
  if (v <= 100) return { level: 4, label: 'Very poor' };
  return { level: 5, label: 'Extremely poor' };
}

/** The AQI scale to show: the setting, or EU in Europe and US elsewhere. */
export function aqiScale(setting, cc) {
  if (setting === 'us' || setting === 'eu') return setting;
  return EUROPE.has(cc) ? 'eu' : 'us';
}

export const EUROPE = new Set(['AD', 'AL', 'AT', 'BA', 'BE', 'BG', 'BY', 'CH', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI',
  'FO', 'FR', 'GB', 'GI', 'GR', 'HR', 'HU', 'IE', 'IM', 'IS', 'IT', 'JE', 'GG', 'LI', 'LT', 'LU', 'LV', 'MC', 'MD',
  'ME', 'MK', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'RS', 'SE', 'SI', 'SK', 'SM', 'UA', 'VA', 'XK']);

/** The pollutant furthest along its own scale (WHO 24 h guideline multiples). */
export function dominantPollutant(air) {
  const limits = { pm25: [15, 'PM2.5'], pm10: [45, 'PM10'], o3: [100, 'Ozone'], no2: [25, 'NO₂'], so2: [40, 'SO₂'] };
  let best = null;
  for (const [k, [limit, name]] of Object.entries(limits)) {
    if (air[k] == null) continue;
    const r = air[k] / limit;
    if (!best || r > best.ratio) best = { key: k, name, ratio: r };
  }
  return best;
}

/** Pollen (grains/m³) → level, with the thresholds of the European pollen services, by plant group. */
export function pollenLevel(kind, v) {
  if (v == null) return null;
  const trees = ['alder', 'birch', 'olive'];
  const t = trees.includes(kind) ? [10, 50, 500] : [5, 20, 200];
  if (v < 1) return { level: 0, label: 'None' };
  if (v < t[0]) return { level: 1, label: 'Low' };
  if (v < t[1]) return { level: 2, label: 'Moderate' };
  if (v < t[2]) return { level: 3, label: 'High' };
  return { level: 4, label: 'Very high' };
}

/** [pollen] ({ plant: grains/m³ }) as [{ k, v, lvl }], the worst first: by level, then count (each plant has its own scale). */
export function pollenRanked(pollen) {
  return Object.entries(pollen || {}).map(([k, v]) => ({ k, v, lvl: pollenLevel(k, v) }))
    .sort((x, y) => y.lvl.level - x.lvl.level || y.v - x.v);
}

/** How the air feels from the dew point (°C). */
export function comfort(dew) {
  if (dew == null) return '';
  if (dew < 0) return 'Dry';
  if (dew < 10) return 'Fresh';
  if (dew < 13) return 'Comfortable';
  if (dew < 16) return 'Pleasant';
  if (dew < 18) return 'A little humid';
  if (dew < 21) return 'Humid';
  if (dew < 24) return 'Muggy';
  return 'Oppressive';
}

/** Pressure change over 3 hours (hPa) → trend. */
export function pressureTrend(delta) {
  if (delta == null) return { dir: 0, label: '' };
  if (delta >= 1.6) return { dir: 1, label: delta >= 3.6 ? 'Rising fast' : 'Rising' };
  if (delta <= -1.6) return { dir: -1, label: delta <= -3.6 ? 'Falling fast' : 'Falling' };
  return { dir: 0, label: 'Steady' };
}

/** Visibility (m) → description. */
export function visibilityLabel(m) {
  if (m == null) return '';
  if (m < 1000) return 'Fog';
  if (m < 4000) return 'Poor';
  if (m < 10000) return 'Moderate';
  if (m < 20000) return 'Good';
  return 'Excellent';
}

/** Why it feels different from the thermometer. */
export function feelsReason(c) {
  if (c.temp == null || c.feels == null) return '';
  const d = c.feels - c.temp;
  if (Math.abs(d) < 1.5) return 'Similar to the actual temperature.';
  if (d < 0) return c.wind >= 10 ? 'Wind is making it feel colder.' : 'Humidity and air movement make it feel colder.';
  return c.humidity >= 50 ? 'Humidity is making it feel warmer.' : 'Sunshine and still air make it feel warmer.';
}

/** "+3°" with a sign, for differences. */
export const signed = (n) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n)}`;
