// RainViewer's radar tiles, loaded within its rate limit. Its tile server
// allows 500 requests a minute per IP address, with bursts of 300, and
// answers 429 with "retry-after: 60" beyond that (checked 2026-10-28). The
// radar loop wants 13 frames × 9 tiles (117), or × 25 in the large-screen
// layout (325), and rotation through favorites asks for more each turn: all
// at once, nearly half came back 429 and the loop showed holes.
//
// So every radar tile goes through one queue: a token bucket (a burst, then
// a steady rate well under the limit), a few requests at a time, the most
// wanted first (the newest frame, the middle tiles). A 429 pauses the whole
// queue for a minute (every tile counts against the same limit) and puts
// the tile back; when the minute's up, a single request tests the water
// before the rest follow. Tiles come back as blob: URLs, shared and kept for reuse
// (the most recent few hundred); the browser's HTTP cache keeps them two days.

const BURST = 120;          // tokens to start with, and at most
const RATE = 5;             // tokens added a second (300 a minute: room for another tab)
const AT_ONCE = 6;          // requests in flight
const PAUSE = 60e3;         // after a 429 (RainViewer's retry-after)
const KEEP = 800;           // blob URLs kept for reuse

export class RateLimited extends Error {
  constructor() { super('Rate limited'); this.kind = 'rate'; }
}

/**
 * A tile loader. Injectable [fetch], [now] and timers, so the unit tests
 * can drive it; the app uses the one made below.
 * @returns {(url: string, opts?: { signal?: AbortSignal, priority?: number }) => Promise<string>}
 */
export function createTileLoader({
  fetch: get = (...a) => fetch(...a),
  // A steady clock, not the wall clock: rates and pauses mustn't jump when the system time does.
  now = () => performance.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  toUrl = (blob) => URL.createObjectURL(blob),
  revoke = (u) => URL.revokeObjectURL(u),
  burst = BURST, rate = RATE, atOnce = AT_ONCE, pause = PAUSE, keep = KEEP,
} = {}) {
  let tokens = burst;
  let refilled = now();
  let pausedUntil = 0;
  let active = 0;
  let probing = false;               // after a pause: one request at a time until one gets through
  let timer = null;
  const queue = [];                  // jobs waiting: { url, priority, waiters }
  const jobs = new Map();            // url → its job, queued or in flight (a tile wanted twice is fetched once)
  const done = new Map();            // url → blob URL, least recently used first

  const refill = () => {
    const t = now();
    tokens = Math.min(burst, tokens + ((t - refilled) / 1000) * rate);
    refilled = t;
  };
  // At least 20 ms: a wait of a fraction of a millisecond fires "now", finds
  // no new token yet, and would set another for "now", round and round.
  const wake = (ms) => {
    if (timer) return;
    timer = setTimer(() => { timer = null; pump(); }, Math.max(20, Math.ceil(ms)));
  };
  const finish = (job, how, value) => {
    jobs.delete(job.url);
    for (const w of job.waiters) w[how](value);
    job.waiters.clear();
  };

  function pump() {
    refill();
    while (active < (probing ? 1 : atOnce)) {
      // Nobody wants these any more (the card went away): drop them.
      for (let i = queue.length - 1; i >= 0; i--) if (!queue[i].waiters.size) jobs.delete(queue.splice(i, 1)[0].url);
      if (!queue.length) return;
      if (now() < pausedUntil) { wake(pausedUntil - now()); return; }
      if (tokens < 1) { wake(((1 - tokens) / rate) * 1000); return; }
      queue.sort((a, b) => a.priority - b.priority);
      const job = queue.shift();
      tokens -= 1;
      active += 1;
      run(job).finally(() => { active -= 1; pump(); });
    }
  }

  async function run(job) {
    try {
      const res = await get(job.url);
      if (res.status === 429) {
        // Everyone waits: the limit is per address, not per tile.
        pausedUntil = now() + pause;
        probing = true;
        queue.push(job);
        return;
      }
      probing = false;
      if (!res.ok) { finish(job, 'reject', Object.assign(new Error(`HTTP ${res.status}`), { status: res.status })); return; }
      const url = toUrl(await res.blob());
      done.set(job.url, url);
      while (done.size > keep) {
        const [k, v] = done.entries().next().value;
        done.delete(k);
        revoke(v);   // images already showing it keep their pixels
      }
      finish(job, 'resolve', url);
    } catch (e) {
      finish(job, 'reject', e);
    }
  }

  function loadTile(url, { signal, priority = 0 } = {}) {
    const have = done.get(url);
    if (have) {
      done.delete(url);
      done.set(url, have);   // most recently used last
      return Promise.resolve(have);
    }
    return new Promise((resolve, reject) => {
      if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
      let job = jobs.get(url);
      if (!job) {
        job = { url, priority, waiters: new Set() };
        jobs.set(url, job);
        queue.push(job);
      }
      job.priority = Math.min(job.priority, priority);
      const waiter = { resolve, reject };
      job.waiters.add(waiter);
      signal?.addEventListener('abort', () => {
        // Only this request goes; the tile still loads for anyone else waiting.
        if (job.waiters.delete(waiter)) reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
      pump();
    });
  }
  /** The queue's state, for diagnostics (?debug) and the tests. */
  loadTile.stats = () => ({ queued: queue.length, inFlight: active, tokens: Math.floor(tokens), pausedFor: Math.max(0, pausedUntil - now()), kept: done.size });
  return loadTile;
}

/** The app's loader for RainViewer tiles. */
export const loadRadarTile = createTileLoader();
