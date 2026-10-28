// The not-found page (404.html), served at whatever address wasn't found.
// Dark Breezy's pages live after a "#", so an address without one that
// names a place (/place/52.52,13.41/Berlin, a share link that lost its
// "#") is sent there at once; anything else gets the page, with the
// address shown. Runs in <head> so a match moves on before anything is
// drawn; no imports, like theme-init.js.
(function () {
  'use strict';
  // The site's own path: / at a domain's root, /darkbreezy/ on GitHub Pages
  // without a custom domain (build.sh -b): where this script is, less js/.
  var base = document.currentScript ? new URL('..', document.currentScript.src).pathname : '/';
  var path = location.pathname.replace(/\/+$/, '') || '/';
  if (base !== '/' && path.indexOf(base) === 0) path = path.slice(base.length - 1);
  var m = /^\/(place\/-?\d{1,2}(\.\d+)?,-?\d{1,3}(\.\d+)?(\/[\w-]*)?|search|settings|about)$/.exec(path);
  if (m) {
    location.replace(base + '#/' + m[1] + location.search);
    return;
  }
  document.addEventListener('DOMContentLoaded', function () {
    var shown = document.getElementById('nf-path');
    if (shown) shown.textContent = decodeURIComponent(location.pathname) + location.search;
  });
})();
