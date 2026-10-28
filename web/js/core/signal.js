// Tiny reactive primitives: signal, computed, effect, batch.
//
// A signal holds a value; reading .value inside an effect (or computed)
// subscribes it, and setting .value re-runs the subscribers. Effects belong
// to the owner that was current when they were made (see root/onCleanup), so
// a whole view's effects are disposed together when the route changes.

import { reportError } from './errors.js';

/** @typedef {{ run(): void, deps: Set<Set<any>>, disposed: boolean, cleanups: Function[] }} Reaction */

let current = null;          // the reaction reading signals right now
let owner = null;            // where new effects and cleanups are registered
let fallbackOwner = null;    // used when there's no owner: code after an await in a view
let batchDepth = 0;
const pending = new Set();

function track(subs) {
  if (current && !current.disposed) {
    subs.add(current);
    current.deps.add(subs);
  }
}

function notify(subs) {
  for (const r of [...subs]) pending.add(r);
  if (!batchDepth) flush();
}

function flush() {
  while (pending.size) {
    const list = [...pending];
    pending.clear();
    for (const r of list) if (!r.disposed) r.run();
  }
}

/**
 * @template T
 * @param {T} initial
 */
export function signal(initial) {
  let value = initial;
  const subs = new Set();
  return {
    get value() { track(subs); return value; },
    set value(next) {
      if (Object.is(next, value)) return;
      value = next;
      notify(subs);
    },
    /** Read without subscribing. */
    peek() { return value; },
    /** Set even when equal (for mutated objects). */
    set(next) { value = next; notify(subs); },
    update(fn) { this.value = fn(value); },
  };
}

function unsubscribe(r) {
  for (const deps of r.deps) deps.delete(r);
  r.deps.clear();
}

function runCleanups(r) {
  const list = r.cleanups.splice(0);
  for (const fn of list) {
    try { fn(); } catch (e) { reportError(e, 'cleanup'); }
  }
}

/**
 * Run [fn] now and again whenever a signal it read changes. [fn] may return
 * a cleanup, run before the next run and on dispose. Returns dispose.
 * @param {() => (void | (() => void))} fn
 */
export function effect(fn) {
  const r = {
    deps: new Set(),
    cleanups: [],
    disposed: false,
    run() {
      runCleanups(r);
      unsubscribe(r);
      const prevCurrent = current, prevOwner = owner;
      current = r; owner = r;
      try {
        const cleanup = fn();
        if (typeof cleanup === 'function') r.cleanups.push(cleanup);
      } catch (e) {
        reportError(e, 'page update');
      } finally {
        current = prevCurrent; owner = prevOwner;
      }
      // Made under an owner that's gone (onCleanup): nothing will dispose it later.
      if (r.disposed) runCleanups(r);
    },
  };
  const dispose = () => {
    if (r.disposed) return;
    r.disposed = true;
    unsubscribe(r);
    runCleanups(r);
  };
  onCleanup(dispose);
  r.run();
  return dispose;
}

/**
 * A read-only signal derived from others.
 * @template T
 * @param {() => T} fn
 */
export function computed(fn) {
  const s = signal(undefined);
  effect(() => { s.value = fn(); });
  return { get value() { return s.value; }, peek: () => s.peek() };
}

/** Group several writes so subscribers run once, after all of them. */
export function batch(fn) {
  batchDepth++;
  try { return fn(); } finally {
    if (--batchDepth === 0) flush();
  }
}

/** Run [fn] without subscribing to what it reads. */
export function untrack(fn) {
  const prev = current;
  current = null;
  try { return fn(); } finally { current = prev; }
}

/**
 * Register [fn] to run when the current owner is disposed or re-run. An
 * owner that's gone already (code finishing after its view was left) runs
 * it at once: an effect made there runs once and never subscribes.
 */
export function onCleanup(fn) {
  const o = owner || fallbackOwner;
  if (!o) return;
  if (!o.disposed) { o.cleanups.push(fn); return; }
  try { fn(); } catch (e) { reportError(e, 'cleanup'); }
}

/**
 * Where effects made outside any owner go - after an await, say. The app
 * sets this to the current view's owner, so a view's late effects go with it.
 */
export function setFallbackOwner(o) { fallbackOwner = o; }

/**
 * Make a new owner and run [fn] in it; [fn] receives dispose. Everything
 * made inside (effects, cleanups) goes away with it.
 */
export function root(fn) {
  const r = { cleanups: [], deps: new Set(), disposed: false, run() {} };
  const dispose = () => {
    if (r.disposed) return;
    r.disposed = true;
    runCleanups(r);
  };
  const prevOwner = owner, prevCurrent = current;
  owner = r; current = null;
  try { return fn(dispose); } finally { owner = prevOwner; current = prevCurrent; }
}

/** The current owner, to run later code in with runWithOwner. */
export function getOwner() { return owner; }

/** Run [fn] with [o] as owner (for things created after an await). */
export function runWithOwner(o, fn) {
  const prevOwner = owner, prevCurrent = current;
  owner = o; current = null;
  try { return fn(); } finally { owner = prevOwner; current = prevCurrent; }
}
