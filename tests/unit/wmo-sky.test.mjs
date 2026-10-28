import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { wmo, wmoIcon, wmoCodes } from '../../web/js/util/wmo-codes.js';
import { scene, moodFor, luminance } from '../../web/js/sky/scenes.js';

const sprite = readFileSync(new URL('../../web/assets/icons.svg', import.meta.url), 'utf8');
const symbols = new Set([...sprite.matchAll(/<symbol id="([\w-]+)"/g)].map((m) => m[1]));

test('every weather code has a label and icons that exist in the sprite', () => {
  for (const code of wmoCodes()) {
    const c = wmo(code);
    assert.ok(c.label);
    assert.ok(symbols.has(c.icon), `${code}: ${c.icon}`);
    assert.ok(symbols.has(c.night), `${code}: ${c.night}`);
  }
  assert.equal(wmo(1234).label, 'Unknown');
  assert.equal(wmoIcon(0, false), 'clear-night');
});

test('the interface icons the code uses exist', () => {
  const used = new Set();
  for (const f of walk(fileURLToPath(new URL('../../web/js/', import.meta.url)))) {
    for (const m of readFileSync(f, 'utf8').matchAll(/\bicon\('([\w-]+)'/g)) used.add(m[1]);
  }
  assert.ok(used.size > 5);
  for (const name of used) assert.ok(symbols.has(name), name);
});

function* walk(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) yield* walk(p); else if (p.endsWith('.js')) yield p;
  }
}

test('sky scenes', () => {
  const day = scene(40, 0, 5);
  assert.equal(day.phase, 'day');
  assert.equal(day.mood, 'clear');
  assert.equal(day.stars, 0);
  const night = scene(-30, 0, 0);
  assert.equal(night.light, 'dark');
  assert.ok(night.stars > 0.9);
  const cloudyNight = scene(-30, 3, 100);
  assert.equal(cloudyNight.stars, 0);
  assert.equal(scene(20, 95, 100).precip, 'rain');
  assert.equal(scene(20, 73, 100).precip, 'snow');
  assert.ok(luminance(scene(20, 95, 100).mid) < luminance(day.mid), 'storms are darker');
  assert.equal(moodFor(0, 60), 'partly');
  assert.equal(moodFor(2, 90), 'overcast');
});

// The development cache buster (web/js/cache-bust.js) finds the app's files
// by quoted paths that end at the extension: 'assets/icons.svg#x' would be
// missed (it was, until the sprite got its own constant in core/h.js).
test('no file path in the code hides behind a #fragment the cache buster can\'t see', () => {
  const bad = [];
  for (const f of walk(fileURLToPath(new URL('../../web/js/', import.meta.url)))) {
    for (const m of readFileSync(f, 'utf8').matchAll(/["'`][\w./-]+\.(?:svg|png|json|css|js)#/g)) bad.push(`${f}: ${m[0]}`);
  }
  assert.deepEqual(bad, []);
});
