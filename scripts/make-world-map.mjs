#!/usr/bin/env node
// Builds web/data/world-110m-v<N>.json, the world map behind the
// dashboard's map widget (widgets/map.js): Natural Earth's 1:110m land and
// country borders (public domain) as SVG path data, in an equirectangular
// projection where x = lon + 180 (0–360) and y = 90 − lat (0–180),
// rounded to 0.1°. Antarctica is left out: the map stops at 58°S.
//
//   node scripts/make-world-map.mjs [version]
//
// Bump the version (and the file name in widgets/map.js) when it changes.

import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const version = process.argv[2] || '1';
const BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/';
const SOUTH = -58;

async function geo(name) {
  const res = await fetch(`${BASE}${name}.geojson`);
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  return res.json();
}

const r1 = (v) => Math.round(v * 10) / 10;
const pt = ([lon, lat]) => `${r1(lon + 180)} ${r1(90 - lat)}`;

/** A ring or line as path data, dropping points that round to the one before. */
function line(coords, close) {
  const out = [];
  let prev = '';
  for (const c of coords) {
    const p = pt(c);
    if (p !== prev) out.push(p);
    prev = p;
  }
  if (out.length < (close ? 3 : 2)) return '';
  return `M${out.join('L')}${close ? 'Z' : ''}`;
}

const polygons = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);
const lines = (g) => (g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []);

const land = await geo('ne_110m_land');
const borders = await geo('ne_110m_admin_0_boundary_lines_land');

const landPath = land.features.flatMap((f) => polygons(f.geometry))
  .filter((poly) => poly[0].some(([, lat]) => lat > SOUTH))
  .map((poly) => poly.map((ring) => line(ring, true)).join(''))
  .join('');
const borderPath = borders.features.flatMap((f) => lines(f.geometry)).map((l) => line(l, false)).join('');

const out = {
  source: 'Natural Earth 1:110m land and boundary lines (public domain), naturalearthdata.com',
  projection: 'equirectangular: x = lon + 180, y = 90 - lat',
  south: SOUTH,
  land: landPath,
  borders: borderPath,
};
const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'data', `world-110m-v${version}.json`);
await writeFile(file, `${JSON.stringify(out)}\n`);
console.log(`land ${landPath.length} + borders ${borderPath.length} chars → ${file}`);
