// fetch() for the data sources: a timeout, cancelling with the view, and
// errors with a `kind` the widgets can explain (and the error log can
// skip: core/errors.js ignores network trouble, which isn't a bug).
//
//   kind: 'aborted' | 'timeout' | 'network' | 'rate' | 'http' | 'parse'

const TIMEOUT = 15000;

export class FetchError extends Error {
  constructor(kind, message, status = 0) {
    super(message);
    this.name = 'FetchError';
    this.kind = kind;
    this.status = status;
  }
}

/**
 * GET [url] as JSON (or text with { text: true }).
 * @param {string} url
 * @param {{ signal?: AbortSignal, timeout?: number, text?: boolean, headers?: Record<string,string>, referrerPolicy?: ReferrerPolicy }} [opts]
 */
export async function getJSON(url, { signal, timeout = TIMEOUT, text = false, headers, referrerPolicy } = {}) {
  const timer = AbortSignal.timeout(timeout);
  const both = signal ? AbortSignal.any([signal, timer]) : timer;
  let res;
  try {
    res = await fetch(url, { signal: both, headers, ...(referrerPolicy ? { referrerPolicy } : {}) });
  } catch (e) {
    if (signal?.aborted) throw new FetchError('aborted', 'Cancelled');
    if (timer.aborted) throw new FetchError('timeout', 'The weather service took too long to answer');
    // CORS refusals look the same as no connection from here.
    throw new FetchError('network', 'Couldn\'t reach the weather service');
  }
  if (res.status === 429) throw new FetchError('rate', 'Too many requests for now', 429);
  if (!res.ok) throw new FetchError('http', `The weather service answered ${res.status}`, res.status);
  try {
    return text ? await res.text() : await res.json();
  } catch {
    throw new FetchError('parse', 'The weather service sent something unreadable');
  }
}

/** A URL from [base] and [params] (null/undefined dropped, arrays joined with commas). */
export function url(base, params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue;
    q.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  return `${base}?${q}`;
}
