// Screenshots at phone, tablet and desktop widths in light and dark, with
// the clock and data pinned, so a visual change shows up as a diff.
//   npx playwright test layout --update-snapshots   after an intended change
import { test, expect } from '@playwright/test';
import { radarDrawn } from './fake-services.mjs';
import { openPlace, fakeServices, recordedAt, pinFont } from './fake-services.mjs';

for (const width of [360, 768, 1280, 1920]) {
  for (const scheme of ['light', 'dark']) {
    test(`dashboard ${width} ${scheme}`, async ({ page, browserName }) => {
      test.skip(browserName !== 'chromium', 'screenshots are kept for Chromium only');
      // 1920 is the large-screen layout: its 325 radar tiles arrive at RainViewer's pace (about 40 s).
      test.setTimeout(120e3);
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.setViewportSize({ width, height: 900 });
      await openPlace(page, 'berlin');
      await pinFont(page);
      // Warnings: the card's list, or on a large screen the bar.
      await expect(page.locator('.card-warnings .alert, .alert-bar .ab-event').first()).toBeVisible();
      await expect(page.locator('.card-loading')).toHaveCount(0);
      await radarDrawn(page, 90e3);
      // Let the masonry layout's last pass run (one animation frame after the last change).
      await page.waitForTimeout(300);
      // The warnings bar takes turns: masked, so the picture doesn't depend on whose turn it is.
      await expect(page).toHaveScreenshot(`dashboard-${width}-${scheme}.png`, { fullPage: true, mask: [page.locator('.alert-bar')] });
    });
  }
}

test('no horizontal scrolling at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await openPlace(page, 'nyc');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

// Masonry packing (js/widgets/masonry.js): under every card, the next card
// in its column starts one gap below, not after a hole.
for (const width of [800, 1280]) {
  test(`cards pack without holes at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openPlace(page, 'berlin');
    await expect(page.locator('.card-loading')).toHaveCount(0);
    await page.waitForTimeout(300);
    const holes = await page.locator('.grid > .card').evaluateAll((cards) => {
      const boxes = cards.map((c) => ({ id: c.dataset.widget, r: c.getBoundingClientRect() }));
      const bottom = Math.max(...boxes.map((b) => b.r.bottom));
      const out = [];
      for (const b of boxes) {
        const below = boxes.filter((o) => o !== b && o.r.top >= b.r.bottom - 1 && o.r.left < b.r.right - 1 && o.r.right > b.r.left + 1);
        if (!below.length) continue;
        const gap = Math.min(...below.map((o) => o.r.top)) - b.r.bottom;
        if (gap > 18) out.push(`${b.id}: ${Math.round(gap)} px`);
      }
      return { out, bottom };
    });
    expect(holes.out).toEqual([]);
  });
}

// The "war room" default: no page width limit, so a full-HD screen shows
// every card at once, without scrolling.
for (const id of ['berlin', 'nyc']) {
  test(`war room: every card fits on a 1920×1080 screen (${id})`, async ({ page }) => {
    // The usual (war room) grid: what 1920 × 1080 gets with the large-screen layout off.
    await page.addInitScript(() => localStorage.setItem('darkbreezy:settings', JSON.stringify({ v: 2, data: { wallMode: 'off' } })));
    await page.setViewportSize({ width: 1920, height: 1080 });
    await openPlace(page, id);
    await expect(page.locator('.card-loading')).toHaveCount(0);
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({
      columns: getComputedStyle(document.querySelector('.grid')).gridTemplateColumns.split(' ').length,
      lowest: Math.max(...[...document.querySelectorAll('.grid > *')].map((c) => c.getBoundingClientRect().bottom)),
    }));
    expect(r.columns).toBe(6);
    expect(r.lowest).toBeLessThanOrEqual(1080);
  });
}

test('page width setting: no limit by default, a cap when chosen', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openPlace(page, 'berlin');
  const pageWidth = () => page.locator('.page').evaluate((el) => el.getBoundingClientRect().width);
  const columns = () => page.locator('.grid').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(await pageWidth()).toBe(1920);
  await page.goto('./#/settings');
  await page.getByRole('radio', { name: '1180 px' }).check();
  await page.goBack();
  await page.locator('.hero-temp').waitFor();
  expect(await pageWidth()).toBeLessThanOrEqual(1180);
  expect(await columns()).toBe(3);
  // Kept across a reload, with no flash of the wide layout (theme-init.js).
  await page.reload();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--page-max').trim())).toBe('1180px');
});

test('the hero is a tile like the cards: below the favorites chips, lined up with the cards, one gap above the next', async ({ page }) => {
  const { withFavorites } = await import('./fake-services.mjs');
  for (const width of [390, 900]) {
    await page.setViewportSize({ width, height: 900 });
    await withFavorites(page, ['berlin', 'nyc', 'tokyo']);
    await openPlace(page, 'berlin');
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const hero = document.querySelector('.hero-side').getBoundingClientRect();
      // Tiles: the cards, and the map beside (or, on a phone, below) the hero.
      const cards = [...document.querySelectorAll('.grid > .card, .hero-cell > .card-map')].map((c) => c.getBoundingClientRect());
      const chips = [...document.querySelectorAll('#header .fav-chip')].map((c) => c.getBoundingClientRect().bottom);
      const below = cards.filter((c) => c.top >= hero.bottom - 1 && c.left < hero.right && c.right > hero.left).sort((p, q) => p.top - q.top)[0];
      const gap = parseFloat(getComputedStyle(document.querySelector('.grid')).columnGap);
      return { hero: { left: hero.left, right: hero.right, top: hero.top, bottom: hero.bottom }, chips: chips.length ? Math.max(...chips) : 0, belowTop: below?.top, firstLeft: Math.min(...cards.map((c) => c.left)), gap, radius: getComputedStyle(document.querySelector('.hero-side')).borderTopLeftRadius, cardRadius: getComputedStyle(document.querySelector('.grid > .card')).borderTopLeftRadius };
    });
    expect(r.hero.top, `${width}: below the chips`).toBeGreaterThanOrEqual(r.chips);
    expect(Math.round(r.hero.left), `${width}: lined up with the cards`).toBe(Math.round(r.firstLeft));
    // One gap (the masonry rounds heights up to its 4 px rows).
    const space = r.belowTop - r.hero.bottom;
    expect(space, `${width}: one gap above the next tile`).toBeGreaterThanOrEqual(r.gap - 0.5);
    expect(space, `${width}: one gap above the next tile`).toBeLessThan(r.gap + 4);
    expect(r.radius).toBe(r.cardRadius);
  }
});

test('the "Updated" line lines up with the hero text above it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await openPlace(page, 'berlin');
  const [text, updated] = await page.evaluate(() => ['.hero-place', '.updated > span'].map((s) => document.querySelector(s).getBoundingClientRect().left));
  expect(Math.round(updated)).toBe(Math.round(text));
});

test('going from place to place, the hero keeps its width: one digit or two, a short name or a long one', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.clock.setFixedTime(recordedAt('berlin'));
  await fakeServices(page);
  // Whatever the system's font: digits differ in width from one to the next (the system
  // default here, and what a Linux CI runner falls back to).
  for (const font of ['', 'DejaVu Sans', 'Liberation Sans']) {
    const sizes = new Set();
    // In °C the recorded weather reads 11° (Berlin), 9° (Tromsø) and 18° (Sydney).
    for (const [c, n] of [['52.52,13.41', 'Berlin'], ['69.65,18.96', 'Tromsø'], ['-33.87,151.21', 'Sydney, New South Wales, a much longer name']]) {
      await page.goto(`./?units=metric#/place/${c}/x?n=${encodeURIComponent(n)}`);
      await page.locator('.hero-temp').waitFor();
      sizes.add(await page.evaluate(async (f) => {
        if (f) document.documentElement.style.setProperty('--font-ui', `"${f}", sans-serif`);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        return [document.querySelector('.hero-side'), document.querySelector('.hero-icon')].map((e) => Math.round(e.getBoundingClientRect()[e.matches('svg') ? 'left' : 'width'])).join();
      }, font));
    }
    expect([...sizes], font || 'the system font').toHaveLength(1);
  }
});
