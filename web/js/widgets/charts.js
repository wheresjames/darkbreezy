// Small SVG drawing helpers for the hand-drawn charts (DARKBREEZY.md §4:
// lighter and prettier than a chart library). Every chart also gets a
// text equivalent from its widget (aria-label or a visually hidden list).

const NS = 'http://www.w3.org/2000/svg';

/** An SVG element [tag] with attributes [attrs] and [children]. */
export function s(tag, attrs = {}, ...children) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'text') el.textContent = String(v);
    else if (k === 'href') el.setAttribute('href', v);
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat()) if (c) el.appendChild(c);
  return el;
}

/** An <svg> sized by viewBox [w]×[h], labelled for screen readers when [label] is given. */
export function chart(w, h, label, ...children) {
  return s('svg', {
    viewBox: `0 0 ${w} ${h}`,
    width: w,
    height: h,
    class: 'chart',
    role: label ? 'img' : null,
    'aria-label': label || null,
    'aria-hidden': label ? null : 'true',
  }, ...children);
}

/** A smooth line through [pts] ([x, y] pairs), as path data (monotone cubic). */
export function smoothPath(pts) {
  if (!pts.length) return '';
  if (pts.length < 3) return `M${pts.map((p) => p.join(',')).join('L')}`;
  const n = pts.length;
  const dx = [];
  const m = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1][0] - pts[i][0];
    m[i] = (pts[i + 1][1] - pts[i][1]) / dx[i];
  }
  const tg = [m[0]];
  for (let i = 1; i < n - 1; i++) tg[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  tg[n - 1] = m[n - 2];
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const h = dx[i] / 3;
    d += `C${(x0 + h).toFixed(1)},${(y0 + tg[i] * h).toFixed(1)} ${(x1 - h).toFixed(1)},${(y1 - tg[i + 1] * h).toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return d;
}

/** A linear scale from [d0, d1] to [r0, r1]. */
export function scale(d0, d1, r0, r1) {
  const span = d1 - d0 || 1;
  return (v) => r0 + ((v - d0) / span) * (r1 - r0);
}

/** A color for a temperature (°C) on the cold → mild → hot ramp. */
export function tempColor(c) {
  const stops = [[-20, [120, 90, 230]], [-5, [90, 167, 255]], [8, [110, 205, 210]], [18, [246, 196, 69]], [28, [240, 101, 58]], [40, [190, 30, 60]]];
  if (c == null) return 'currentColor';
  if (c <= stops[0][0]) return `rgb(${stops[0][1]})`;
  for (let i = 1; i < stops.length; i++) {
    if (c <= stops[i][0]) {
      const [a, ca] = stops[i - 1];
      const [b, cb] = stops[i];
      const f = (c - a) / (b - a);
      return `rgb(${ca.map((v, j) => Math.round(v + (cb[j] - v) * f)).join(',')})`;
    }
  }
  return `rgb(${stops.at(-1)[1]})`;
}
