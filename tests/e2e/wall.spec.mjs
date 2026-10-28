// The large-screen ("wall") layout: views/dashboard.js, views/wall.js.
import { test, expect } from '@playwright/test';
import { radarDrawn } from './fake-services.mjs';
import { openPlace, withFavorites, pinFont } from './fake-services.mjs';

const FAVS = ['berlin', 'nyc', 'tokyo', 'sydney', 'tromso', 'nairobi'];
const measure = (page) => page.evaluate(() => ({
  wall: document.body.classList.contains('wall-mode'),
  scroll: document.documentElement.scrollHeight - innerHeight,
  columns: getComputedStyle(document.querySelector('.instruments')).gridTemplateColumns.split(' ').length,
  features: [...document.querySelectorAll('.feature')].map((f) => f.className.replace('feature ', '')),
  pairDirection: getComputedStyle(document.querySelector('.feature-pair')).flexDirection,
}));

test('an ultrawide screen: feature tiles above, instruments below, filling the window exactly', async ({ page }) => {
  await page.setViewportSize({ width: 3440, height: 1300 });
  await withFavorites(page, FAVS);
  await openPlace(page, 'berlin');
  await page.waitForTimeout(400);
  const r = await measure(page);
  expect(r.wall).toBe(true);
  expect(r.scroll).toBeLessThanOrEqual(0);
  expect(r.columns).toBeGreaterThanOrEqual(10);
  expect(r.features).toEqual(['feature-now', 'feature-map', 'feature-radar', 'feature-time']);
  expect(r.pairDirection).toBe('row');
  // Warnings in effect: across the top. Radar: 5×5 tiles. Hourly: what fits.
  await expect(page.locator('.wall-alerts .card-warnings')).toBeVisible();
  expect(await page.locator('.feature-radar .radar-layer').first().locator('img').count()).toBe(25);
  const hours = await page.locator('.feature-time .card-hourly .temp-dot').count();
  expect(hours).toBeGreaterThanOrEqual(6);
  expect(hours).toBeLessThanOrEqual(24);
  // The instruments don't repeat what the feature band shows.
  await expect(page.locator('.instruments .card-radar, .instruments .card-hourly, .instruments .card-daily')).toHaveCount(0);
  // The footer, as one line on screen: links and copyright on the left, the data credit on the right.
  await expect(page.locator('.footer-credit')).toBeInViewport();
  await expect(page.locator('.footer-links')).toBeInViewport();
  await expect(page.locator('#copyright')).toBeInViewport();
  const foot = await page.evaluate(() => {
    const at = (sel) => document.querySelector(sel).getBoundingClientRect();
    return { links: at('.footer-links').left, credit: innerWidth - at('.footer-credit a').right, top: [at('.footer-links').top, at('#copyright').top, at('.footer-credit').top] };
  });
  expect(foot.links).toBeLessThan(40);
  expect(foot.credit).toBeLessThan(40);
  expect(Math.max(...foot.top) - Math.min(...foot.top)).toBeLessThan(4);   // one line
});

test('a 4K screen: the tall band stacks the map over the radar', async ({ page }) => {
  await page.setViewportSize({ width: 3840, height: 2050 });
  await withFavorites(page, FAVS);
  await openPlace(page, 'nyc');
  await page.waitForTimeout(400);
  const r = await measure(page);
  expect(r.scroll).toBeLessThanOrEqual(0);
  expect(r.pairDirection).toBe('column');
});

test('no warnings in effect: no strip; the warnings card goes last among the instruments', async ({ page }) => {
  await page.setViewportSize({ width: 3440, height: 1300 });
  await openPlace(page, 'nairobi');
  await expect(page.locator('.wall-alerts')).toHaveCount(0);
  const ids = await page.locator('.instruments > .card').evaluateAll((els) => els.map((e) => e.dataset.widget));
  expect(ids.at(-1)).toBe('warnings');
});

test('the setting: Scroll keeps the usual layout on a big screen; Fit uses the wall anywhere', async ({ page }) => {
  await page.setViewportSize({ width: 3440, height: 1300 });
  await openPlace(page, 'berlin');
  await page.goto('./#/settings');
  const group = page.getByRole('radiogroup', { name: 'Layout' });
  await group.getByRole('radio', { name: 'Scroll' }).check();
  await page.goBack();
  await page.locator('.hero-temp').waitFor();
  await expect(page.locator('.feature-band')).toHaveCount(0);
  await expect(page.locator('.hero-cell')).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('./#/settings');
  await group.getByRole('radio', { name: 'Fit' }).check();
  await page.goBack();
  await expect(page.locator('.feature-band')).toBeVisible();
});

test('screenshot: 3440 × 1300', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'screenshots are kept for Chromium only');
  // The large radar's 325 tiles arrive at RainViewer's pace (api/tiles.js): about 40 s.
  test.setTimeout(120e3);
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 3440, height: 1300 });
  await withFavorites(page, FAVS);
  await openPlace(page, 'berlin');
  await pinFont(page);
  await expect(page.locator('.card-loading')).toHaveCount(0);
  await radarDrawn(page, 90e3);
  await page.waitForTimeout(400);
  await expect(page).toHaveScreenshot('wall-3440-dark.png', { mask: [page.locator('.alert-bar')] });   // it takes turns
});

test('from 1800 × 900: big tiles get half the window, the rest of the cards follow below', async ({ page }) => {
  await page.setViewportSize({ width: 1800, height: 900 });
  await withFavorites(page, FAVS);
  await openPlace(page, 'berlin');
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => {
    const now = document.querySelector('.feature-now');
    const side = document.querySelector('.feature-now .hero-side');
    const footer = getComputedStyle(document.querySelector('.app-footer'));
    return {
      wall: document.body.classList.contains('wall-mode'),
      band: document.querySelector('.feature-band').getBoundingClientRect().height,
      nowFits: side.scrollHeight <= side.clientHeight + 1 && side.scrollWidth <= side.clientWidth + 1,
      iconInside: document.querySelector('.feature-now .hero-icon').getBoundingClientRect().right <= now.getBoundingClientRect().right,
      footer: footer.position,
    };
  });
  expect(r.wall).toBe(true);
  expect(r.band).toBeGreaterThanOrEqual(0.45 * (900 - 56 - 26) - 1);   // 45 % of the room below the header, at least
  expect(r.nowFits).toBe(true);
  expect(r.iconInside).toBe(true);
  expect(r.footer).not.toBe('fixed');   // the credit sits at the end, never over the cards
  await expect(page.locator('.instruments .card-wind')).toBeAttached();
});

// Fitted to the window (views/wall.js fitToScreen; Settings › Layout).
async function withLayout(page, layout, width, height) {
  await page.addInitScript((l) => localStorage.setItem('darkbreezy:settings', JSON.stringify({ v: 4, data: { layout: l } })), layout);
  await page.setViewportSize({ width, height });
  await withFavorites(page, FAVS);
  await openPlace(page, 'berlin');
  await page.waitForTimeout(800);
  return page.evaluate(() => ({
    wall: !!document.querySelector('.wall'),
    fitted: !!document.querySelector('.wall.fit'),
    scale: Number(document.querySelector('.wall')?.style.getPropertyValue('--fit') || 1),
    scroll: document.documentElement.scrollHeight - innerHeight,
    lowest: Math.max(...[...document.querySelectorAll('.wall .card, .wall .hero-side')].map((c) => c.getBoundingClientRect().bottom)),
    height: innerHeight,
  }));
}

test('Auto, a little short of room: no shrinking; the last cards in the order go compact', async ({ page }) => {
  const r = await withLayout(page, 'auto', 3440, 920);
  expect(r.fitted).toBe(true);
  expect(r.scale).toBe(1);
  expect(r.scroll).toBeLessThanOrEqual(0);
  expect(r.lowest).toBeLessThanOrEqual(r.height);
});

test('Auto at 1920 × 1080: full size, compact from the end of the order, nothing scrolls', async ({ page }) => {
  const r = await withLayout(page, 'auto', 1920, 1080);
  expect(r.scale).toBe(1);
  expect(r.scroll).toBeLessThanOrEqual(0);
  expect(r.lowest).toBeLessThanOrEqual(r.height);
  const ids = await page.locator('.instruments > .card').evaluateAll((els) => els.map((e) => [e.dataset.widget, e.classList.contains('compact')]));
  const firstCompact = ids.findIndex(([, c]) => c);
  expect(firstCompact).toBeGreaterThan(0);
  expect(ids.slice(firstCompact).every(([, c]) => c), `compact from the end: ${JSON.stringify(ids)}`).toBe(true);
});

test('Fit: compact and drop at full size, no scrolling; and clicks still land', async ({ page }) => {
  const r = await withLayout(page, 'fit', 1920, 1080);
  expect(r.scale).toBe(1);
  expect(r.scroll).toBeLessThanOrEqual(0);
  expect(r.lowest).toBeLessThanOrEqual(r.height);
  await page.locator('.card-map').getByRole('link', { name: /Show Tokyo/ }).click();
  await expect(page.locator('.hero-place')).toContainText('Tokyo');
});

test('Fit in a very small window: shrinking only as a last resort, still no scrolling', async ({ page }) => {
  const r = await withLayout(page, 'fit', 1024, 600);
  expect(r.scroll).toBeLessThanOrEqual(0);
  expect(r.lowest).toBeLessThanOrEqual(r.height + 1);
});

test('Scroll: the card grid, every card full, even on a big screen', async ({ page }) => {
  const r = await withLayout(page, 'scroll', 1920, 1080);
  expect(r.wall).toBe(false);
  await expect(page.locator('.hero-cell')).toBeVisible();
  await expect(page.locator('.card.compact')).toHaveCount(0);
});

test('fitting follows the window: compact cards at 1920 × 1080, all full again once it grows', async ({ page }) => {
  await withLayout(page, 'auto', 1920, 1080);
  await expect(page.locator('.instruments > .card.compact').first()).toBeAttached();
  await page.setViewportSize({ width: 3440, height: 1300 });
  await expect(page.locator('.instruments > .card.compact')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(0);
});

test('Layout: changed in Settings, it applies as soon as you go back to the dashboard', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await withFavorites(page, FAVS);
  await openPlace(page, 'berlin');
  await page.waitForTimeout(500);
  for (const back of [(p) => p.goBack(), (p) => p.locator('a.brand').click()]) {
    await page.goto('./#/settings');
    const group = page.getByRole('radiogroup', { name: 'Layout' });
    await group.getByRole('radio', { name: 'Scroll' }).check();
    await page.goBack();
    await page.locator('.hero-temp').waitFor();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);   // Scroll: it scrolls
    await page.goto('./#/settings');
    await group.getByRole('radio', { name: 'Fit' }).check();
    await back(page);
    await page.locator('.hero-temp').waitFor();
    await expect.poll(() => page.evaluate(() => !!document.querySelector('.wall.fit') && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  }
});

test('saved settings from before Layout: Large-screen layout On becomes Fit', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('darkbreezy:settings', JSON.stringify({ v: 3, data: { wallMode: 'on', fit: 'never' } })));
  await page.setViewportSize({ width: 1280, height: 800 });
  await openPlace(page, 'berlin');
  await expect(page.locator('.wall.fit')).toBeAttached();
  await page.goto('./#/settings');
  await expect(page.getByRole('radiogroup', { name: 'Layout' }).getByRole('radio', { name: 'Fit' })).toBeChecked();
});

// Compact, then dropped (widgets/compact.js, views/wall.js): readable instead of shrunk.
const instrumentState = (page) => page.evaluate(() => {
  const cards = [...document.querySelectorAll('.instruments > .card, .instruments > .more-wrap')].map((c) => c.getBoundingClientRect());
  let overlaps = 0;
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
    const [a, b] = [cards[i], cards[j]];
    if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlaps++;
  }
  return {
    full: [...document.querySelectorAll('.instruments > .card:not(.compact)')].map((c) => c.dataset.widget),
    compact: [...document.querySelectorAll('.instruments > .card.compact')].map((c) => c.dataset.widget),
    more: document.querySelector('.more-cards .compact-extra')?.textContent || '',
    overlaps,
    lowest: Math.max(...cards.map((c) => c.bottom)),
    height: innerHeight,
  };
});

test('the card order decides: a card moved to the front stays full', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 960 });
  await page.clock.setFixedTime((await import('./fake-services.mjs')).recordedAt('berlin'));
  const { fakeServices } = await import('./fake-services.mjs');
  await fakeServices(page);
  await page.goto('./?cards=aurora,station,nowcast,precip,wind,sun,uv,aqi,pollen,humidity,pressure,visibility,clouds,feels,hourly,daily,radar,warnings#/place/52.52,13.41/Berlin?n=Berlin&c=Germany&cc=DE');
  await page.locator('.hero-temp').waitFor();
  await page.waitForTimeout(800);
  const r = await instrumentState(page);
  expect(r.full).toContain('aurora');
  expect(r.full).toContain('station');
  expect(r.compact.length).toBeGreaterThan(0);
  expect(r.compact).toContain('feels');   // now the last of them
});

test('a small window: compact, then dropped from the end, a click away under "+N more"', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('darkbreezy:settings', JSON.stringify({ v: 4, data: { layout: 'fit' } })));
  await page.setViewportSize({ width: 1280, height: 720 });
  await withFavorites(page, FAVS);
  await openPlace(page, 'berlin');
  await page.waitForTimeout(800);
  const r = await instrumentState(page);
  expect(r.full).toEqual([]);
  expect(r.overlaps).toBe(0);
  expect(r.lowest).toBeLessThanOrEqual(r.height);
  expect(r.more).toContain('Aurora');                    // the last in the order went first
  expect(r.compact).toContain('nowcast');               // the first is still there
  await page.locator('.more-cards').click();
  const panel = page.getByRole('dialog', { name: 'More cards' });
  await expect(panel.locator('.card-aurora')).toBeVisible();
  await expect(panel.locator('.card-aurora')).not.toHaveClass(/compact/);   // in full
  await page.keyboard.press('Escape');
  await panel.locator('.icon-btn').click().catch(() => {});
  await expect(panel).toHaveCount(0);
});

test('wallpaper, small: compact and dropped, nothing to click', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const { fakeServices, recordedAt } = await import('./fake-services.mjs');
  await page.clock.setFixedTime(recordedAt('berlin'));
  await fakeServices(page);
  await page.goto('./?wallpaper=1#/place/52.52,13.41/Berlin?n=Berlin&c=Germany&cc=DE');
  await page.locator('.hero-temp').waitFor();
  await page.waitForTimeout(800);
  const r = await instrumentState(page);
  expect(r.more).toBe('');
  expect(r.overlaps).toBe(0);
  expect(r.lowest).toBeLessThanOrEqual(r.height);
  expect(r.compact.length).toBeGreaterThan(0);
});
