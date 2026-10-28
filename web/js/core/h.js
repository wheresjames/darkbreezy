// DOM builder: h('div.thing#t3', { onclick, title: () => sig.value }, ...children)
//
// - The tag may carry .classes and an #id.
// - Props: `on<event>` adds a listener; `class` adds classes (string, array,
//   or { name: bool | () => bool }); `style` must be an object (the CSP
//   forbids style attributes); `dataset` an object; a known DOM property
//   (value, checked, hidden, disabled...) is set as a property; anything else
//   is an attribute. null/false drops it, true sets an empty attribute.
// - A function for a prop or child is reactive: it runs in an effect and the
//   DOM follows it.
// - Children: strings, numbers, nodes, arrays, null/false (skipped), or functions.
// Remote text only ever goes in through text nodes, never innerHTML.

import { reportError } from './errors.js';
import { effect, signal } from './signal.js';

const PROPS = new Set(['value', 'checked', 'selected', 'disabled', 'hidden', 'readOnly',
  'indeterminate', 'open', 'textContent', 'tabIndex', 'multiple', 'required', 'placeholder']);
const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'path', 'g', 'circle', 'rect', 'line', 'polyline', 'polygon', 'use', 'title', 'text',
  'tspan', 'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'ellipse']);

/** @param {string} tag */
function parseTag(tag) {
  const m = tag.match(/^[\w-]+/);
  const name = m ? m[0] : 'div';
  const classes = [...tag.matchAll(/\.([\w-]+)/g)].map((x) => x[1]);
  const id = tag.match(/#([\w-]+)/)?.[1];
  return { name, classes, id };
}

function setClass(el, value) {
  if (!value) return;
  if (typeof value === 'string') { for (const c of value.split(/\s+/)) if (c) el.classList.add(c); return; }
  if (Array.isArray(value)) { for (const v of value) setClass(el, v); return; }
  for (const [name, on] of Object.entries(value)) {
    if (typeof on === 'function') effect(() => { el.classList.toggle(name, !!on()); });
    else el.classList.toggle(name, !!on);
  }
}

function setStyle(el, style) {
  for (const [k, v] of Object.entries(style)) {
    const apply = (x) => {
      if (x == null || x === false) el.style.removeProperty(k);
      else if (k.startsWith('--') || k.includes('-')) el.style.setProperty(k, String(x));
      else el.style[k] = x;
    };
    if (typeof v === 'function') effect(() => apply(v()));
    else apply(v);
  }
}

function setProp(el, key, value) {
  if (PROPS.has(key) && !(el instanceof SVGElement)) {
    el[key] = value ?? (key === 'value' || key === 'textContent' ? '' : false);
  } else if (value == null || value === false) {
    el.removeAttribute(key);
  } else {
    el.setAttribute(key, value === true ? '' : String(value));
  }
}

/** Apply props to [el]. Exported for components that make their own elements. */
export function props(el, attrs) {
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'class' || key === 'className') {
      setClass(el, value);
    } else if (key === 'style') {
      if (typeof value === 'object' && value) setStyle(el, value);
    } else if (key === 'dataset') {
      for (const [k, v] of Object.entries(value)) if (v != null) el.dataset[k] = String(v);
    } else if (key === 'ref') {
      value(el);
    } else if (typeof value === 'function') {
      effect(() => setProp(el, key, value()));
    } else {
      setProp(el, key, value);
    }
  }
}

/** Turn a child into nodes appended to [parent]. */
export function append(parent, child) {
  if (child == null || child === false || child === true) return;
  if (Array.isArray(child)) { for (const c of child) append(parent, c); return; }
  if (child instanceof Node) { parent.appendChild(child); return; }
  if (typeof child === 'function') { parent.appendChild(dynamic(child)); return; }
  parent.appendChild(document.createTextNode(String(child)));
}

/**
 * A reactive region: [fn] returns text, nodes or null; whenever its signals
 * change, the region's content is replaced. Marked by two comment nodes.
 */
export function dynamic(fn) {
  const frag = document.createDocumentFragment();
  const start = document.createComment('');
  const end = document.createComment('');
  frag.append(start, end);
  let textNode = null;
  effect(() => {
    const value = fn();
    const parent = start.parentNode;
    if (!parent) return;
    // Plain text: update one text node in place.
    if (typeof value === 'string' || typeof value === 'number') {
      if (textNode && textNode.previousSibling === start && textNode.nextSibling === end) {
        textNode.data = String(value);
        return;
      }
    }
    textNode = null;
    const next = [];
    if (typeof value === 'string' || typeof value === 'number') {
      textNode = document.createTextNode(String(value));
      next.push(textNode);
    } else {
      collect(value, next);
    }
    // Nodes that stay aren't taken out and put back: that would reset what's scrolled
    // inside them (a strip of chips, the hourly chart). Only what's gone is removed,
    // and only what's out of order is moved.
    const keep = new Set(next);
    for (let n = start.nextSibling; n && n !== end;) {
      const after = n.nextSibling;
      if (!keep.has(n)) n.remove();
      n = after;
    }
    let at = start.nextSibling;
    for (const node of next) {
      if (node === at) at = at.nextSibling;
      else parent.insertBefore(node, at);
    }
  });
  return frag;
}

/** A child as the list of nodes it makes, with append()'s rules, without moving nodes already on the page. */
function collect(child, out) {
  if (child == null || child === false || child === true) return;
  if (Array.isArray(child)) { for (const c of child) collect(c, out); return; }
  if (child instanceof DocumentFragment) { out.push(...child.childNodes); return; }
  if (child instanceof Node) { out.push(child); return; }
  if (typeof child === 'function') { out.push(...dynamic(child).childNodes); return; }
  out.push(document.createTextNode(String(child)));
}

/**
 * @param {string} tag
 * @param {Record<string, any> | any} [attrs]
 * @param {...any} children
 * @returns {HTMLElement}
 */
export function h(tag, attrs, ...children) {
  const { name, classes, id } = parseTag(tag);
  const el = SVG_TAGS.has(name) ? document.createElementNS(SVG_NS, name) : document.createElement(name);
  if (classes.length) el.classList.add(...classes);
  if (id) el.id = id;
  if (attrs && typeof attrs === 'object' && !(attrs instanceof Node) && !Array.isArray(attrs)) {
    props(el, attrs);
  } else if (attrs !== undefined) {
    children.unshift(attrs);
  }
  for (const c of children) append(el, c);
  return /** @type {HTMLElement} */ (el);
}

/**
 * Append [children] to [el] with h()'s rules (null/false skipped, functions
 * reactive), unlike the DOM's own append(), which would print them.
 */
export function add(el, ...children) {
  for (const c of children) append(el, c);
  return el;
}

/** Replace [el]'s children, with h()'s rules. */
export function fill(el, ...children) {
  el.replaceChildren();
  return add(el, ...children);
}

/**
 * A region filled when [load] resolves to its content (a node, or a
 * function for a reactive region): for parts of the page whose code loads
 * on demand.
 */
export function later(load) {
  const content = signal(null);
  load().then((c) => { content.value = c; }, (e) => reportError(e, 'loading part of the page'));
  return dynamic(() => {
    const c = content.value;
    return typeof c === 'function' ? c() : c;
  });
}

/** A DocumentFragment of children. */
export function frag(...children) {
  const f = document.createDocumentFragment();
  for (const c of children) append(f, c);
  return f;
}

/**
 * The icon sprite. Named on its own, in quotes: the cache buster
 * (cache-bust.js) finds files by quoted paths, and wouldn't see one with
 * "#name" after it.
 */
export const SPRITE = 'assets/icons.svg';

/** An inline SVG icon from the sprite (SPRITE#name). */
export function icon(name, cls = '') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', `icon icon-${name} ${cls}`.trim());
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `${SPRITE}#${name}`);
  svg.appendChild(use);
  return svg;
}
