// The reset page (reset.html, also /?reset): for when Dark Breezy won't start,
// often because a phone kept old copies of some files and fetched new ones
// of others. On its own on purpose: no imports, nothing shared with the
// app, so a broken or mismatched app file can't stop it. It
//   1. unregisters the offline worker and deletes its caches,
//   2. fetches every file of the installed build again (deployment.json's
//      list) past the browser's cache, and records that build as installed,
//      On the unbuilt site (no deployment.json, so no list) it crawls
//      instead, with a copy of js/cache-bust.js fetched fresh (a new
//      address, so not the cached one): every file the pages and scripts
//      refer to, again. A plain development server sends no caching rules,
//      and a phone may reuse old copies of anything until then.
//   3. offers to open Dark Breezy.
// Settings, places and the rest stay unless "Erase" is pressed.
(function () {
  'use strict';
  var STORE = 'darkbreezy:deployment';
  var AT_ONCE = 6;
  var steps = document.getElementById('reset-steps');
  var root = new URL('./', location.href);

  function say(text, cls) {
    var li = document.createElement('li');
    li.textContent = text;
    if (cls) li.className = cls;
    steps.appendChild(li);
    return li;
  }

  function forget(area, key) { try { area.removeItem(key); } catch (e) { /* storage refused */ } }

  async function stopOfflineCopy() {
    var n = 0;
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      // Only Dark Breezy's: another site on this origin (a folder beside it) keeps its own.
      var regs = await navigator.serviceWorker.getRegistrations();
      for (var i = 0; i < regs.length; i++) if (regs[i].scope.indexOf(root.href) === 0 && await regs[i].unregister()) n++;
    }
    var c = 0;
    // sw.js's cache.
    if (window.caches && await caches.delete('darkbreezy-shell')) c++;
    say(n || c ? 'Cleared the offline copy.' : 'No offline copy to clear.', 'ok');
  }

  async function json(url, cache) {
    var r = await fetch(url, { cache: cache });
    if (!r.ok) throw new Error(r.status + ' ' + url);
    return r.json();
  }

  /** Every file of the build, again; resolves to the deployment, or null without one. */
  async function refetchAll() {
    var deployment = null;
    try { deployment = await json(new URL('deployment.json?t=' + Date.now(), root), 'no-store'); } catch (e) { /* the unbuilt site */ }
    var pages = ['./', 'index.html'];
    var list = null;
    if (deployment && typeof deployment.files === 'string' && /^files-[0-9a-f]+\.json$/.test(deployment.files)) {
      list = await json(new URL(deployment.files, root), 'reload');
    }
    if (!list) return crawl();
    var paths = list.files ? Object.keys(list.files) : [];
    var todo = pages.concat(paths.filter(function (p) { return pages.indexOf(p) < 0; }));
    var line = say('Fetching the app\'s files…');
    var done = 0;
    var failed = [];
    var next = 0;
    async function worker() {
      while (next < todo.length) {
        var path = todo[next++];
        try {
          var r = await fetch(new URL(path, root), { cache: 'reload' });
          // The not-found page answers 404 on purpose.
          if (!r.ok && !(r.status === 404 && /404\.html$/.test(path))) failed.push(path);
          await r.arrayBuffer();
        } catch (e) { failed.push(path); }
        done++;
        line.textContent = 'Fetching the app\'s files: ' + done + ' of ' + todo.length + '…';
      }
    }
    var workers = [];
    for (var i = 0; i < AT_ONCE; i++) workers.push(worker());
    await Promise.all(workers);
    if (failed.length) {
      line.textContent = 'Fetched ' + (todo.length - failed.length) + ' of ' + todo.length + ' files; ' + failed.length + ' failed (are you online?).';
      line.className = 'bad';
    } else {
      line.textContent = 'Fetched all ' + todo.length + ' of the app\'s files again.';
      line.className = 'ok';
    }
    if (deployment && list && !failed.length) {
      // Installed: the app won't start another refresh when it opens.
      try {
        localStorage.setItem(STORE, JSON.stringify({ build: deployment.build, built: deployment.built, commit: deployment.commit, files: list.files }));
      } catch (e) { /* storage refused: it checks again, harmlessly */ }
    }
    return deployment;
  }

  /** The unbuilt site: the app's crawler, itself fetched afresh. */
  async function crawl() {
    var line = say('Finding and fetching the app\'s files…');
    var crawler = await import(new URL('js/cache-bust.js?fresh=' + Date.now(), root).href);
    var n = await crawler.refreshAll(function (done, total) {
      line.textContent = 'Fetching the app\'s files: ' + done + ' of ' + total + '…';
    });
    line.textContent = 'Fetched all ' + n + ' of the app\'s files again.';
    line.className = 'ok';
    return null;
  }

  async function run() {
    if (new URLSearchParams(location.search).get('auto') === '1') say('Dark Breezy found old copies of some of its files mixed with new ones, and is fetching them all again.');
    forget(window.localStorage, 'darkbreezy:update-lock');
    forget(window.sessionStorage, 'darkbreezy:update-tried');
    try { await stopOfflineCopy(); } catch (e) { say('Couldn\'t clear the offline copy: ' + e.message, 'bad'); }
    var deployment = null;
    try { deployment = await refetchAll(); } catch (e) { say('Couldn\'t fetch the app\'s files: ' + e.message, 'bad'); }
    var open = document.getElementById('reset-open');
    open.href = './#/';
    say('Done.', 'ok');
    // Sent here by the app itself (theme-init.js: mixed old and new files):
    // straight back to where it was, unless something failed.
    var q = new URLSearchParams(location.search);
    if (q.get('auto') === '1' && !document.querySelector('#reset-steps .bad')) {
      var back = q.get('back') || '#/';
      say('Going back to Dark Breezy…');
      location.replace('./' + (back.charAt(0) === '#' ? back : '#/'));
      return;
    }
    document.getElementById('reset-done').hidden = false;
    document.getElementById('reset-more').hidden = false;
    open.focus();
  }

  document.getElementById('reset-erase').addEventListener('click', function () {
    if (!window.confirm('Erase all of Dark Breezy\'s settings, places and saved weather in this browser?')) return;
    try {
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf('darkbreezy:') === 0) keys.push(k); }
      keys.forEach(function (k) { localStorage.removeItem(k); });
      sessionStorage.clear();
      say('Erased Dark Breezy\'s data in this browser (' + keys.length + ' items).', 'ok');
    } catch (e) {
      say('Couldn\'t erase it: ' + e.message + '. Clearing this site\'s data in your browser\'s settings does the same.', 'bad');
    }
  });

  run();
})();
