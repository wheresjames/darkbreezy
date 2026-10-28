// Dark Breezy's development cache buster, from playthroughapps.com's (same author).
// Crawl the unbuilt site when update.js is asked for a full refresh and no
// deployment.json exists. Importing this module does not start a refresh.
// Every app module is reached by static imports from js/main.js, so the
// crawl from / finds the whole app.
//
// APKs and responses over 2 MiB are skipped, just as in a built site's list.
// A page can't empty the browser's cache, but a fetch with cache: 'reload'
// skips it and stores the fresh copy in its place - for that same address,
// which is what a later page load or module import asks for. So this crawls
// the site from here: pages' src and href, stylesheets' url(), scripts'
// imports and any quoted path with a file extension, and JSON's the same.
// A path built at run time (`levels/${size}.json`, say) can't be seen and is
// left to the browser. The built site's manifest covers those paths.
//
// That's enough for Chromium, but not for Firefox: it keeps stylesheets and
// images it has already parsed in a memory cache of its own, shared by every
// page, and goes on using those whatever the HTTP cache now holds - even
// through a reload. Only a forced reload of a page that uses them replaces
// them. So once everything is fetched, every stylesheet and image found is
// put on one hidden page (a blob:, so no app boots in it) and that page is
// force-reloaded; then this one is, too.

const AT_ONCE = 6;                    // fetches in flight
// Keep this limit and the APK rule in scripts/build.sh in step.
const MAX_REFRESH_BYTES = 2 * 1024 * 1024;

const root = new URL('../', import.meta.url);           // the site's root

// Files worth reading for more paths, by extension.
const READ = /\.(html?|m?js|css|json|webmanifest)$/i;
// A quoted relative path to a file: no scheme, no template holes. APKs are
// downloads, not site assets. Bare shader names are placed by the app, so
// crawling them would only guess at many nonexistent addresses.
const QUOTED = /["'`]((?:\.{0,2}\/)?[\w@%./-]+\.(?:m?js|json|css|html?|png|jpe?g|gif|webp|svg|ogg|m4a|mp3|wav|webmanifest|txt|woff2?))["'`]/g;

/**
 * Same site, under its root, without fragment - or null. The query stays: a
 * page asking for kids.css?v=2 is served from that address's cache entry.
 */
function inside(path, base) {
  // Not a file: a scheme of its own, or a reference within one (an SVG
  // filter's url(#g), escaped inside a data: image).
  if (!path || /^(data|blob|mailto|javascript):/i.test(path) || /^(#|%23)/.test(path)) return null;
  let url;
  try { url = new URL(path, base); } catch { return null; }
  if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) return null;
  if (/\.apk$/i.test(url.pathname)) return null;
  url.hash = '';
  return url.href;
}

/** Read no more than the build's per-file limit, even without Content-Length. */
async function readSmall(response, asText) {
  const length = Number(response.headers.get('Content-Length'));
  if (length > MAX_REFRESH_BYTES) {
    await response.body?.cancel();
    return null;
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = asText ? new TextDecoder() : null;
  let size = 0, text = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return asText ? text + decoder.decode() : '';
    size += value.byteLength;
    if (size > MAX_REFRESH_BYTES) {
      await reader.cancel();
      return null;
    }
    if (asText) text += decoder.decode(value, { stream: true });
  }
}

/** The paths [text] refers to, read as the kind of file [url] is. */
function references(url, text) {
  const found = [];
  const all = (re) => { for (const m of text.matchAll(re)) found.push(m[1]); };
  const path = new URL(url).pathname;
  if (/\.css$/i.test(path)) {
    all(/url\(\s*["']?([^"')]+)["']?\s*\)/g);
    all(/@import\s+["']([^"']+)["']/g);
  } else if (/\.(m?js)$/i.test(path)) {
    all(/\b(?:import|export)\b[^'"`;]*?\bfrom\s*["']([^"']+)["']/g);
    all(/\bimport\s*\(?\s*["']([^"']+)["']/g);
    all(QUOTED);
  } else if (/\.(json|webmanifest)$/i.test(path)) {
    all(QUOTED);
  } else {
    // A page: its src and href, and what's quoted in its inline scripts.
    all(/\b(?:src|href)\s*=\s*["']([^"'#]+)["']/g);
    all(QUOTED);
  }
  return found;
}

/**
 * Fetch the whole site afresh. [progress] hears (done, total) as it goes;
 * resolves to how many files were refreshed.
 */
export async function refreshAll(progress) {
  const seen = new Set();                    // every address asked for, found or not
  const found = new Set();                   // the ones that were there
  const pages = new Set([root.href]);        // folders a loose path may be relative to: pages,
  const assets = new Set();                  // and assets folders, which helpers build paths into
  const loose = new Set();                   // quoted paths whose base can't be known
  const placed = new Set();                  // loose paths already found somewhere
  const queue = [];
  let done = 0;
  const add = (url) => { if (url && !seen.has(url)) { seen.add(url); queue.push(url); } };

  /** Fetch [url] afresh and follow what it refers to. True if it was there. */
  const visit = async (url) => {
    try {
      const response = await fetch(url, { cache: 'reload' });
      if (!response.ok) { await response.body?.cancel(); return false; }
      const path = new URL(url).pathname;
      const page = path.endsWith('/') || /\.html?$/i.test(path);
      const readable = page || READ.test(path);
      const text = await readSmall(response, readable);
      if (text === null) return false;
      found.add(url);
      // Every folder above this file might have an assets folder of its
      // own that a helper builds paths into (common/js/ui.js ->
      // common/assets/). Not inside an assets folder, though: those
      // don't hold assets folders.
      for (let dir = new URL('./', url); dir.href.startsWith(root.href); dir = new URL('../', dir)) {
        if (!dir.pathname.includes('/assets/')) assets.add(new URL('assets/', dir).href);
        if (dir.href === root.href) break;
      }
      if (!readable) return true;
      if (page) {
        const folder = new URL('./', url).href;
        pages.add(folder);
        add(new URL('index.html', folder).href);   // the same page, by its other address
      }
      const script = /\.m?js$/i.test(path);
      // What a page fetches and resolves against itself: a script's
      // quoted paths, and JSON's. A stylesheet's url() and a web
      // manifest's icons are always relative to the file they're in.
      const fetched = script || /\.json$/i.test(path);
      for (const ref of references(url, text)) {
        // Relative to this file; and, for a quoted path in a script or
        // JSON (which a page fetches), somewhere else - see below. A
        // script means itself only with ./ or ../ (an import, or
        // new URL(..., import.meta.url)); a bare path in one is the
        // page's to resolve, so it's only ever looked for there.
        const bare = !/^(\.{1,2}\/|\/)/.test(ref);
        if (!(script && bare)) add(inside(ref, url));
        if (fetched && bare) loose.add(ref);
      }
      return true;
    } catch {
      return false;                      // offline, say: nothing to refresh
    } finally {
      progress(++done, seen.size);
    }
  };

  /** [AT_ONCE] at a time, until the queue is empty. */
  const drain = async () => {
    await Promise.all(Array.from({ length: AT_ONCE }, async () => {
      while (queue.length) await visit(queue.shift());
    }));
  };

  /**
   * Find a loose path. A page fetches it relative to itself, and pages
   * share code, so it may be a different file on every page (an asset
   * path in common/js resolves under each app): try it on all of them.
   * Failing that, a helper built it into an assets folder: try those one
   * at a time and stop at the first that has it.
   */
  const place = async (ref) => {
    const tryAt = async (base) => {
      const url = inside(ref, base);
      if (!url) return false;
      if (seen.has(url)) return found.has(url);
      seen.add(url);
      return visit(url);
    };
    let hit = false;
    for (const base of pages) if (await tryAt(base)) hit = true;
    // Already fetched under that name, from where the code really builds
    // it: no need to hunt the assets folders for it, 404 after 404.
    const known = [...found].some((url) => url.endsWith(`/${ref}`));
    if (!hit && !known) for (const base of assets) if (await tryAt(base)) break;
    placed.add(ref);
  };

  add(root.href);
  add(inside('index.html', root));
  // Round by round: fetch everything referred to directly, then place the
  // loose paths found so far - which may turn up more of both - until a
  // round turns up nothing new.
  for (;;) {
    await drain();
    const todo = [...loose].filter((ref) => !placed.has(ref));
    if (!todo.length) break;
    await Promise.all(Array.from({ length: AT_ONCE }, async () => {
      while (todo.length) await place(todo.shift());
    }));
  }
  await refreshMemory([...found]);
  return found.size;
}

// What Firefox holds parsed in memory, beyond the HTTP cache's reach.
const STYLESHEET = /\.css$/i;
const IMAGE = /\.(png|jpe?g|gif|webp|svg|ico)$/i;

/**
 * Replace Firefox's in-memory copies of the stylesheets and images among
 * [urls]: load them all on a hidden page, then force-reload it. Elsewhere
 * it's one more fetch of each, from the cache just refreshed.
 */
export function refreshMemory(urls) {
  const attr = (url) => url.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const tags = [];
  for (const url of urls) {
    const path = new URL(url).pathname;
    if (STYLESHEET.test(path)) tags.push(`<link rel="stylesheet" href="${attr(url)}">`);
    else if (IMAGE.test(path)) tags.push(`<img src="${attr(url)}" alt="">`);
  }
  if (!tags.length) return Promise.resolve();
  const page = URL.createObjectURL(new Blob([`<!doctype html>${tags.join('')}`], { type: 'text/html' }));
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.hidden = true;
    frame.setAttribute('aria-hidden', 'true');
    let loads = 0;
    const finish = () => {
      clearTimeout(timer);
      frame.remove();
      URL.revokeObjectURL(page);
      resolve();
    };
    // Never held up for good by a file that doesn't finish loading.
    const timer = setTimeout(finish, 15000);
    frame.addEventListener('load', () => {
      // Firefox's forced reload (its non-standard argument; others
      // ignore it and reload from the cache).
      if (++loads === 1) frame.contentWindow.location.reload(true);
      else finish();
    });
    frame.src = page;
    document.body.append(frame);
  });
}
