// About (#/about): what Dark Breezy is, privacy, where every number comes
// from (with coverage), and the credits the data's licenses ask for
// (DARKBREEZY.md §10).

import { h } from '../core/h.js';
import { t } from '../core/i18n.js';
import { setTitle } from './common.js';

const a = (href, text) => h('a', { href, target: '_blank', rel: 'noopener' }, text);

const SOURCES = [
  ['Forecast, current conditions, UV, air quality, pollen, sea', 'Open-Meteo (CC BY 4.0), with models from ECMWF, NOAA, DWD, Météo-France, JMA and others; air quality and pollen from Copernicus CAMS', 'Worldwide (pollen: Europe only)', 'https://open-meteo.com/'],
  ['Warnings and station readings, United States', 'NOAA National Weather Service', 'US and territories', 'https://www.weather.gov/'],
  ['Warnings and station readings, Canada', 'Environment and Climate Change Canada (MSC GeoMet)', 'Canada', 'https://eccc-msc.github.io/open-data/'],
  ['Warnings and station readings, Germany', 'Deutscher Wetterdienst, through Bright Sky', 'Germany', 'https://brightsky.dev/'],
  ['Warnings, Japan', 'Japan Meteorological Agency; municipality lookup by the Geospatial Information Authority of Japan', 'Japan', 'https://www.jma.go.jp/'],
  ['Warnings, Hong Kong', 'Hong Kong Observatory', 'Hong Kong', 'https://www.hko.gov.hk/'],
  ['Major disasters', 'GDACS (UN OCHA and the European Commission\'s JRC)', 'Worldwide', 'https://www.gdacs.org/'],
  ['Aurora forecast', 'NOAA Space Weather Prediction Center', 'High latitudes', 'https://www.swpc.noaa.gov/'],
  ['Radar', 'RainViewer', 'Where radar exists', 'https://www.rainviewer.com/'],
  ['Radar map', 'NASA GIBS / EOSDIS; OpenStreetMap contributors (ODbL)', 'Worldwide', 'https://earthdata.nasa.gov/gibs'],
  ['World map', 'Natural Earth (public domain)', 'Worldwide', 'https://www.naturalearthdata.com/'],
  ['Place search', 'Open-Meteo geocoding (GeoNames, CC BY 4.0); Photon by Komoot (OpenStreetMap data, ODbL); Nominatim', 'Worldwide', 'https://www.geonames.org/'],
];

export function aboutView() {
  setTitle(t('About'));
  return h('div.sheet.about-page',
    h('h1', t('About Dark Breezy')),
    h('p', t('Dark Breezy is a small, open-source weather dashboard that runs entirely in your browser. It has no server of its own, no accounts, no ads and no tracking.')),
    h('h2', t('Privacy')),
    h('p', t('Your places, settings and saved weather stay in this browser (local storage). To get the weather, your browser asks the services below directly, sending the place\'s coordinates rounded to about 1 km. Your location is only read when you tap "Use my location", and it\'s rounded the same way before it goes anywhere.')),
    h('p', t('Like any website, each of those services, and the host of this site (GitHub Pages), sees your IP address when your browser asks it for something. Dark Breezy itself collects nothing: it has no server, no analytics and no cookies.')),
    h('h2', t('Warnings')),
    h('p', t('Warnings come from official agencies and are shown as they publish them, with the issuer named. Dark Breezy doesn\'t make warnings of its own and sends no notifications. Where no open source exists (most of Europe, among others), only major disasters from GDACS are shown, with a link to the national weather service. Always follow your local authorities.')),
    h('h2', t('Where the data comes from')),
    h('dl.sources', SOURCES.map(([what, who, where, url]) => h('div.source',
      h('dt', t(what)),
      h('dd', a(url, who), h('span.muted', ` · ${t(where)}`))))),
    h('h2', t('Credits')),
    h('ul.small.credits',
      h('li', t('Weather data by Open-Meteo.com, licensed under CC BY 4.0.')),
      h('li', t('Air quality and pollen: generated using Copernicus Atmosphere Monitoring Service information; neither the European Commission nor ECMWF is responsible for any use of it.')),
      h('li', t('Contains information licensed under the Open Government Licence – Canada.')),
      h('li', t('Source: Deutscher Wetterdienst.')),
      h('li', t('Source: Japan Meteorological Agency website. Its area list is edited by Dark Breezy (a municipality-to-office table). Municipality lookup: Geospatial Information Authority of Japan.')),
      h('li', t('Hong Kong warning signals: Hong Kong Observatory.')),
      h('li', t('Radar: RainViewer. Map data © OpenStreetMap contributors. World map: Natural Earth.')),
      h('li', t('Typeface: Inter, by Rasmus Andersson and the Inter Project Authors, under the SIL Open Font License.'))),
    h('p.small.muted', t('Not available, because no free source works in a browser without a key: pollen outside Europe, measured air quality, lightning, and station readings outside the US, Canada and Germany.')),
    h('h2', t('Open source')),
    h('p', t('Dark Breezy is free software under the MIT license. '), a('https://github.com/wheresjames/darkbreezy', t('Source code')), '.'));
}
