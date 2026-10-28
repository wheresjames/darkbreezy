// Runs first in <head>, before any stylesheet paints: applies a forced
// Light, Dark or High contrast theme, the page width and wallpaper mode's
// dimming (from the settings, or the address), so there's no flash of the
// wrong theme or layout, or of a bright screen. Auto needs nothing: CSS follows prefers-color-scheme by itself. A classic, blocking script on purpose
// (the CSP allows no inline scripts); keep it tiny.
//
// It's also the app's way out when nothing else runs (docs/cache-bust.md):
// /?reset goes to the standalone reset page, and if the page is still empty
// some seconds after loading, a link to it appears, with any errors caught.
// /?debug opens a diagnostics panel (js/debug.js) for phones without
// developer tools; /?debug=off closes it.
(function () {
  // Errors from the start, files that failed to load included, for the
  // notice below and the diagnostics panel.
  var errors = window.darkbreezyErrors = [];
  var clip = function (s) { return String(s).replace(location.origin, '').slice(0, 300); };
  var onReset = /reset\.html$/.test(location.pathname);
  // One module asking another for something it doesn't have: old and new
  // copies of the app's files mixed (a browser reusing old ones). Fixed by
  // fetching them all again: off to the reset page, which comes back here.
  // Once a session, so a real bug can't loop; then the notice below shows.
  var STALE = /(doesn't|does not) provide an export named|import .* not found|error loading dynamically imported module/i;
  var autoReset = function (message) {
    if (onReset || !STALE.test(message)) return;
    try {
      if (sessionStorage.getItem('darkbreezy:auto-reset')) return;
      sessionStorage.setItem('darkbreezy:auto-reset', '1');
    } catch (e) { return; }
    location.replace('reset.html?auto=1&back=' + encodeURIComponent(location.hash || '#/'));
  };
  window.darkbreezyStale = autoReset;
  addEventListener('error', function (e) {
    var t = e.target;
    // Scripts and stylesheets: what start-up needs (not images, which come and go).
    if (t && t !== window && (t.tagName === 'SCRIPT' || t.tagName === 'LINK')) errors.push('failed to load ' + clip(t.src || t.href));
    else if (t && t !== window) return;
    else {
      errors.push(clip((e.message || 'error') + (e.filename ? ' (' + e.filename + ':' + e.lineno + ')' : '')));
      autoReset(e.message || '');
    }
  }, true);
  addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    errors.push('unhandled: ' + clip((r && (r.stack || r.message)) || r));
    autoReset(String((r && r.message) || r));
  });
  try {
    var dbg = new URLSearchParams(location.search).get('debug');
    if (dbg !== null) sessionStorage.setItem('darkbreezy:debug', dbg === 'off' ? '' : '1');
    if (sessionStorage.getItem('darkbreezy:debug')) {
      var sc = document.createElement('script');
      sc.src = 'js/debug.js';
      document.head.appendChild(sc);
    }
  } catch (e) { /* no storage: no panel */ }

  if (!onReset && /[?&]reset(=|&|$)/.test(location.search)) {
    location.replace('reset.html');
    return;
  }
  if (!onReset) {
    setTimeout(function () {
      var main = document.getElementById('main');
      if (!main) return;
      // Anything but the <noscript> note (its text counts when scripts run) means it started.
      for (var i = 0; i < main.childNodes.length; i++) {
        var n = main.childNodes[i];
        if (n.nodeName === 'NOSCRIPT') continue;
        if (n.textContent.trim() || (n.querySelector && n.querySelector('img, svg, video, iframe, input, textarea, select'))) return;
      }
      var box = document.createElement('div');
      box.className = 'error-box start-failed';
      var h = document.createElement('h1');
      h.textContent = 'Dark Breezy didn\'t finish starting';
      var p = document.createElement('p');
      p.textContent = 'Usually your browser kept old copies of some of its files: ';
      var a = document.createElement('a');
      a.href = 'reset.html';
      a.textContent = 'refresh the app';
      p.appendChild(a);
      p.appendChild(document.createTextNode(' (your settings are kept). Or an ad or tracker blocker stopped one of its files: try turning it off for this site.'));
      box.appendChild(h);
      box.appendChild(p);
      if (errors.length) {
        var pre = document.createElement('pre');
        pre.className = 'start-errors';
        pre.textContent = errors.slice(0, 10).join('\n');
        box.appendChild(pre);
      }
      // The report, to send to whoever looks after this copy of Dark Breezy.
      var report = function () {
        var build = '';
        try { build = (JSON.parse(localStorage.getItem('darkbreezy:deployment')) || {}).build || ''; } catch (e) { /* none */ }
        return ['Dark Breezy start-up report', 'time: ' + new Date().toISOString(), 'address: ' + location.href,
          'browser: ' + navigator.userAgent, 'screen: ' + innerWidth + 'x' + innerHeight, 'build: ' + (build || 'development (unbuilt)'), '']
          .concat(errors.length ? errors.map(function (m) { return '- ' + m; }) : ['No errors were caught: the page just stayed empty.']).join('\n');
      };
      var button = function (text, onclick) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-small';
        b.textContent = text;
        b.addEventListener('click', onclick);
        return b;
      };
      var actions = document.createElement('p');
      actions.className = 'start-actions';
      actions.appendChild(button('copy report', function () {
        var text = report();
        var done = function (ok) { this.textContent = ok ? 'copied' : 'couldn\'t copy'; }.bind(this);
        // The clipboard API is https-only; select-and-copy works on plain http too.
        if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); }); return; }
        var area = document.createElement('textarea');
        area.value = text;
        area.className = 'copy-buffer';
        document.body.appendChild(area);
        area.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        area.remove();
        done(ok);
      }));
      if (typeof navigator.share === 'function') {
        actions.appendChild(button('share report', function () { navigator.share({ title: 'Dark Breezy start-up report', text: report() }).catch(function () { /* closed */ }); }));
      }
      box.appendChild(actions);
      main.appendChild(box);
    }, 8000);
  }

  try {
    var stored = JSON.parse(localStorage.getItem('darkbreezy:settings'));
    var s = (stored && stored.data) || {};
    // The address can set these for this page (util/params.js; wallpaper apps take only a URL).
    var q = new URLSearchParams(location.search);
    var theme = q.get('theme') || s.theme;
    var width = q.get('width') || s.maxWidth;
    var on = /^(1|true|yes|on)$/i.test(q.get('wallpaper') || '');   // only ever from the address
    var dim = q.has('dim') ? Number(q.get('dim')) : (s.dim != null ? s.dim : 40);
    var html = document.documentElement;
    var forced = { light: 'light', dark: 'dark', contrast: 'dark' }[theme];
    if (forced) {
      html.setAttribute('data-theme', theme);
      html.style.colorScheme = forced;
    }
    if (Number(width) > 0) html.style.setProperty('--page-max', Number(width) + 'px');
    // Wallpaper mode: dimmed from the first frame (css/layout.css, html[data-wallpaper]::after).
    // Only the dashboard is the wallpaper: settings, search and about stay as usual.
    if (on && !onReset && !/^#\/(settings|search|about)/.test(location.hash)) {
      html.setAttribute('data-wallpaper', '');
      html.style.setProperty('--dim', String(Math.max(0, Math.min(90, dim || 0)) / 100));
    }
  } catch (e) {
    // No storage, or nothing stored: the defaults apply.
  }
})();
