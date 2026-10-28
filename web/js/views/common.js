// Small pieces the views share.

import { h } from '../core/h.js';

/** The tab's title: "Berlin · Dark Breezy", or just the app's name. */
export function setTitle(name) {
  document.title = name ? `${name} · Dark Breezy` : 'Dark Breezy';
}

export const spinner = (text) => h('div.spinner', { role: 'status' }, text);

/** Debounce [fn] by [ms]; the returned function has .cancel(). */
export function debounce(fn, ms) {
  let timer = 0;
  const d = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  d.cancel = () => clearTimeout(timer);
  return d;
}
