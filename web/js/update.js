// Dark Breezy's updater, adapted from playthroughapps.com's (same author); see
// docs/cache-bust.md. A built site (scripts/build.sh) has at its root a
// deployment.json - a few bytes: the build's id, and the name of its file
// list - and that list, files-<build>.json: refreshable files with hashes of
// their contents. Files over 2 MiB are not refreshed automatically.
//
// At startup, main.js waits for `updated` before mounting: it asks for
// deployment.json afresh, and when its build isn't the one this browser last
// saw, fetches the list, puts up an "Updating" dialog, fetches again from
// the server exactly the files whose hashes differ from the list it
// installed last, and reloads.
//
//  * A first visit saves the build and updates nothing: there's nothing
//    stale to replace. It fetches the list once the page is idle, to compare
//    the next build against. A visitor from before builds were stamped -
//    something of Dark Breezy's in localStorage, but no build - gets one full refresh.
//  * The unbuilt web/ folder has no deployment.json: nothing happens, quietly.
//
// Dark Breezy is a long-lived single-page app, so it also checks again when the
// tab comes back to the front and every 30 minutes while visible. A build
// found then isn't installed under the user's feet: watchForUpdates() tells
// the app, which shows a banner and calls applyPendingUpdate() at the next
// safe moment (a route change with no unsaved draft), or when the user
// clicks Reload.
//
// To test: five quick clicks on the footer's copyright line, ?update in the
// address (before the #), or Settings > Advanced > "Refresh app files"
// refresh every listed file - all of the deployment's, or, with no
// deployment.json, everything the crawling cache buster (cache-bust.js) can
// find. ?update=diff runs the real comparison against the stored file list,
// as if the build had changed. Settings, places and saved weather in
// localStorage are never touched.

const root = new URL('../', import.meta.url);           // the site's root

const STORE = 'darkbreezy:deployment';      // localStorage: the deployment last installed, and its file list
const TRIED = 'darkbreezy:update-tried';    // sessionStorage: the build last tried this session, against loops
const LOCK = 'darkbreezy:update-lock';      // localStorage: when a tab started updating, so others wait for it
const OURS = [STORE, LOCK];
const CHECK_WAIT = 3000;                // ms to wait for deployment.json before carrying on without it
const LIST_WAIT = 10000;                // ms to wait for the file list
const LIST = /^files-[0-9a-f]+\.json$/; // what a file list is called (build.sh)
// The not-found page: served with status 404 at every address it's sent
// for, its own included (server.json's notFound) - so its 404 is a success.
const NOT_FOUND = '404.html';
const LOCK_STALE = 120000;              // ms after which another tab's lock is taken to be abandoned
const AT_ONCE = 6;                      // fetches in flight
const CLICKS = 5;                       // quick clicks on the copyright line to refresh everything,
const WITHIN = 2500;                    // in this many ms
const RECHECK = 30 * 60 * 1000;         // while the tab is open and visible

// Storage can be refused outright (private modes, blocked site data): then
// there's no memory of a build, and every visit is a first one.
const store = {
  get(area, key) { try { return area.getItem(key); } catch { return null; } },
  set(area, key, value) { try { area.setItem(key, value); return true; } catch { return false; } },
  remove(area, key) { try { area.removeItem(key); } catch { /* nothing to remove */ } },
};
const local = (() => { try { return window.localStorage; } catch { return null; } })();
const session = (() => { try { return window.sessionStorage; } catch { return null; } })();

/**
 * The deployment last installed here, or null: its build, built, commit and
 * files - the list's { path: hash }, or null if it was never fetched.
 */
export function installed() {
  try {
    const d = JSON.parse(store.get(local, STORE));
    return d && typeof d.build === 'string' ? d : null;
  } catch { return null; }
}

/** Record [deployment] as installed, with its list's [files] if known. */
function remember(deployment, files) {
  const { build, built, commit } = deployment;
  store.set(local, STORE, JSON.stringify({ build, built, commit, files: files || null }));
}

/**
 * Whether this browser has been here before: anything of Dark Breezy's in
 * localStorage besides the updater's own. Read before anything this visit
 * can write.
 */
const returning = (() => {
  if (!local) return false;
  try {
    for (let i = 0; i < local.length; i++) {
      const key = local.key(i);
      if (key?.startsWith('darkbreezy:') && !OURS.includes(key)) return true;
    }
  } catch { /* unreadable: a first visit, as far as anyone can tell */ }
  return false;
})();

/** [url] as JSON, or null: missing, offline, unreadable, or not back within [ms]. */
async function fetchJSON(url, options, ms) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), ms);
  try {
    const response = await fetch(url, { ...options, signal: abort.signal });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * deployment.json, fresh from the server: { build, built, commit, files },
 * [files] the name of its list - or null: not built, offline, or too slow.
 */
async function latest() {
  // no-store and a new address each time: never an answer from a cache.
  const d = await fetchJSON(new URL(`deployment.json?t=${Date.now()}`, root), { cache: 'no-store' }, CHECK_WAIT);
  return d && typeof d.build === 'string' && typeof d.files === 'string' && LIST.test(d.files) ? d : null;
}

/**
 * [deployment]'s file list, { path: hash }, or null. Named for its build,
 * so whatever cache answers has the right one.
 */
async function fileList(deployment) {
  const d = await fetchJSON(new URL(deployment.files, root), {}, LIST_WAIT);
  return d && d.build === deployment.build && d.files && typeof d.files === 'object' ? d.files : null;
}

/**
 * Fetch [deployment]'s list when the page is idle, and keep it as the
 * installed one's - if that's still [deployment] and has none.
 */
function learnList(deployment) {
  const later = window.requestIdleCallback || ((fn) => setTimeout(fn, 2000));
  later(async () => {
    const files = await fileList(deployment);
    const now = installed();
    if (files && now?.build === deployment.build && !now.files) remember(deployment, files);
  }, { timeout: 10000 });
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** What a completed update ends in: the page going away. */
const never = () => new Promise(() => {});

function reload() {
  // Forced: Firefox otherwise keeps its parsed stylesheets and images
  // (see cache-bust.js). Other browsers ignore the argument.
  location.reload(true);
  return never();
}

//---------------------------------------------------------------------------
// The check

async function check() {
  const asked = new URLSearchParams(location.search).get('update');
  if (asked !== null) {
    // Taken off the address, so the reload after it doesn't do it again.
    // The hash (the app's route) stays, so the reload lands back there.
    const url = new URL(location.href);
    url.searchParams.delete('update');
    history.replaceState(history.state, '', url);
    return refresh(asked === 'diff' ? 'diff' : 'full');
  }
  const deployment = await latest();
  if (!deployment) return false;
  const was = installed();
  if (!was) {
    if (!returning) {
      remember(deployment, null);
      learnList(deployment);
      return false;
    }
    return install(deployment, null);
  }
  if (was.build === deployment.build) {
    // A first visit that left before its list came: try again.
    if (!was.files) learnList(deployment);
    return false;
  }
  return install(deployment, was);
}

let running = null;

/** Refresh on request: [mode] 'full' (every file) or 'diff' (the real comparison). */
export function refresh(mode = 'full') {
  running ??= (async () => {
    const deployment = await latest();
    if (deployment) return install(deployment, mode === 'diff' ? installed() : null, true);
    return crawl();
  })().finally(() => { running = null; });
  return running;
}

/**
 * Bring this browser up to [deployment] from [was] (the one installed, or
 * null to refresh every file). [forced] when asked for: shown even when
 * nothing has changed, and not stopped by the guard against loops.
 */
async function install(deployment, was, forced = false) {
  // Once a session per build: if it's still out of date after a reload
  // (a deployment.json served stale, storage refused), carry on rather
  // than update again and again.
  if (!forced && store.get(session, TRIED) === deployment.build) return false;
  store.set(session, TRIED, deployment.build);

  // Without the new list there's no saying what changed: the next session tries again.
  const files = await fileList(deployment);
  if (!files) return false;
  // Without the old one, everything has.
  const changed = Object.keys(files).filter((path) => !was?.files || was.files[path] !== files[path]);
  if (!changed.length && !forced) {
    // Only files taken away: nothing to fetch.
    remember(deployment, files);
    return false;
  }

  const dialog = UpdateDialog.open(label(deployment));
  const held = Number(store.get(local, LOCK));
  if (held && Date.now() - held < LOCK_STALE) return waitForOtherTab(dialog, deployment);
  store.set(local, LOCK, String(Date.now()));

  try {
    const { failed, memory } = await fetchAll(addresses(files, changed), new Set(changed),
      (done, total) => dialog.progress(done, total));
    const { refreshMemory } = await import('./cache-bust.js');
    dialog.status('Refreshing images…', true);
    await refreshMemory(memory);
    if (failed) {
      // Not recorded as installed: the next visit tries again.
      dialog.fail(`${failed} file${failed === 1 ? '' : 's'} couldn't be fetched - carrying on`);
      await wait(2200);
      dialog.close();
      return true;
    }
    remember(deployment, files);
    dialog.done('Restarting…');
    await wait(600);
    return reload();
  } catch (e) {
    // Offline mid-update, say: not installed, so the next visit tries again.
    // The dialog is modal and can't be dismissed, so it mustn't stay up.
    console.warn('updating', e);
    dialog.fail('The update stopped - carrying on');
    await wait(2200);
    dialog.close();
    return true;
  } finally {
    store.remove(local, LOCK);
  }
}

/** Another tab is updating already: wait for it to finish, then reload into what it fetched. */
async function waitForOtherTab(dialog, deployment) {
  dialog.waiting('Updating in another tab…');
  const start = Date.now();
  while (Date.now() - start < LOCK_STALE) {
    await wait(500);
    if (installed()?.build === deployment.build || !store.get(local, LOCK)) break;
  }
  dialog.done('Restarting…');
  await wait(400);
  return reload();
}

/** "BUILD 2026.10.07 · 247ef3d", as far as [deployment] says. */
export function label(deployment) {
  if (!deployment) return '';
  const date = /^\d{4}-\d\d-\d\d/.test(deployment.built || '') ? deployment.built.slice(0, 10).replace(/-/g, '.') : '';
  // A build from uncommitted changes is "<commit>+changes": a + says as much.
  const commit = (deployment.commit || '').replace(/\+changes$/, '+');
  return `BUILD ${[date || deployment.build.slice(0, 8), commit].filter(Boolean).join(' · ')}`;
}

//---------------------------------------------------------------------------
// While the app is open

let pending = null;

/**
 * Check again whenever the tab comes back to the front, and every 30
 * minutes while it's visible; call [onAvailable](label) once a new build is
 * found. The app then calls applyPendingUpdate() when it's safe.
 */
export function watchForUpdates(onAvailable) {
  let timer = 0;
  const recheck = async () => {
    clearTimeout(timer);
    if (document.visibilityState !== 'visible') return;
    if (!pending) {
      const d = await latest();
      const was = installed();
      if (d && was && d.build !== was.build) {
        pending = d;
        onAvailable(label(d));
      }
    }
    timer = setTimeout(recheck, RECHECK);
  };
  document.addEventListener('visibilitychange', recheck);
  timer = setTimeout(recheck, RECHECK);
}

export function updatePending() { return !!pending; }

/** Install the build found by watchForUpdates (shows the dialog, then reloads). */
export function applyPendingUpdate() {
  if (!pending) return Promise.resolve(false);
  const d = pending;
  pending = null;
  return install(d, installed(), true);
}

//---------------------------------------------------------------------------
// Fetching

const PAGE = /(^|\/)index\.html$/;

/**
 * Every address to fetch for [changed] paths of a list's [files]: those, and
 * every page whatever has changed - they're small, and they're what a
 * browser starts from. A page is cached under each address it's asked for
 * by, so index.html also as /.
 */
function addresses(files, changed) {
  const paths = new Set(changed);
  for (const path of Object.keys(files)) if (/\.html?$/i.test(path)) paths.add(path);
  const urls = [];
  for (const path of paths) {
    urls.push(new URL(path, root).href);
    if (PAGE.test(path)) urls.push(new URL(path.replace(PAGE, '$1'), root).href);
  }
  return urls;
}

/** The site-relative path of [url], or null if it's outside the site. */
function relative(url) {
  if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) return null;
  try { return decodeURIComponent(url.pathname.slice(root.pathname.length)); } catch { return null; }
}

// A stylesheet or image a page asks for under a stamped address
// (base.css?v=20261006): a cache entry of its own, refreshed with the file.
const STAMPED = /\b(?:src|href)\s*=\s*["']([^"'#]+\?[^"'#]*)["']/gi;
// What Firefox holds parsed in memory, beyond the HTTP cache's reach.
const MEMORY = /\.(css|png|jpe?g|gif|webp|svg|ico)$/i;

/**
 * Fetch [urls] afresh, AT_ONCE at a time, with [progress] (done, total).
 * Pages are read for stamped addresses of [changed] files, which are added.
 * Resolves to how many failed, and the stylesheets and images among those
 * fetched, for Firefox's memory cache.
 */
async function fetchAll(urls, changed, progress) {
  const queue = [...new Set(urls)];
  const seen = new Set(queue);
  const memory = [];
  let done = 0, failed = 0;
  progress(0, queue.length);
  const visit = async (url) => {
    try {
      const response = await fetch(url, { cache: 'reload' });
      const fine = response.ok || (response.status === 404 && relative(new URL(url)) === NOT_FOUND);
      if (!fine) { failed++; await response.body?.cancel(); return; }
      const path = new URL(url).pathname;
      if (MEMORY.test(path)) memory.push(url);
      if (/(\.html?|\/)$/i.test(path)) {
        for (const m of (await response.text()).matchAll(STAMPED)) {
          let ref;
          try { ref = new URL(m[1].replace(/&amp;/g, '&'), url); } catch { continue; }
          ref.hash = '';
          if (changed.has(relative(ref)) && !seen.has(ref.href)) { seen.add(ref.href); queue.push(ref.href); }
        }
      } else {
        await response.arrayBuffer();
      }
    } catch {
      failed++;
    } finally {
      progress(++done, seen.size);
    }
  };
  await Promise.all(Array.from({ length: AT_ONCE }, async () => {
    while (queue.length) await visit(queue.shift());
  }));
  return { failed, memory };
}

/** No deployment.json - the unbuilt site: everything the crawler can find. */
async function crawl() {
  const dialog = UpdateDialog.open('DEVELOPMENT');
  dialog.status('Looking for files…');
  try {
    const { refreshAll } = await import('./cache-bust.js');
    // The crawl counts every address it tries, guesses that aren't there included.
    const count = await refreshAll((done, total) => dialog.progress(done, total, 'Checked', 'address', 'addresses'));
    dialog.done(`Refreshed ${count} files - restarting…`);
    await wait(700);
    return reload();
  } catch (e) {
    console.warn('refreshing the site', e);
    dialog.fail('The refresh stopped - carrying on');
    await wait(2200);
    dialog.close();
    return true;
  }
}

//---------------------------------------------------------------------------
// The dialog. Its styles are in css/update.css (the CSP allows no inline
// styles), using the app's theme tokens, so it follows Auto/Light/Dark.

const UpdateDialog = {
  /** Up, over everything, with [version] in its corner. */
  open(version) {
    const dialog = document.createElement('dialog');
    dialog.className = 'ol-update';
    dialog.setAttribute('aria-labelledby', 'ol-update-title');
    // Fixed markup only: nothing remote goes in here.
    dialog.innerHTML = `<div class="ol-update-panel">
<p class="ol-update-head"><img class="ol-update-mark" src="${new URL('assets/favicon.svg', root).href}" alt="" width="28" height="28"><span class="ol-update-brand">Dark Breezy</span><span class="ol-update-version"></span></p>
<h2 class="ol-update-title" id="ol-update-title">Updating Dark Breezy</h2>
<div class="ol-update-bar" role="progressbar" aria-labelledby="ol-update-title" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="ol-update-fill"></div></div>
<p class="ol-update-status" aria-live="polite"><span class="ol-update-text">Checking files…</span><span class="ol-update-percent" aria-hidden="true"></span></p>
</div>`;
    const $ = (name) => dialog.querySelector(`.ol-update-${name}`);
    const bar = $('bar'), fill = $('fill'), text = $('text'), percent = $('percent'), title = $('title');
    $('version').textContent = version;
    // Not to be dismissed: the page reloads when it's done.
    dialog.addEventListener('cancel', (e) => e.preventDefault());
    (document.body || document.documentElement).append(dialog);
    try { dialog.showModal(); } catch { dialog.setAttribute('open', ''); }

    // A crawl's total grows as it finds files: the bar never goes back.
    let shown = 0;
    const set = (fraction) => {
      shown = Math.max(shown, Math.min(1, fraction));
      const pct = Math.round(shown * 100);
      fill.style.width = `${pct}%`;
      bar.setAttribute('aria-valuenow', String(pct));
      percent.textContent = `${pct}%`;
    };
    return {
      progress(done, total, verb = 'Fetching', one = 'file', many = 'files') {
        set(total ? done / total : 0);
        text.textContent = `${verb} ${done} of ${total} ${total === 1 ? one : many}`;
      },
      status(message, full = false) {
        if (full) set(1);
        text.textContent = message;
      },
      waiting(message) {
        dialog.classList.add('is-waiting');
        bar.removeAttribute('aria-valuenow');
        percent.textContent = '';
        text.textContent = message;
      },
      done(message) {
        dialog.classList.remove('is-waiting');
        set(1);
        title.textContent = 'All up to date';
        text.textContent = message;
      },
      fail(message) {
        dialog.classList.add('is-failed');
        title.textContent = 'Update incomplete';
        percent.textContent = '';
        text.textContent = message;
      },
      close() {
        try { dialog.close(); } catch { /* never opened as a modal */ }
        dialog.remove();
      },
    };
  },
};

//---------------------------------------------------------------------------

export const updated = check().catch((e) => {
  console.warn('checking for an update', e);
  return false;
});

/** The footer's hidden refresh: five quick clicks on its copyright line. */
export function watchCopyright(line) {
  if (!line) return;
  // Quick taps: no text selection, no double-tap zoom.
  line.style.userSelect = 'none';
  line.style.webkitUserSelect = 'none';
  line.style.touchAction = 'manipulation';
  let taps = [];
  line.addEventListener('click', () => {
    const now = performance.now();
    taps = [...taps.filter((t) => now - t < WITHIN), now];
    if (taps.length < CLICKS) return;
    taps = [];
    refresh('full');
  });
}
