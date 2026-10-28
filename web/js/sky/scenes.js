// The static sky behind the dashboard (DARKBREEZY.md §2): what it looks
// like follows the sun's altitude at the place (night, the twilights,
// golden hour, day) and the weather there (clear, partly cloudy, overcast,
// fog, rain, snow, storm). Pure data, no DOM: sky/sky.js applies it.
//
// A scene: { phase, mood, top, mid, bottom (gradient colors), clouds
// (0–1 opacity of the cloud layer), stars (0–1), precip ('', 'rain',
// 'snow'), light ('dark'|'light': which text color reads best on it) }.

import { skyPhase } from '../util/sun.js';
import { wmo } from '../util/wmo-codes.js';

/** Clear-sky colors per phase: [top, middle, horizon]. */
const PHASES = {
  night: ['#060a18', '#0b1430', '#16224a'],
  astro: ['#070c1f', '#111c42', '#24305e'],
  nautical: ['#0d1638', '#24336a', '#4a4f86'],
  civil: ['#1d2b5e', '#5a5a96', '#e08a6a'],
  golden: ['#3f6db0', '#8fa6d0', '#f2b27a'],
  day: ['#2f6fc4', '#5d97d8', '#a9cdef'],
};

/** How each kind of weather changes the sky: grey (0–1 toward grey), dim (0–1 darker), clouds, precip. */
const MOODS = {
  clear: { grey: 0, dim: 0, clouds: 0, precip: '' },
  partly: { grey: 0.15, dim: 0.05, clouds: 0.45, precip: '' },
  overcast: { grey: 0.65, dim: 0.2, clouds: 0.85, precip: '' },
  fog: { grey: 0.9, dim: 0, clouds: 0.6, precip: '' },
  rain: { grey: 0.7, dim: 0.35, clouds: 0.9, precip: 'rain' },
  snow: { grey: 0.75, dim: 0.1, clouds: 0.8, precip: 'snow' },
  storm: { grey: 0.75, dim: 0.55, clouds: 1, precip: 'rain' },
};

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const toHex = (rgb) => `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;

/** [color] moved [g] of the way to its own grey, then darkened by [d]. */
export function weather(color, g, d) {
  const rgb = hex(color);
  const lum = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  return toHex(rgb.map((v) => (v + (lum - v) * g) * (1 - d)));
}

/** Relative luminance (WCAG) of a hex color, 0–1. */
export function luminance(color) {
  const [r, g, b] = hex(color).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The mood for WMO [code] with [cloud] cover (%): partly cloudy codes say little, so cover refines them. */
export function moodFor(code, cloud) {
  const scene = wmo(code).scene;
  if (scene === 'clear' && cloud != null && cloud >= 40) return 'partly';
  if (scene === 'partly' && cloud != null && cloud >= 85) return 'overcast';
  return scene;
}

/** The scene for sun altitude [alt] (degrees) and the weather. */
export function scene(alt, code, cloud) {
  const phase = skyPhase(alt);
  const mood = moodFor(code, cloud);
  const m = MOODS[mood] || MOODS.clear;
  const [top, mid, bottom] = PHASES[phase].map((c) => weather(c, m.grey, m.dim));
  const dark = phase === 'night' || phase === 'astro' || phase === 'nautical';
  return {
    phase,
    mood,
    top,
    mid,
    bottom,
    clouds: m.clouds,
    stars: dark ? Math.max(0, 1 - m.clouds * 1.4) : 0,
    precip: m.precip,
    // Cards are frosted glass either way; this picks the tone of text written
    // straight on the sky (the hero). The middle of the gradient suits most of
    // it; where the top is darker (fog), the hero's scrim makes up the rest.
    light: luminance(mid) > 0.18 ? 'light' : 'dark',
  };
}
