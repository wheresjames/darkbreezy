// A browser-ish world for unit tests of modules that touch storage:
// an in-memory localStorage (with an optional size limit, to test a full
// storage) and `window`. Import before the modules under test.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export class MemoryStorage {
  constructor(limit = Infinity) { this.map = new Map(); this.limit = limit; }
  get length() { return this.map.size; }
  key(i) { return [...this.map.keys()][i] ?? null; }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) {
    const size = [...this.map].reduce((n, [key, val]) => n + (key === k ? 0 : key.length + val.length), 0) + k.length + String(v).length;
    if (size > this.limit) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
    this.map.set(k, String(v));
  }
  removeItem(k) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

globalThis.window ??= globalThis;
globalThis.addEventListener ??= () => {};
globalThis.localStorage ??= new MemoryStorage();
globalThis.sessionStorage ??= new MemoryStorage();

/** A fixture file's JSON: fixture('recorded/om-forecast-nyc.json'). */
export function fixture(name) {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)), 'utf8'));
}
