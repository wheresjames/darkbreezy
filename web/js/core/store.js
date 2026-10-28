// localStorage wrapper: namespaced ("darkbreezy:<area>"), versioned with
// migrations, falling back to memory when storage is refused, and kept in
// step across tabs through the `storage` event.
//
//   const settings = persisted('settings', { version: 2, defaults, migrations: { 2: (old) => ... } });
//   settings.value            // a signal of the stored object
//   settings.update((s) => ({ ...s, theme: 'dark' }))

import { signal } from './signal.js';

export const PREFIX = 'darkbreezy:';

const memory = new Map();
/** Becomes true when a write fails: the app shows a banner. */
export const storageFailed = signal(false);

function area(kind) {
  try {
    const s = kind === 'session' ? window.sessionStorage : window.localStorage;
    // Some browsers hand out a storage object that throws on use.
    const probe = `${PREFIX}probe`;
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    storageFailed.value = true;
    return null;
  }
}

const local = area('local');
const session = area('session');

/** Read a raw string; [kind] 'local' or 'session'. */
export function readRaw(key, kind = 'local') {
  const s = kind === 'session' ? session : local;
  try { return s ? s.getItem(key) : memory.get(`${kind}:${key}`) ?? null; } catch { return memory.get(`${kind}:${key}`) ?? null; }
}

export function writeRaw(key, value, kind = 'local') {
  const s = kind === 'session' ? session : local;
  try {
    if (!s) throw new Error('no storage');
    if (value == null) s.removeItem(key); else s.setItem(key, value);
  } catch {
    storageFailed.value = true;
    if (value == null) memory.delete(`${kind}:${key}`); else memory.set(`${kind}:${key}`, value);
  }
}

export function readJSON(key, kind = 'local') {
  try { return JSON.parse(readRaw(key, kind)); } catch { return null; }
}

export function writeJSON(key, value, kind = 'local') {
  writeRaw(key, value == null ? null : JSON.stringify(value), kind);
}

/**
 * Bring [stored] up to [version] with [migrations] ({ n: (data) => data } turns
 * version n-1 into n). Unknown or newer data is kept as is, under defaults.
 */
export function migrate(stored, version, defaults, migrations = {}) {
  if (!stored || typeof stored !== 'object') return structuredClone(defaults);
  let data = stored.data ?? {};
  let v = Number(stored.v) || 1;
  for (let n = v + 1; n <= version; n++) {
    if (migrations[n]) data = migrations[n](data);
    v = n;
  }
  return mergeDefaults(defaults, data);
}

/** Fill in keys missing from [data] with [defaults], recursively for plain objects. */
export function mergeDefaults(defaults, data) {
  if (!isPlain(defaults) || !isPlain(data)) return data === undefined ? structuredClone(defaults) : data;
  const out = { ...data };
  for (const [k, v] of Object.entries(defaults)) out[k] = k in data ? mergeDefaults(v, data[k]) : structuredClone(v);
  return out;
}

const isPlain = (x) => x != null && typeof x === 'object' && !Array.isArray(x);

const areas = new Map();

/**
 * A stored area as a signal. Writes go to storage straight away; another
 * tab's writes arrive through the storage event.
 * @param {string} name
 * @param {{ version?: number, defaults: any, migrations?: Record<number, Function>, kind?: 'local'|'session' }} opts
 */
export function persisted(name, { version = 1, defaults, migrations, kind = 'local' }) {
  if (areas.has(name)) return areas.get(name);
  const key = PREFIX + name;
  const load = () => migrate(readJSON(key, kind), version, defaults, migrations);
  const s = signal(load());
  const api = {
    key,
    get value() { return s.value; },
    peek: () => s.peek(),
    set(value) {
      s.value = value;
      writeJSON(key, { v: version, data: value }, kind);
    },
    update(fn) { api.set(fn(s.peek())); },
    reload() { s.value = load(); },
  };
  areas.set(name, api);
  return api;
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (!e.key || !e.key.startsWith(PREFIX)) return;
    areas.get(e.key.slice(PREFIX.length))?.reload();
  });
}

/** Every darkbreezy: key in localStorage (for export). */
export function allKeys() {
  const keys = [];
  if (!local) return [...memory.keys()].filter((k) => k.startsWith('local:')).map((k) => k.slice(6));
  for (let i = 0; i < local.length; i++) {
    const k = local.key(i);
    if (k?.startsWith(PREFIX)) keys.push(k);
  }
  return keys;
}
