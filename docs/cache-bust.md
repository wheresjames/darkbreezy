# Updates and cache busting

How a static, client-only site keeps visitors on its latest files without a
service worker serving stale code, and how it recovers when a browser ends up
with a mix of old and new files.

- **Built site:** [`web/js/update.js`](../web/js/update.js) runs at startup. `main.js` waits for its check of a small `deployment.json`. When the build differs from the one stored in this browser, the updater fetches the new file list, refreshes the changed files, and reloads.
- **While the app stays open:** it checks again when the tab comes back to the front and every 30 minutes. A new build found then shows a banner ("A new version is available · Reload") and installs at the next route change, or on a click on Reload.
- **Unbuilt `web/` (development):** there's no `deployment.json`. A manual refresh uses [`web/js/cache-bust.js`](../web/js/cache-bust.js) to crawl the app from `/`.

An update only refreshes files. What the app keeps in `localStorage` (settings, saved data) is never touched.

Storage keys below use the app's prefix, written `<app>:` (for example `<app>:deployment`).

| Trigger | Behavior |
|---|---|
| Click the footer's copyright line five times within 2.5 seconds | Refresh every eligible file, then reload. |
| `?update` before the hash (`/?update#/some/route`) | Same. |
| `?update=diff` | Compare with the stored file list, as if a new build had appeared. |
| Settings › Advanced › App files › Refresh | Same as `?update`. |
| `/?reset`, `reset.html`, or the footer's reset link | The standalone reset page (below), for when the app won't start. |

The updater removes `update` from the address before reloading, so it doesn't repeat. The hash route is kept, so you land where you were.

"Eligible" means a file listed by the build, or found by the development crawler, that is **no larger than 2 MiB**. `js/cache-bust.js` is never listed: the updater imports it itself when needed.

## When the app won't start: the reset page

`?update` and the other triggers are run by the app, so they need it to start. A browser that kept old copies of some files and fetched new ones of others can leave it unable to: a header and an empty page. (A host that ignores `server.json`'s `no-cache` rules is the usual cause.) For that there is [`reset.html`](../web/reset.html) with [`js/reset.js`](../web/js/reset.js), which share no code with the app:

1. It unregisters the offline worker and deletes its caches.
2. It fetches every file in the installed build's list again with `cache: 'reload'`, and records that build as installed, so the app doesn't start another refresh. On the unbuilt site (no list) it crawls instead. There it imports `js/cache-bust.js` from a new address (`?fresh=…`), so the copy doing the crawling can't itself be a stale one.
3. It offers a link back to the app, and below it a button to erase the app's data in this browser (every `<app>:` key, after a confirmation) for when stored data is the problem.

Ways in that don't need the app:

- **`/?reset`:** `js/theme-init.js` (a classic script that runs before anything else) sends it to `reset.html`.
- **An empty page:** the same script checks, 8 seconds after loading, that the page isn't still empty. If it is, the script puts a "didn't finish starting · refresh the app" notice there, with the start-up errors and a report to copy.
- **Links:** the footer and Settings › Advanced link to the reset page too.
- **Mixed files:** a module asking another for an export it doesn't have ("doesn't provide an export named…") is the unmistakable sign of old and new files mixed. `theme-init.js` then sends the page to `reset.html?auto=1` by itself, which refetches everything and comes straight back. It does this once a browser session, so a real bug shows the notice instead of looping.

## Errors after start-up

[`web/js/core/errors.js`](../web/js/core/errors.js) keeps unexpected errors in `<app>:errors`, the latest 50, with repeats counted. That covers:

- uncaught errors and unhandled rejections;
- what the app catches and would otherwise only log: a failing effect, view or lazily loaded part.

Network trouble, cancelled requests and errors from browser extensions are left out. Settings › Advanced lists the errors, with copy and clear. Before start-up, `theme-init.js`'s notice has its own copy of the errors (it can't rely on the app's code).

## Build and output

```sh
./scripts/build.sh -o ./dist -c -z
```

**Options:**

- `-o` sets the output folder (default `dist`).
- `-c` clears old output.
- `-z` writes `.gz` copies and sets `precompressed` in `server.json`. Without it, old `.gz` copies are removed.
- `-b` sets the base path, for a site served from a subfolder.

**What happens to each kind of file:**

- **JS and CSS** are minified one file at a time with esbuild. Imports stay imports and names stay names, so the source still runs unbuilt.
- **HTML** goes through html-minifier-terser; **JSON and SVG** are compacted.
- **Pre-minified files:** files named `*.min.*` and everything in `web/vendor/` (if there is one) are copied untouched, so any SRI hashes for them stay valid.
- **A safety check:** every minified script is parsed with `node --check`, and the deployment files are only written when they all parse.
- **The not-found page:** `web/404.html` is the page hosts send for unknown addresses (`server.json`'s `notFound`); `scripts/serve.mjs` sends it too.

The minifiers are pinned (esbuild 0.28.2, html-minifier-terser 7.2.0) and installed once into `$WJ_TOOLS` (default `~/.cache/wheresjames-tools`); nothing is installed globally.

| Source | Output | Purpose |
|---|---|---|
| `web/` | `dist/web/` | The public web root, including `deployment.json` and its file list. |
| `server/` | `dist/server/` | `server.json`, the serving rules; never part of the web root. |

### Deployment files

```json
{"build":"63d76efdd1bc8d1f","built":"2026-10-25T19:37:37Z","commit":"f567dcf+changes","files":"files-63d76efdd1bc8d1f.json"}
```

`deployment.json` has four fields:

- **`build`:** the build ID, the first 16 hex digits of a SHA-256 over the sorted listed paths and hashes. A rebuild that changes nothing refreshable changes nothing for visitors.
- **`built`:** the build time, in UTC.
- **`commit`:** the commit it was built from, with `+changes` when built from uncommitted changes.
- **`files`:** the name of its file list.

`files-<build>.json` lists each eligible path with the first 16 hex digits of its built file's SHA-256. Old lists are removed. Publish `deployment.json` last (see `server/server.json`'s `publish`).

## Automatic update

`deployment.json?t=<time>` is fetched with `cache: 'no-store'` and a 3-second timeout. A missing file (development), being offline, or a timeout ends the check quietly and the app starts.

| Browser state | Result |
|---|---|
| First visit (none of the app's keys in `localStorage`) | Remember the build without refreshing; fetch its list when idle. |
| Same stored build | Nothing. Fetch the list when idle if it wasn't stored yet. |
| New build and a stored list | Show the dialog and refresh the files whose hashes differ, then reload. |
| New build but no old list, or app data with no stored build | Refresh the whole eligible list. |
| New list with only removals | Store it; no dialog. |
| New build found while the app is open | Banner; install at the next route change or on Reload. |
| No `localStorage` | Every visit is a first visit. |

Every listed HTML page is also fetched, as both `index.html` and `/` (and `404.html`, whose 404 status counts as success). Pages are scanned for query-stamped addresses (`?v=`) of changed files, which are fetched too.

### Failure and concurrency

- **Only complete updates are stored.** The new build is recorded only after every requested file succeeds. If a file fails, the dialog reports an incomplete update and closes, and the app carries on; the next session tries again.
- **No reload loops.** The `sessionStorage` key `<app>:update-tried` records the build attempted this session, so a stale `deployment.json` can't cause a reload loop.
- **One tab at a time.** A `localStorage` lock (`<app>:update-lock`) lets one tab update while the others wait, then reload. A lock older than two minutes is abandoned.
- **The installed build** and its list are in `<app>:deployment`. Settings › Advanced shows the build, for bug reports.

## Development crawler

Without `deployment.json`, manual triggers call `refreshAll` in `cache-bust.js`. It starts at `/` and `/index.html` and follows:

- pages' `src` and `href`;
- CSS `url()` and `@import`;
- JavaScript imports and quoted file paths;
- paths in JSON and the web manifest.

Every app module is reached through imports from `js/main.js`, so the crawl finds the whole app. Only same-origin paths under the site root are followed, and responses over 2 MiB are cancelled.

### Why the reload is forced

`fetch(url, { cache: 'reload' })` replaces the HTTP cache entry for that address, but Firefox also keeps parsed stylesheets and images in memory. So both paths (the updater and the crawler) do two more things:

1. They load the refreshed stylesheets and images in a hidden `blob:` iframe and force-reload it.
2. They force-reload the page with `location.reload(true)` (other browsers ignore the argument).

The CSP's `frame-src blob:` is there for this.

## The offline worker

`web/sw.js` is registered by `main.js`, only on a built site. It keeps the files in the installed build's list for offline use, and nothing else:

- **Network first, always.** Requests for the app's own files go to the network with the cache mode the page asked for, so the updater's `cache: 'reload'` still bypasses everything. The worker's copy is used only when the network fails, so it can't keep a stale app alive.
- **One list.** After each start, the page posts the installed build's file list (`<app>:deployment`) to the worker, which fetches what's missing and drops what's no longer listed.
- **Its own files only.** It never touches `deployment.json`, or requests to other origins (the data services the app calls).

The E2E tests block service workers (`serviceWorkers: 'block'` in `playwright.config.mjs`), since a worker would answer requests the tests fake.

## Keeping it working

- Keep the 2 MiB limit in step between `scripts/build.sh` and `web/js/cache-bust.js`.
- Don't name files like the ones ad and tracker blockers block (`share.js`, `ads.js`, `banner…`, `tracking…`). A blocked file the app imports stops it from starting, which is hard to tell from a cache problem. `/?debug` shows what failed on a device without developer tools.
- New modules must be imported from somewhere under `js/main.js` (statically, or with `import()` of a literal path), or the development crawler won't find them. The built list covers everything regardless.
- The dialog's styles are in `web/css/update.css` (the CSP allows no inline styles) and use the theme tokens.
- **Testing:** `tests/e2e/reset.spec.mjs` covers the reset page. To check an update by hand:
  1. Serve `dist/web` and open the app.
  2. Rebuild with one changed file.
  3. Check that the open tab shows the banner, and that a new tab refreshes only that file.

  Also try `?update`, `?update=diff` and the footer trigger on both `dist/web` and `web/`.
