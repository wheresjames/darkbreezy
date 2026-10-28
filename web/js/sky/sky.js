// Draws the sky scene (sky/scenes.js) behind the page: a gradient in CSS
// custom properties and three still layers (stars, clouds, rain or snow)
// from css/sky.css. Nothing moves: it's redrawn only when the data or the
// time-of-day phase changes (checked once a minute).

import { sunPosition } from '../util/sun.js';
import { scene } from './scenes.js';

let layer = null;
let timer = 0;
let input = null;
let last = '';

function ensureLayer() {
  if (layer) return layer;
  layer = document.createElement('div');
  layer.className = 'sky';
  layer.setAttribute('aria-hidden', 'true');
  for (const part of ['stars', 'clouds', 'precip']) {
    const d = document.createElement('div');
    d.className = `sky-${part}`;
    layer.appendChild(d);
  }
  document.body.prepend(layer);
  return layer;
}

function draw() {
  if (!input) return;
  const { lat, lon, code, cloud } = input;
  const s = scene(sunPosition(Date.now(), lat, lon).altitude, code, cloud);
  const key = JSON.stringify(s);
  if (key === last) return;
  last = key;
  const el = ensureLayer();
  el.style.setProperty('--sky-top', s.top);
  el.style.setProperty('--sky-mid', s.mid);
  el.style.setProperty('--sky-bottom', s.bottom);
  el.style.setProperty('--sky-clouds', String(s.clouds));
  el.style.setProperty('--sky-stars', String(s.stars));
  el.dataset.phase = s.phase;
  el.dataset.mood = s.mood;
  el.dataset.precip = s.precip;
  document.documentElement.dataset.sky = s.light;
  document.documentElement.dataset.skyPhase = s.phase;
}

/** Show the sky for place [lat],[lon] with weather [code] and [cloud] cover. */
export function setSky(next) {
  input = next;
  draw();
  if (!timer) timer = setInterval(draw, 60e3);
}

/** Back to the plain themed background (pages without a place). */
export function clearSky() {
  input = null;
  last = '';
  clearInterval(timer);
  timer = 0;
  layer?.remove();
  layer = null;
  delete document.documentElement.dataset.sky;
  delete document.documentElement.dataset.skyPhase;
}
