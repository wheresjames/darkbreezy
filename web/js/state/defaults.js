// The settings' defaults and choices, plain data: state/settings.js and
// util/params.js (settings from the address) both read them, and neither
// can import the other.

export const WIDGETS = [
  ['warnings', 'Warnings'],
  ['hourly', 'Hourly'],
  ['daily', 'Daily'],
  ['nowcast', 'Next hours'],
  ['precip', 'Precipitation'],
  ['wind', 'Wind'],
  ['sun', 'Sun & moon'],
  ['uv', 'UV index'],
  ['aqi', 'Air quality'],
  ['pollen', 'Pollen'],
  ['humidity', 'Humidity'],
  ['pressure', 'Pressure'],
  ['visibility', 'Visibility'],
  ['clouds', 'Cloud cover'],
  ['feels', 'Feels like'],
  ['station', 'Station reading'],
  ['discussion', 'Forecaster\'s discussion'],
  ['marine', 'Sea'],
  ['aurora', 'Aurora'],
  ['radar', 'Radar'],
];

export const DEFAULTS = {
  theme: 'auto',            // auto | light | dark | contrast
  units: 'auto',            // auto | metric | imperial | uk | custom
  custom: { temp: 'c', wind: 'kmh', pressure: 'hpa', precip: 'mm', distance: 'km', height: 'm' },
  clock: 'auto',            // auto | 12 | 24
  aqi: 'auto',              // auto | us | eu
  maxWidth: 'none',         // none | a width in px ('1180', '1440', ...): the page's widest
  layout: 'auto',           // auto | scroll | fit: the card grid that scrolls, or big tiles fitted to the window (views/wall.js)
  showMap: true,            // the world map beside the current conditions
  mapLabels: { show: true, city: true, temp: true, hilo: true, time: false },   // what the map's labels show
  rotate: false,            // show each favorite in turn
  dwell: 30,                // seconds per place when rotating
  radarAutoplay: true,      // loop the radar's last 2 hours by itself
  wallpaper: false,         // only from the address (?wallpaper=1, views/wallpaper.js); never stored as true
  dim: 40,                  // how much wallpaper mode darkens the screen, 0–90 % (the built address's default)
  order: WIDGETS.map(([id]) => id),
  hidden: [],
};

/** Rotate dwell time choices, in seconds. */
export const DWELLS = [10, 20, 30, 60, 120, 300];

/** Page width choices: 'none' or the widest in px. */
export const PAGE_WIDTHS = [['none'], ['1920'], ['1440'], ['1180']];
