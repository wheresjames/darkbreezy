// Open-Meteo: every forecast number on the dashboard (DARKBREEZY.md §3.1).
// Two requests per place (forecast, air quality), and a third for marine
// data at places that turned out to have sea nearby. Everything is asked
// for in metric and unix time; util/units.js and util/time.js convert for
// display. The normalizers turn Open-Meteo's column arrays into rows.

import { getJSON, url } from './http.js';

const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const AIR = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const MARINE = 'https://marine-api.open-meteo.com/v1/marine';

const CURRENT = ['temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'is_day', 'precipitation',
  'snowfall', 'weather_code', 'cloud_cover', 'pressure_msl', 'wind_speed_10m', 'wind_direction_10m',
  'wind_gusts_10m', 'visibility', 'dew_point_2m', 'uv_index'];
const HOURLY = ['temperature_2m', 'apparent_temperature', 'relative_humidity_2m', 'dew_point_2m',
  'precipitation_probability', 'precipitation', 'snowfall', 'weather_code', 'cloud_cover', 'pressure_msl',
  'visibility', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'uv_index', 'is_day'];
const DAILY = ['weather_code', 'temperature_2m_max', 'temperature_2m_min', 'sunrise', 'sunset',
  'daylight_duration', 'uv_index_max', 'precipitation_sum', 'snowfall_sum', 'precipitation_probability_max',
  'wind_speed_10m_max', 'wind_gusts_10m_max', 'wind_direction_10m_dominant'];
const MINUTELY = ['precipitation', 'weather_code'];
export const POLLEN = ['alder', 'birch', 'grass', 'mugwort', 'olive', 'ragweed'];
const AIR_CURRENT = ['us_aqi', 'european_aqi', 'pm2_5', 'pm10', 'ozone', 'nitrogen_dioxide', 'sulphur_dioxide',
  'carbon_monoxide', ...POLLEN.map((p) => `${p}_pollen`)];
const MARINE_CURRENT = ['wave_height', 'wave_direction', 'wave_period', 'swell_wave_height', 'sea_surface_temperature'];

const common = (p) => ({ latitude: p.lat, longitude: p.lon, timezone: 'auto', timeformat: 'unixtime' });

export const forecastUrl = (p) => url(FORECAST, {
  ...common(p),
  current: CURRENT, hourly: HOURLY, daily: DAILY, minutely_15: MINUTELY,
  forecast_days: 10, past_hours: 25, forecast_hours: 72, past_minutely_15: 1, forecast_minutely_15: 12,
});
export const airUrl = (p) => url(AIR, { ...common(p), current: AIR_CURRENT });
export const marineUrl = (p) => url(MARINE, { ...common(p), current: MARINE_CURRENT });

/** Columns { time: [...], a: [...], b: [...] } to rows [{ t, a, b }], times in ms. */
function rows(cols, rename) {
  if (!cols?.time) return [];
  return cols.time.map((time, i) => {
    const row = { t: time * 1000 };
    for (const [from, to] of Object.entries(rename)) row[to] = cols[from]?.[i] ?? null;
    return row;
  });
}

const H = {
  temperature_2m: 'temp', apparent_temperature: 'feels', relative_humidity_2m: 'humidity', dew_point_2m: 'dew',
  precipitation_probability: 'pop', precipitation: 'precip', snowfall: 'snow', weather_code: 'code',
  cloud_cover: 'cloud', pressure_msl: 'pressure', visibility: 'visibility', wind_speed_10m: 'wind',
  wind_direction_10m: 'windDir', wind_gusts_10m: 'gust', uv_index: 'uv', is_day: 'isDay',
};
const D = {
  weather_code: 'code', temperature_2m_max: 'max', temperature_2m_min: 'min', sunrise: 'sunrise', sunset: 'sunset',
  daylight_duration: 'daylight', uv_index_max: 'uvMax', precipitation_sum: 'precip', snowfall_sum: 'snow',
  precipitation_probability_max: 'pop', wind_speed_10m_max: 'windMax', wind_gusts_10m_max: 'gustMax',
  wind_direction_10m_dominant: 'windDir',
};

/**
 * The forecast response as the app's Weather object. [now] (ms) splits the
 * hourly rows into the past (for "vs yesterday") and the rest.
 */
export function normalizeForecast(raw, now = Date.now()) {
  const c = raw.current || {};
  const current = { t: (c.time || 0) * 1000 };
  for (const [from, to] of Object.entries({ ...H, precipitation: 'precip', snowfall: 'snow' })) current[to] = c[from] ?? null;
  current.isDay = c.is_day === 1;
  const hourly = rows(raw.hourly, H).map((r) => ({ ...r, isDay: r.isDay === 1 }));
  const daily = rows(raw.daily, D).map((r) => ({ ...r, sunrise: r.sunrise ? r.sunrise * 1000 : null, sunset: r.sunset ? r.sunset * 1000 : null }));
  const minutely = rows(raw.minutely_15, { precipitation: 'precip', weather_code: 'code' });
  return {
    tz: raw.timezone || 'UTC',
    utcOffset: raw.utc_offset_seconds || 0,
    elevation: raw.elevation ?? null,
    current,
    // Missing everywhere means the model has no 15-minute data here.
    minutely: minutely.some((m) => m.precip != null) ? minutely : [],
    hourly,
    daily,
    fetchedAt: now,
  };
}

/** Air quality, or null when nothing came back. Pollen is null outside Europe. */
export function normalizeAir(raw) {
  const c = raw?.current;
  if (!c) return null;
  const pollen = {};
  for (const p of POLLEN) if (c[`${p}_pollen`] != null) pollen[p] = c[`${p}_pollen`];
  return {
    t: (c.time || 0) * 1000,
    usAqi: c.us_aqi ?? null,
    euAqi: c.european_aqi ?? null,
    pm25: c.pm2_5 ?? null,
    pm10: c.pm10 ?? null,
    o3: c.ozone ?? null,
    no2: c.nitrogen_dioxide ?? null,
    so2: c.sulphur_dioxide ?? null,
    co: c.carbon_monoxide ?? null,
    pollen: Object.keys(pollen).length ? pollen : null,
  };
}

/** Sea conditions, or null for a place with no sea data (inland). */
export function normalizeMarine(raw) {
  const c = raw?.current;
  if (!c || c.wave_height == null) return null;
  return {
    waveHeight: c.wave_height,
    waveDir: c.wave_direction ?? null,
    wavePeriod: c.wave_period ?? null,
    swell: c.swell_wave_height ?? null,
    sst: c.sea_surface_temperature ?? null,
  };
}

export async function loadForecast(place, { signal } = {}) {
  return normalizeForecast(await getJSON(forecastUrl(place), { signal }));
}
export async function loadAir(place, { signal } = {}) {
  return normalizeAir(await getJSON(airUrl(place), { signal }));
}
export async function loadMarine(place, { signal } = {}) {
  return normalizeMarine(await getJSON(marineUrl(place), { signal }));
}

/**
 * Current temperature and today's high/low for several places in one
 * request (Open-Meteo takes comma-separated coordinates): for the map's
 * favorites.
 */
export const snapshotUrl = (places) => url(FORECAST, {
  latitude: places.map((p) => p.lat), longitude: places.map((p) => p.lon),
  timezone: 'auto', timeformat: 'unixtime', forecast_days: 1,
  current: ['temperature_2m', 'weather_code', 'is_day'], daily: ['temperature_2m_max', 'temperature_2m_min'],
});

/** One snapshot per place, in order: { temp, code, isDay, tz, max, min }. A single place comes back as an object, not a list. */
export function normalizeSnapshots(raw) {
  return (Array.isArray(raw) ? raw : [raw]).map((r) => ({
    temp: r?.current?.temperature_2m ?? null,
    code: r?.current?.weather_code ?? null,
    isDay: r?.current?.is_day === 1,
    tz: r?.timezone || null,
    max: r?.daily?.temperature_2m_max?.[0] ?? null,
    min: r?.daily?.temperature_2m_min?.[0] ?? null,
  }));
}

export async function loadSnapshots(places, { signal } = {}) {
  if (!places.length) return [];
  return normalizeSnapshots(await getJSON(snapshotUrl(places), { signal }));
}
