// The error log: unexpected errors after start-up (before it, theme-init.js's
// red box), kept in this browser (darkbreezy:errors, the latest MAX) so they can
// be read, copied and shared from #/errors. The header's warning icon shows
// while some haven't been seen. No imports on purpose: signal.js and h.js
// report here, so this can't depend on them.

const KEY = 'darkbreezy:errors';
const SEEN = 'darkbreezy:errors-seen';
const MAX = 50;
const listeners = new Set();

/** @typedef {{ id: string, time: string, last: string, count: number, message: string, stack: string, where: string, page: string }} ErrorEntry */

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage refused: kept in memory */ }
}

/** @type {ErrorEntry[]} newest first */
let log = Array.isArray(read(KEY, null)) ? read(KEY, []) : [];

/**
 * What isn't a bug: the network and the instance (they get their own
 * messages where they happen), cancelled requests, a browser extension's
 * own errors, and the browser's harmless ResizeObserver note.
 */
export function ignorable(error, message = '', source = '') {
  const kind = error?.kind;
  if (['aborted', 'network', 'timeout', 'cors', 'rate', 'auth'].includes(kind)) return true;
  if (error?.name === 'AbortError') return true;
  if (/^(moz|chrome|safari(-web)?)-extension:/.test(source) || /(moz|chrome)-extension:\/\//.test(error?.stack || '')) return true;
  if (/ResizeObserver loop/i.test(message) || message === 'Script error.') return true;
  return false;
}

/** Note [error] (from [where]: a feature, the page...), and tell whoever's watching. */
export function reportError(error, where = '') {
  // Still in the console, for anyone with developer tools.
  console.error(where || 'error', error);
  const message = String(error?.message || error || 'Unknown error').slice(0, 500);
  if (ignorable(error, message)) return;
  if (typeof location === 'undefined') return;   // not in a browser (unit tests)
  const stack = String(error?.stack || '').split('\n').slice(0, 12).join('\n').split(location.origin).join('');
  const now = new Date().toISOString();
  const page = location.hash || '#/';
  const same = log.find((e) => e.message === message && e.where === where && e.stack.split('\n')[1] === stack.split('\n')[1]);
  if (same) {
    same.count++;
    same.last = now;
    same.page = page;
    log = [same, ...log.filter((e) => e !== same)];
  } else {
    log = [{ id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, time: now, last: now, count: 1, message, stack, where, page }, ...log].slice(0, MAX);
  }
  write(KEY, log);
  listeners.forEach((fn) => fn());
}

export const errorLog = () => log;

/** How many happened since #/errors was last open. */
export function unseenErrors() {
  const seen = read(SEEN, '');
  return log.filter((e) => e.last > seen).length;
}

export function markErrorsSeen() {
  write(SEEN, new Date().toISOString());
  listeners.forEach((fn) => fn());
}

export function clearErrors() {
  log = [];
  write(KEY, log);
  listeners.forEach((fn) => fn());
}

/** Call [fn] when the log changes; returns the way to stop. */
export function onErrors(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The whole log as text, with what helps to read it: for copying and sharing. */
export function errorReport(entries = log) {
  let build = '';
  try { const d = JSON.parse(localStorage.getItem('darkbreezy:deployment')); if (d?.build) build = `${d.build} (${d.built || '?'})`; } catch { /* none */ }
  const lines = [
    'Dark Breezy error report',
    `time: ${new Date().toISOString()}`,
    `address: ${location.origin}${location.pathname}${location.hash}`,
    `browser: ${navigator.userAgent}`,
    `screen: ${innerWidth}x${innerHeight}`,
    `build: ${build || 'development (unbuilt)'}`,
    '',
  ];
  for (const e of entries) {
    lines.push(`- ${e.message}${e.count > 1 ? ` (×${e.count}, last ${e.last})` : ''}`);
    lines.push(`  at ${e.time}${e.where ? ` in ${e.where}` : ''} on ${e.page}`);
    if (e.stack) lines.push(...e.stack.split('\n').map((l) => `    ${l.trim()}`));
  }
  if (!entries.length) lines.push('No errors.');
  return lines.join('\n');
}
