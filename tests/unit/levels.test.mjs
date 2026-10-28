// Fitting the small cards into the room left (web/js/widgets/masonry.js chooseLevels):
// compact from the end of the user's order, then dropped from the end.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseLevels, packedHeight } from '../../web/js/widgets/masonry.js';

const cards = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, span: 1, full: 190, compact: 54 }));
const opts = { row: 2, gap: 10 };

test('packed height', () => {
  assert.equal(packedHeight([{ height: 100 }, { height: 100 }, { height: 100 }], 3, opts), 100);
  assert.equal(packedHeight([{ height: 100 }, { height: 100 }, { height: 100 }], 2, opts), 210);
  assert.equal(packedHeight([], 2, opts), 0);
});

test('room for everything: all full', () => {
  const r = chooseLevels(cards, 3, 400, opts);
  assert.deepEqual(Object.values(r.level), ['full', 'full', 'full', 'full', 'full', 'full']);
  assert.deepEqual(r.dropped, []);
  assert.ok(r.fits);
});

test('less room: the ones at the end of the order go compact first', () => {
  const r = chooseLevels(cards, 3, 260, opts);
  assert.deepEqual(r.level, { a: 'full', b: 'full', c: 'full', d: 'compact', e: 'compact', f: 'compact' });
  assert.ok(r.fits);
});

test('even less: all compact, then dropped from the end, with room for "+N more"', () => {
  const r = chooseLevels(cards, 2, 120, { ...opts, more: 54 });
  assert.ok(Object.values(r.level).every((l) => l === 'compact'));
  assert.deepEqual(r.dropped, ['d', 'e', 'f']);
  assert.ok(r.fits);
  assert.deepEqual(chooseLevels(cards, 2, 120, opts).dropped, ['e', 'f'], 'no "+N more" cell (wallpaper): one more fits');
});

test('next to no room: everything dropped; less than none: and it says it doesn\'t fit', () => {
  const r = chooseLevels(cards, 2, 10, opts);
  assert.equal(r.dropped.length, 6);
  assert.equal(r.fits, true);
  assert.equal(chooseLevels(cards, 2, -5, opts).fits, false);
});
