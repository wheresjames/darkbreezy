// Masonry packing for the dashboard's grid. The grid's rows are thin
// (css/layout.css, --row) and this places every cell itself: in order,
// each goes where its columns are shortest (the leftmost such place on a
// tie), spanning as many rows as its content needs. Cells spanning several
// columns (the hero with its map, Hourly, 10 days) keep their CSS column
// span.
//
// A multi-column cell has to start below the tallest of its columns, so
// the last cell in each of the shorter ones is stretched down to meet it
// (class "fill"): the band ends flush, like a table row. At the end the
// last cell of every column stretches to the bottom of the longest one.
// Cells marked "no-fill" (the hero: its map would grow with it) aren't
// stretched.
//
// Heights are re-measured whenever a cell changes size (data arriving, a
// warning opened), and everything is placed again in the next frame.
// Browsers with native masonry need none of this.

const NATIVE = typeof CSS !== 'undefined' && CSS.supports('grid-template-rows', 'masonry');

/**
 * A cell's height from its content, whatever its grid area stretches it to,
 * in layout px: on-screen sizes are divided by any scaling around the grid
 * (wallpaper mode scales the whole layout to fit the screen).
 */
export function naturalHeight(el) {
  const scale = el.offsetWidth ? el.getBoundingClientRect().width / el.offsetWidth : 1;
  return onScreenHeight(el) / (scale || 1);
}

function onScreenHeight(el) {
  // The last child that's drawn and in the flow: a hidden one (display: none) measures as 0,
  // and a floating one (a panel opened from the cell) isn't part of its height.
  const inFlow = (c) => c.getClientRects().length && !/^(fixed|absolute)$/.test(getComputedStyle(c).position);
  let last = el.lastElementChild;
  while (last && !inFlow(last)) last = last.previousElementSibling;
  if (!last) return el.getBoundingClientRect().height;
  const cs = getComputedStyle(el);
  const scale = el.offsetWidth ? el.getBoundingClientRect().width / el.offsetWidth : 1;
  // Padding, border and margin are layout px: bring them to screen px like the rest.
  return last.getBoundingClientRect().bottom - el.getBoundingClientRect().top
    + (parseFloat(cs.paddingBottom) + parseFloat(cs.borderBottomWidth) + parseFloat(getComputedStyle(last).marginBottom)) * scale;
}

/**
 * Where cells go: [items] = [{ span: columns, rows, fill: may stretch }] in
 * order, in a grid of [columns]. Returns per item { col, row, rows, span }
 * (0-based start column and row; rows after stretching) and the total
 * height in rows. Pure, so it's unit tested.
 *
 * Before a multi-column item, later one-column items that fit the holes
 * above it (within [slack] rows) move up into them, as CSS's "dense" does.
 */
export function pack(items, columns, { slack = 12 } = {}) {
  const heights = new Array(columns).fill(0);
  const lastIn = new Array(columns).fill(-1);   // the item ending each column
  const out = items.map(() => null);
  const spanOf = (it) => Math.min(Math.max(1, it.span), columns);
  const put = (i, col, row) => {
    const span = spanOf(items[i]);
    out[i] = { col, row, rows: items[i].rows, span };
    for (let c = col; c < col + span; c++) { heights[c] = row + items[i].rows; lastIn[c] = i; }
  };
  const stretch = (c, to) => {
    const i = lastIn[c];
    if (i < 0 || !items[i].fill || heights[c] >= to) return;
    const p = out[i];
    // A cell spanning several columns can stretch only if it ends all of them.
    for (let k = p.col; k < p.col + p.span; k++) if (lastIn[k] !== i) return;
    if (p.row + p.rows >= to) return;
    p.rows = to - p.row;
    for (let k = p.col; k < p.col + p.span; k++) heights[k] = to;
  };
  /** Best start column for a [span]-wide item, and the row it starts at. */
  const where = (span) => {
    let best = 0;
    let top = Infinity;
    for (let s = 0; s + span <= columns; s++) {
      const t = Math.max(...heights.slice(s, s + span));
      if (t < top) { top = t; best = s; }
    }
    return { col: best, row: top };
  };
  for (let i = 0; i < items.length; i++) {
    if (out[i]) continue;
    const span = spanOf(items[i]);
    if (span > 1) {
      // Backfill: the holes above it, with later one-column items that fit.
      for (let moved = true; moved;) {
        moved = false;
        const { col, row } = where(span);
        for (let c = col; c < col + span && !moved; c++) {
          const gap = row - heights[c];
          if (gap <= 0) continue;
          const j = items.findIndex((it, k) => k > i && !out[k] && spanOf(it) === 1 && it.rows <= gap + slack);
          if (j >= 0) { put(j, c, heights[c]); moved = true; }
        }
      }
      const { col, row } = where(span);
      for (let c = col; c < col + span; c++) if (heights[c] < row) stretch(c, row);
      put(i, col, row);
    } else {
      const { col, row } = where(1);
      put(i, col, row);
    }
  }
  const bottom = Math.max(0, ...heights);
  for (let c = 0; c < columns; c++) stretch(c, bottom);
  return { places: out, rows: bottom };
}

/** Pack [grid]'s cells; returns the way to stop. */
export function masonry(grid) {
  if (NATIVE) {
    grid.classList.add('masonry-native');
    return () => {};
  }
  grid.classList.add('masonry');
  let frame = 0;
  const heights = new WeakMap();   // cell → px its content needs

  const cells = () => [...grid.children];
  const measure = (el) => {
    const h = naturalHeight(el);
    if (Math.abs((heights.get(el) ?? -1) - h) < 0.5) return false;
    heights.set(el, h);
    return true;
  };

  const layout = () => {
    frame = 0;
    const all = cells();
    // Back to what CSS says (column spans), then read it all, then write it all.
    for (const el of all) { el.style.removeProperty('grid-column'); el.style.removeProperty('grid-row'); el.classList.remove('fill'); }
    const cs = getComputedStyle(grid);
    const columns = cs.gridTemplateColumns.split(' ').filter(Boolean).length;
    if (columns < 2) return;
    const row = parseFloat(cs.getPropertyValue('--row')) || 4;
    const gap = parseFloat(cs.columnGap) || 0;
    const items = all.map((el) => {
      const c = getComputedStyle(el);
      // "span 2" sits in grid-column-start ("grid-column: span 2") or -end; "1 / -1" is every column.
      const spanOf = (v) => Number((String(v).match(/span (\d+)/) || [])[1]) || 0;
      const span = c.gridColumnEnd === '-1' ? columns : spanOf(c.gridColumnStart) || spanOf(c.gridColumnEnd) || 1;
      return { span, fill: !el.classList.contains('no-fill') };
    });
    // Heights after the column spans are back: a cell's height depends on its width.
    all.forEach((el, i) => { measure(el); items[i].rows = Math.max(1, Math.ceil((heights.get(el) + gap) / row)); });
    const { places } = pack(items, columns);
    places.forEach((p, i) => {
      const el = all[i];
      el.style.gridColumn = `${p.col + 1} / span ${p.span}`;
      el.style.gridRow = `${p.row + 1} / span ${p.rows}`;
      el.classList.toggle('fill', p.rows > items[i].rows);
    });
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(layout); };

  const sizes = new ResizeObserver((entries) => {
    let changed = false;
    for (const e of entries) if (e.target.parentNode === grid && measure(e.target)) changed = true;
    if (changed) schedule();
  });
  // Cells are replaced when their data changes: watch the new ones.
  const watch = () => { for (const c of cells()) sizes.observe(c); schedule(); };
  const children = new MutationObserver(watch);
  children.observe(grid, { childList: true });
  // The column count and widths change with the window.
  let width = 0;
  const resize = new ResizeObserver(([e]) => {
    if (Math.abs(e.contentRect.width - width) < 1) return;
    width = e.contentRect.width;
    schedule();
  });
  resize.observe(grid);
  watch();

  return () => {
    cancelAnimationFrame(frame);
    sizes.disconnect();
    children.disconnect();
    resize.disconnect();
  };
}

/**
 * The packed height (px) of cells of [heights] px ([spans] columns each)
 * in a grid of [columns], with rows of [row] px and gaps of [gap] px.
 */
export function packedHeight(cells, columns, { row = 4, gap = 10 } = {}) {
  if (!cells.length) return 0;
  const items = cells.map((c) => ({ span: c.span || 1, rows: Math.max(1, Math.ceil((c.height + gap) / row)), fill: true }));
  return pack(items, columns, { slack: 0 }).rows * row - gap;
}

/**
 * Which cards to show full, compact or not at all so they fit [room] px:
 * [cards] = [{ id, span, full, compact }] (heights in px), most wanted
 * first. Tries more and more of them compact from the end of the list, then
 * all compact with more and more dropped from the end ([more]: the height
 * of a "+N more" cell to add once any are dropped, or 0 for none).
 * Returns { level: { id: 'full' | 'compact' }, dropped: [ids], fits }.
 */
export function chooseLevels(cards, columns, room, { row = 4, gap = 10, more = 0 } = {}) {
  const n = cards.length;
  const height = (k, d) => packedHeight([
    ...cards.slice(0, n - d).map((c, i) => ({ span: c.span, height: i >= n - k ? c.compact : c.full })),
    ...(d && more ? [{ span: 1, height: more }] : []),
  ], columns, { row, gap });
  const result = (k, d, fits) => ({
    level: Object.fromEntries(cards.slice(0, n - d).map((c, i) => [c.id, i >= n - k ? 'compact' : 'full'])),
    dropped: cards.slice(n - d).map((c) => c.id),
    fits,
  });
  for (let k = 0; k <= n; k++) if (height(k, 0) <= room) return result(k, 0, true);
  for (let d = 1; d <= n; d++) if (height(n, d) <= room) return result(n, d, true);
  return result(n, n, false);
}
