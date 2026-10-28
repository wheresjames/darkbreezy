// Which warning sources cover a place: the country's own (by its ISO code)
// and the global ones, asked in parallel and merged (DARKBREEZY.md §4).
// A source that fails doesn't hide the others; the result says which ones
// answered. Adding a country is one adapter module and one line here.

import * as nws from './nws.js';
import * as eccc from './eccc.js';
import * as dwd from './dwd.js';
import * as jma from './jma.js';
import * as hko from './hko.js';
import * as gdacs from './gdacs.js';
import { merge } from './model.js';
import { nationalService } from './services.js';

const NATIONAL = [nws, eccc, dwd, jma, hko];
const GLOBAL = [gdacs];

/** The national adapter for country [cc], or null. */
export const nationalFor = (cc) => NATIONAL.find((a) => a.countries.includes(String(cc || '').toUpperCase())) || null;

/**
 * @typedef {{
 *   alerts: import('./model.js').Alert[],
 *   coverage: 'national'|'global-only',   national: the country's own warnings are included
 *   service: { name: string, url: string } | null,   where to look when they aren't
 *   failed: string[],                     issuers that didn't answer
 *   fetchedAt: number,
 * }} AlertResult
 */

/**
 * Every source for [place], asked in parallel. With [onPartial], what's in
 * so far is handed over each time a source answers, once the country's
 * own source has: its warnings shouldn't wait for a slow global feed
 * (GDACS can take 10 seconds). Resolves when all have answered.
 * @returns {Promise<AlertResult>}
 */
export async function fetchAlerts(place, { signal, onPartial } = {}) {
  const national = nationalFor(place.cc);
  const adapters = [...(national ? [national] : []), ...GLOBAL];
  const settled = adapters.map(() => null);   // { ok: list } | { error }
  const result = () => {
    const lists = settled.filter((r) => r?.ok).map((r) => r.ok);
    const failed = adapters.filter((a, i) => settled[i]?.error).map((a) => a.issuer);
    return {
      alerts: merge(lists),
      coverage: national && settled[0]?.ok ? 'national' : 'global-only',
      service: national ? null : nationalService(place.cc),
      failed,
      fetchedAt: Date.now(),
    };
  };
  await Promise.all(adapters.map((a, i) => a.fetchAlerts(place, { signal }).then(
    (ok) => { settled[i] = { ok }; },
    (error) => { settled[i] = { error }; },
  ).then(() => {
    // The country's own warnings are in (or there's no national source): show what's here.
    // Not if it failed: an early "no warnings" would really mean "couldn't check".
    if (onPartial && !signal?.aborted && (!national || settled[0]?.ok) && settled.some((r) => !r)) onPartial(result());
  })));
  if (signal?.aborted) throw Object.assign(new Error('Cancelled'), { kind: 'aborted' });
  // Nothing answered at all: let the caller show its error (and keep cached data).
  if (settled.every((r) => r.error)) throw settled[0].error;
  return result();
}
