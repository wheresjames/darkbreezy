// The diagnostics panel (/?debug, theme-init.js loads it; /?debug=off ends
// it): what a phone without developer tools can show and copy. Errors
// caught from the start, the screen and settings, what fills the page and
// what's in the middle of the screen (a black page: what covers it?), the
// offline worker, the build and what's stored. On its own (no imports), so
// it works when the app doesn't.
(function () {
  'use strict';
  var panel = null;

  function line(k, v) { return k + ': ' + v; }

  function describe(el) {
    if (!el) return '(nothing)';
    var s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    if (typeof el.className === 'string' && el.className.trim()) s += '.' + el.className.trim().split(/\s+/).slice(0, 4).join('.');
    return s;
  }

  function chain(el) {
    var out = [];
    for (var i = 0; el && i < 6; i++, el = el.parentElement) out.push(describe(el));
    return out.join(' < ');
  }

  async function report() {
    var html = document.documentElement;
    var main = document.getElementById('main');
    var header = document.getElementById('header');
    var cs = function (el, p) { return el ? getComputedStyle(el).getPropertyValue(p) : '-'; };
    var r = [];
    r.push(line('time', new Date().toISOString()));
    r.push(line('address', location.pathname + location.search + location.hash));
    r.push(line('browser', navigator.userAgent));
    r.push(line('screen', innerWidth + 'x' + innerHeight + ' @' + devicePixelRatio + (matchMedia('(pointer: coarse)').matches ? ', touch' : '') + (matchMedia('(prefers-color-scheme: dark)').matches ? ', system dark' : ', system light')));
    r.push(line('html', ['data-theme', 'data-density', 'data-display'].map(function (a) { return a.slice(5) + '=' + (html.getAttribute(a) || '-'); }).join(' ') + ' font-scale=' + (html.style.getPropertyValue('--font-scale') || '1')));
    r.push(line('body', (document.body.className || '-') + '; color ' + cs(document.body, 'color') + ' on ' + cs(document.body, 'background-color')));
    r.push(line('header', header ? header.getBoundingClientRect().height + 'px, ' + header.childElementCount + ' parts' : 'missing'));
    if (main) {
      var b = main.getBoundingClientRect();
      r.push(line('main', main.childElementCount + ' children, ' + main.textContent.trim().length + ' chars, ' + Math.round(b.width) + 'x' + Math.round(b.height) + ' at y=' + Math.round(b.top) + ', display ' + cs(main, 'display') + ', visibility ' + cs(main, 'visibility')));
      r.push(line('main text', JSON.stringify(main.textContent.trim().slice(0, 120))));
    } else r.push('main: missing');
    r.push(line('middle of screen', chain(document.elementFromPoint(innerWidth / 2, innerHeight / 2))));
    r.push(line('lower screen', chain(document.elementFromPoint(innerWidth / 2, innerHeight * 0.8))));
    var sw = '-';
    try {
      if (navigator.serviceWorker) {
        var regs = await navigator.serviceWorker.getRegistrations();
        sw = (navigator.serviceWorker.controller ? 'controlling' : 'not controlling') + ', ' + regs.length + ' registered';
      }
    } catch (e) { sw = 'error ' + e.message; }
    r.push(line('offline worker', sw));
    try {
      var d = JSON.parse(localStorage.getItem('darkbreezy:deployment') || 'null');
      r.push(line('build', d ? d.build + ' (' + (d.built || '?') + ')' + (d.files ? '' : ', no file list') : 'none (unbuilt, or first visit)'));
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf('darkbreezy:') === 0) keys.push(k.slice(11) + ' ' + (localStorage.getItem(k) || '').length);
      }
      r.push(line('stored', keys.sort().join(', ') || '(nothing)'));
      var st = JSON.parse(localStorage.getItem('darkbreezy:settings') || 'null');
      if (st && st.data) {
        var s = st.data;
        r.push(line('settings', 'theme=' + s.theme + ' units=' + s.units + ' clock=' + s.clock + ' hidden=' + (s.hidden || []).join('|')));
      }
      var fav = JSON.parse(localStorage.getItem('darkbreezy:favorites') || 'null');
      if (fav && fav.data) r.push(line('favorites', (fav.data.list || []).length + ' places'));
    } catch (e) { r.push('storage: ' + e.message); }
    // Files the server answered with an error (where the browser says: a
    // module that fails takes the whole app down, reported only as main.js).
    try {
      var bad = performance.getEntriesByType('resource').filter(function (e) { return e.responseStatus >= 400; })
        .map(function (e) { return e.name.replace(location.origin, '') + ' ' + e.responseStatus; });
      if (bad.length) r.push(line('failed files', bad.slice(0, 10).join(', ')));
    } catch (e) { /* not available */ }
    var errs = window.darkbreezyErrors || [];
    r.push(line('errors', errs.length ? '' : 'none'));
    errs.slice(-20).forEach(function (e) { r.push('  ' + e); });
    return r.join('\n');
  }

  function button(text, onclick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-small';
    b.textContent = text;
    b.addEventListener('click', onclick);
    return b;
  }

  async function show() {
    if (!panel) {
      panel = document.createElement('section');
      panel.className = 'darkbreezy-debug';
      panel.setAttribute('aria-label', 'Dark Breezy diagnostics');
      var bar = document.createElement('div');
      bar.className = 'darkbreezy-debug-bar';
      var title = document.createElement('strong');
      title.textContent = 'Dark Breezy diagnostics';
      var pre = document.createElement('pre');
      bar.appendChild(title);
      bar.appendChild(button('refresh', show));
      bar.appendChild(button('copy', async function () {
        try { await navigator.clipboard.writeText(pre.textContent); this.textContent = 'copied'; } catch (e) {
          var range = document.createRange(); range.selectNodeContents(pre);
          var sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
          this.textContent = 'selected: copy it';
        }
      }));
      bar.appendChild(button('hide', function () { panel.hidden = !panel.hidden; }));
      bar.appendChild(button('turn off', function () { try { sessionStorage.removeItem('darkbreezy:debug'); } catch (e) { /* */ } panel.remove(); panel = null; }));
      panel.appendChild(bar);
      panel.appendChild(pre);
      document.body.appendChild(panel);
    }
    panel.hidden = false;
    panel.querySelector('pre').textContent = await report();
  }

  // After the app has had its chance to start.
  function start() { setTimeout(show, 3000); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
  addEventListener('hashchange', function () { setTimeout(show, 1500); });
})();
