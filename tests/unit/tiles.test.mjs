// The radar tile loader (web/js/api/tiles.js), against a fake RainViewer and
// a fake clock: it must stay within the rate limit, put the important tiles
// first, wait out a 429 instead of losing the tile, and fetch a tile once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTileLoader } from '../../web/js/api/tiles.js';

function world({ limit = Infinity } = {}) {
  let t = 0;
  const timers = [];
  const asked = [];
  let served = 0;
  const loader = (opts) => createTileLoader({
    now: () => t,
    setTimer: (fn, ms) => timers.push({ at: t + ms, fn }),
    toUrl: (blob) => `blob:${blob}`,
    revoke: () => {},
    fetch: async (url) => {
      asked.push({ url, at: t });
      if (served >= limit) return { status: 429, ok: false };
      served++;
      return { status: 200, ok: true, blob: async () => url };
    },
    ...opts,
  });
  const flush = () => new Promise((r) => setTimeout(r, 0));
  /** Move the clock on by [ms], running timers as they come due. */
  async function advance(ms) {
    const end = t + ms;
    for (;;) {
      await flush();
      timers.sort((a, b) => a.at - b.at);
      if (!timers.length || timers[0].at > end) break;
      const next = timers.shift();
      t = next.at;
      next.fn();
    }
    t = end;
    await flush();
  }
  return { loader, asked, advance, flush, setLimit: (n) => { limit = n; }, reset: () => { served = 0; } };
}

test('a burst, then a steady rate', async () => {
  const w = world();
  const load = w.loader({ burst: 10, rate: 5, atOnce: 100 });
  const got = [];
  for (let i = 0; i < 30; i++) load(`t${i}`).then((u) => got.push(u));
  await w.flush();
  assert.equal(w.asked.length, 10, 'the burst at once');
  await w.advance(1000);
  assert.equal(w.asked.length, 15, 'then 5 a second');
  await w.advance(3000);
  assert.equal(w.asked.length, 30);
  assert.equal(got.length, 30);
});

test('the most wanted first', async () => {
  const w = world();
  const load = w.loader({ burst: 1, rate: 1, atOnce: 1 });
  load('first');
  load('old', { priority: 500 });
  load('newest-edge', { priority: 3 });
  load('newest-middle', { priority: 0 });
  await w.advance(5000);
  assert.deepEqual(w.asked.map((a) => a.url), ['first', 'newest-middle', 'newest-edge', 'old']);
});

test('a 429 pauses everything for a minute, and the tile is retried, not lost', async () => {
  const w = world({ limit: 3 });
  const load = w.loader({ burst: 100, rate: 100, atOnce: 1, pause: 60e3 });
  const got = [];
  for (let i = 0; i < 6; i++) load(`t${i}`).then((u) => got.push(u));
  await w.advance(1000);
  assert.equal(got.length, 3);
  assert.equal(w.asked.length, 4, 'stopped asking after the 429');
  w.reset();
  w.setLimit(Infinity);
  await w.advance(30e3);
  assert.equal(w.asked.length, 4, 'still waiting');
  await w.advance(31e3);
  assert.equal(got.length, 6, 'all six in the end');
  assert.deepEqual(got.sort(), ['blob:t0', 'blob:t1', 'blob:t2', 'blob:t3', 'blob:t4', 'blob:t5']);
});

test('a tile wanted twice is fetched once; later asks are answered from memory', async () => {
  const w = world();
  const load = w.loader();
  const [a, b] = await Promise.all([load('x'), load('x')]);
  assert.equal(a, b);
  assert.equal(await load('x'), a);
  assert.equal(w.asked.length, 1);
});

test('cancelling one request leaves the tile loading for anyone else waiting; nobody waiting drops it', async () => {
  const w = world();
  const load = w.loader({ burst: 1, rate: 1, atOnce: 1 });
  load('busy');
  const one = new AbortController();
  const p1 = load('shared', { signal: one.signal });
  const p2 = load('shared');
  const only = new AbortController();
  const p3 = load('dropped', { signal: only.signal });
  one.abort();
  only.abort();
  await assert.rejects(p1, { name: 'AbortError' });
  await assert.rejects(p3, { name: 'AbortError' });
  await w.advance(5000);
  assert.equal(await p2, 'blob:shared');
  assert.ok(!w.asked.some((a) => a.url === 'dropped'), 'nobody wanted it: never fetched');
});

test('a rate that doesn\'t divide evenly still moves on (no wait of a fraction of a millisecond, round and round)', async () => {
  const w = world();
  const load = w.loader({ burst: 1, rate: 3, atOnce: 1 });   // a token every 333.33… ms
  const got = [];
  for (let i = 0; i < 10; i++) load(`t${i}`).then((u) => got.push(u));
  await w.advance(4000);
  assert.equal(got.length, 10);
  const gaps = w.asked.slice(1).map((a, i) => a.at - w.asked[i].at);
  assert.ok(gaps.every((g) => g >= 20), `gaps ${gaps}`);
});

test('after a pause, one request tests the water before the rest follow', async () => {
  const w = world({ limit: 0 });
  const load = w.loader({ burst: 100, rate: 100, atOnce: 6, pause: 60e3 });
  for (let i = 0; i < 20; i++) load(`t${i}`);
  await w.advance(1000);
  const first = w.asked.length;
  assert.ok(first <= 6, 'one round of refusals at most');
  await w.advance(60e3);
  assert.equal(w.asked.length, first + 1, 'when the pause ends: one probe, refused again');
  w.setLimit(Infinity);
  await w.advance(61e3);
  assert.equal(w.asked.length, first + 1 + 20, 'the probe gets through, then everything follows');
});
