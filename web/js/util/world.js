// The world map's geometry (widgets/map.js): the projection, fitting it in
// a box, the night side of the day/night line, and where marker labels go
// without overlapping. Pure functions, unit tested.
//
// Map units: equirectangular, x = lon + 180 (0–360), y = 90 − lat, shown
// from 84°N to 58°S (the land data stops there: scripts/make-world-map.mjs).

import { subsolar } from './sun.js';

export const VIEW = { x: 0, y: 6, w: 360, h: 142 };
export const VIEWBOX = `${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`;

export const project = (lat, lon) => ({ x: lon + 180, y: 90 - lat });

/** How the map sits in a [w]×[h] px box, centered ("meet"): px = ox + x·scale. */
export function fit(w, h) {
  const scale = Math.min(w / VIEW.w, h / VIEW.h);
  return { scale, ox: (w - VIEW.w * scale) / 2 - VIEW.x * scale, oy: (h - VIEW.h * scale) / 2 - VIEW.y * scale };
}

/** The latitudes a marker can show at: the map's edges, less a degree, so its dot stays on the map. */
export const LAT_MAX = 90 - VIEW.y - 1;
export const LAT_MIN = 90 - VIEW.y - VIEW.h + 1;

/** Pixel position of [lat],[lon] in a box fitted by [f]; beyond the map's top or bottom, at its edge. */
export function toPx(f, lat, lon) {
  const { x, y } = project(Math.max(LAT_MIN, Math.min(LAT_MAX, lat)), lon);
  return { x: f.ox + x * f.scale, y: f.oy + y * f.scale };
}

/**
 * The night side at [ms] as path data in map units: the day/night line
 * (where the sun is on the horizon), closed toward the pole that's dark.
 */
export function nightPath(ms) {
  const s = subsolar(ms);
  const rad = Math.PI / 180;
  // At the equinoxes the line is nearly a meridian; keep the math finite.
  const dec = Math.abs(s.lat) < 0.1 ? 0.1 * (Math.sign(s.lat) || 1) : s.lat;
  const pts = [];
  for (let lon = -180; lon <= 180; lon += 2) {
    const lat = Math.atan(-Math.cos((lon - s.lon) * rad) / Math.tan(dec * rad)) / rad;
    const p = project(lat, lon);
    pts.push(`${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
  }
  // Northern summer: the far north is lit all day, so night is south of the line.
  const edge = dec > 0 ? 180 : 0;
  return `M0 ${edge}L${pts.join('L')}L360 ${edge}Z`;
}

const CHAR = 7;        // px per character of label text (12 px font), close enough for placing
const LINE = 15;       // px per line of label text
const PAD = 4;

/** The text a label would take: [lines] of text → its size in px. */
export const labelSize = (lines) => ({ w: Math.max(...lines.map((l) => l.length)) * CHAR + PAD * 2, h: lines.length * LINE + PAD });

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Where each marker's label goes in a [w]×[h] px box, so none overlap each
 * other, a dot, or the edges. [markers]: [{ id, x, y, variants: [lines[], ...] }]
 * in priority order, each variant shorter than the one before (full,
 * shorter, ...). Returns id → { lines, x, y, side } or nothing for a dot
 * with no room for any label.
 */
export function placeLabels(markers, w, h, { dot = 7 } = {}) {
  const taken = markers.map((m) => ({ x: m.x - dot, y: m.y - dot, w: dot * 2, h: dot * 2 }));
  const out = {};
  for (const m of markers) {
    let done = false;
    for (const lines of m.variants) {
      const size = labelSize(lines);
      const spots = [
        { side: 'right', x: m.x + dot + 2, y: m.y - size.h / 2 },
        { side: 'left', x: m.x - dot - 2 - size.w, y: m.y - size.h / 2 },
        { side: 'below', x: m.x - size.w / 2, y: m.y + dot + 2 },
        { side: 'above', x: m.x - size.w / 2, y: m.y - dot - 2 - size.h },
      ];
      for (const s of spots) {
        const box = { x: s.x, y: s.y, w: size.w, h: size.h };
        if (box.x < 0 || box.y < 0 || box.x + box.w > w || box.y + box.h > h) continue;
        if (taken.some((t) => overlaps(t, box))) continue;
        taken.push(box);
        out[m.id] = { lines, x: box.x, y: box.y, side: s.side };
        done = true;
        break;
      }
      if (done) break;
    }
  }
  return out;
}
