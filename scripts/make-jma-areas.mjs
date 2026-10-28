#!/usr/bin/env node
// Builds web/data/jma-areas-v<N>.json from JMA's area list: for every
// municipality (class20) code, the forecast office whose warning file
// covers it and its English name. api/alerts/jma.js reads it to go from a
// place (municipality code from GSI's reverse geocoder) to its warnings.
//
//   node scripts/make-jma-areas.mjs [version]
//
// Bump the version (and the file name in jma.js) when JMA's areas change.

import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const version = process.argv[2] || '1';
const res = await fetch('https://www.jma.go.jp/bosai/common/const/area.json');
if (!res.ok) throw new Error(`area.json: ${res.status}`);
const area = await res.json();

const out = {};
for (const [code, a] of Object.entries(area.class20s)) {
  const c15 = area.class15s[a.parent];
  const c10 = c15 && area.class10s[c15.parent];
  const office = c10?.parent;
  if (!office || !area.offices[office]) continue;
  out[code] = [office, a.enName || a.name];
}
const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'data', `jma-areas-v${version}.json`);
await writeFile(file, `${JSON.stringify(out)}\n`);
console.log(`${Object.keys(out).length} areas → ${file}`);
