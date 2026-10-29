// Every dashboard card by id (state/settings.js WIDGETS has their names
// and default order).

import { warnings } from './warnings.js';
import { nowcast, hourly, daily, precip } from './forecast.js';
import { wind, uv, humidity, pressure, visibility, clouds, feels } from './conditions.js';
import { sun, moon } from './sun.js';
import { aqi, pollen } from './air.js';
import { station, discussion, marine, aurora } from './regional.js';
import { radar } from './radar.js';

export const WIDGET_IMPLS = {
  warnings, nowcast, hourly, daily, precip, wind, sun, moon, uv, aqi, pollen, humidity,
  pressure, visibility, clouds, feels, station, discussion, marine, aurora, radar,
};
