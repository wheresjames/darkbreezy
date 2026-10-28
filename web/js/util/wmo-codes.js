// WMO weather codes (what Open-Meteo's weather_code means): a label, the
// icon from assets/weather.svg for day and night, the sky scene
// (sky/scenes.js) and the kind of precipitation.

/** @typedef {{ label: string, icon: string, night: string, scene: string, precip: ''|'drizzle'|'rain'|'snow'|'sleet'|'hail' }} Code */

const C = (label, icon, night, scene, precip = '') => ({ label, icon, night, scene, precip });

/** @type {Record<number, Code>} */
const CODES = {
  0: C('Clear', 'clear-day', 'clear-night', 'clear'),
  1: C('Mostly clear', 'clear-day', 'clear-night', 'clear'),
  2: C('Partly cloudy', 'partly-day', 'partly-night', 'partly'),
  3: C('Overcast', 'cloudy', 'cloudy', 'overcast'),
  45: C('Fog', 'fog', 'fog', 'fog'),
  48: C('Freezing fog', 'fog', 'fog', 'fog'),
  51: C('Light drizzle', 'drizzle', 'drizzle', 'rain', 'drizzle'),
  53: C('Drizzle', 'drizzle', 'drizzle', 'rain', 'drizzle'),
  55: C('Heavy drizzle', 'drizzle', 'drizzle', 'rain', 'drizzle'),
  56: C('Freezing drizzle', 'sleet', 'sleet', 'rain', 'sleet'),
  57: C('Heavy freezing drizzle', 'sleet', 'sleet', 'rain', 'sleet'),
  61: C('Light rain', 'rain', 'rain', 'rain', 'rain'),
  63: C('Rain', 'rain', 'rain', 'rain', 'rain'),
  65: C('Heavy rain', 'heavy-rain', 'heavy-rain', 'rain', 'rain'),
  66: C('Freezing rain', 'sleet', 'sleet', 'rain', 'sleet'),
  67: C('Heavy freezing rain', 'sleet', 'sleet', 'rain', 'sleet'),
  71: C('Light snow', 'snow', 'snow', 'snow', 'snow'),
  73: C('Snow', 'snow', 'snow', 'snow', 'snow'),
  75: C('Heavy snow', 'snow', 'snow', 'snow', 'snow'),
  77: C('Snow grains', 'snow', 'snow', 'snow', 'snow'),
  80: C('Light showers', 'showers-day', 'showers-night', 'rain', 'rain'),
  81: C('Showers', 'showers-day', 'showers-night', 'rain', 'rain'),
  82: C('Heavy showers', 'heavy-rain', 'heavy-rain', 'rain', 'rain'),
  85: C('Snow showers', 'snow', 'snow', 'snow', 'snow'),
  86: C('Heavy snow showers', 'snow', 'snow', 'snow', 'snow'),
  95: C('Thunderstorm', 'thunder', 'thunder', 'storm', 'rain'),
  96: C('Thunderstorm with hail', 'thunder', 'thunder', 'storm', 'hail'),
  99: C('Severe thunderstorm with hail', 'thunder', 'thunder', 'storm', 'hail'),
};

const UNKNOWN = C('Unknown', 'cloudy', 'cloudy', 'overcast');

/** @returns {Code} */
export function wmo(code) {
  return CODES[code] ?? UNKNOWN;
}

/** The icon name for [code], day or night. */
export function wmoIcon(code, isDay = true) {
  const c = wmo(code);
  return isDay ? c.icon : c.night;
}

export const wmoCodes = () => Object.keys(CODES).map(Number);
