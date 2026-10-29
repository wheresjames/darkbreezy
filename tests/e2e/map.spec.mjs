import { test, expect } from '@playwright/test';
import { openPlace, withFavorites, fakeServices, recordedAt, placeUrl } from './fake-services.mjs';

const FAVS = ['berlin', 'nyc', 'tokyo', 'sydney'];

test('the map shows the place as a beacon and the other favorites with their weather', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await withFavorites(page, FAVS);
  await openPlace(page, 'berlin');
  const map = page.locator('.card-map');
  await expect(map.locator('.map-beacon')).toHaveAttribute('aria-label', 'Berlin (shown now)');
  await expect(map.locator('.map-fav')).toHaveCount(3);
  // Labels with temperature and local time where there's room.
  await expect(map.locator('.fav-label', { hasText: 'Tokyo' })).toContainText(/°.*·.*\d:\d{2}/);
  await expect(map.locator('.map-land')).toHaveAttribute('d', /^M/);
  // Click a place: its dashboard.
  await map.getByRole('link', { name: /Show Tokyo/ }).click();
  await expect(page.locator('.hero-place')).toContainText('Tokyo');
  await expect(page.locator('.card-map .map-beacon')).toHaveAttribute('aria-label', 'Tokyo (shown now)');
});

test('without favorites: a hint, and no rotate button', async ({ page }) => {
  await openPlace(page, 'berlin');
  await expect(page.locator('.card-map')).toContainText('Star places to see them on the map.');
  await expect(page.getByRole('button', { name: 'Rotate' })).toHaveCount(0);
});

test('the map can be turned off in settings', async ({ page }) => {
  await withFavorites(page, FAVS);
  await openPlace(page, 'berlin');
  await page.goto('./#/settings');
  await page.getByRole('switch', { name: 'World map' }).uncheck();
  await page.goBack();
  await page.locator('.hero-temp').waitFor();
  await expect(page.locator('.card-map')).toHaveCount(0);
});

test('rotate: each favorite in turn, at the dwell time set in settings', async ({ page }) => {
  await page.clock.install({ time: recordedAt('berlin') });
  await withFavorites(page, FAVS);
  await fakeServices(page);
  await page.goto(`./${placeUrl('berlin')}`);
  await page.locator('.hero-temp').waitFor();
  // Dwell: 10 seconds.
  await page.goto('./#/settings');
  await page.getByRole('radio', { name: '10 s' }).check();
  await page.goBack();
  await page.locator('.hero-temp').waitFor();
  const rotate = page.getByRole('button', { name: 'Rotate' });
  await rotate.click();
  await expect(page.getByRole('button', { name: 'Rotating' })).toHaveAttribute('aria-pressed', 'true');
  await page.clock.runFor(9000);
  await expect(page.locator('.hero-place')).toContainText('Berlin');
  await page.clock.runFor(2000);
  await expect(page.locator('.hero-place')).toContainText('New York');
  await page.clock.runFor(11000);
  await expect(page.locator('.hero-place')).toContainText('Tokyo');
  // Stop: it stays.
  await page.getByRole('button', { name: 'Rotating' }).click();
  await page.clock.runFor(30000);
  await expect(page.locator('.hero-place')).toContainText('Tokyo');
});

test('war room with the map: every card and eight places fit on 1920×1080', async ({ page }) => {
  // The usual (war room) grid: what 1920 × 1080 gets with the large-screen layout off.
  await page.addInitScript(() => localStorage.setItem('darkbreezy:settings', JSON.stringify({ v: 2, data: { wallMode: 'off' } })));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await withFavorites(page, ['berlin', 'nyc', 'tokyo', 'sydney', 'tromso', 'nairobi', 'toronto', 'hongkong']);
  for (const id of ['berlin', 'nyc']) {
    await openPlace(page, id);
    await expect(page.locator('.card-loading')).toHaveCount(0);
    await page.waitForTimeout(300);
    const lowest = await page.evaluate(() => Math.max(...[...document.querySelectorAll('.grid > *')].map((c) => c.getBoundingClientRect().bottom)));
    expect(lowest, id).toBeLessThanOrEqual(1080);
    await expect(page.locator('#header .fav-strip')).toHaveCount(0);   // the chips are on the map's card
    await expect(page.locator('.card-map .fav-chip')).toHaveCount(8);
  }
});

test('map labels: none, or only the parts chosen', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await withFavorites(page, FAVS);
  await openPlace(page, 'berlin');
  const labels = page.locator('.card-map .map-label');
  await expect(labels.first()).toBeVisible();
  // Local time only (24-hour clock, so it's easy to match).
  await page.goto('./#/settings');
  await page.getByRole('radio', { name: '24-hour' }).check();
  const parts = page.getByRole('group', { name: 'Labels show' });
  for (const name of ['City', 'Temperature', 'High/low']) await parts.getByLabel(name).uncheck();
  await parts.getByLabel('Local time').check();
  await page.goBack();
  await page.locator('.hero-temp').waitFor();
  await expect(labels.first()).toHaveText(/^\d{2}:\d{2}$/);
  await expect(page.locator('.card-map .fav-label', { hasText: /°/ })).toHaveCount(0);
  // No labels: dots and the beacon only, still clickable.
  await page.goto('./#/settings');
  await page.getByRole('switch', { name: 'Map labels' }).uncheck();
  await page.goBack();
  await page.locator('.hero-temp').waitFor();
  await expect(page.locator('.card-map .map-fav')).toHaveCount(3);
  await expect(labels).toHaveCount(0);
});

test('your places as chips on the map\'s card: one tap to switch; in the header only when the map is off', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await withFavorites(page, ['berlin', 'nyc', 'tokyo']);
  await openPlace(page, 'berlin');
  const chips = page.locator('.card-map .map-chips .fav-chip');
  await expect(chips).toHaveText(['Berlin', 'New York', 'Tokyo']);
  await expect(chips.first()).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#header .fav-strip')).toHaveCount(0);
  await chips.nth(2).click();
  await expect(page.locator('.hero-place')).toContainText('Tokyo');
  await page.goto('./?map=0#/place/35.68,139.69/Tokyo?n=Tokyo&c=Japan&cc=JP');
  await expect(page.locator('#header .fav-chip')).toHaveCount(3);
});

test('more chips than fit: the current place starts in view, the edges fade, and a mouse wheel scrolls them', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 900 });
  await withFavorites(page, ['berlin', 'nyc', 'tokyo', 'sydney', 'tromso', 'nairobi', 'toronto', 'hongkong']);
  await openPlace(page, 'hongkong');
  const strip = page.locator('.card-map .map-chips');
  await expect(strip.locator('[aria-current="page"]')).toBeInViewport({ ratio: 0.95 });
  await expect(strip).toHaveClass(/fade-start/);
  const before = await strip.evaluate((s) => s.scrollLeft);
  expect(before).toBeGreaterThan(0);
  await strip.hover();
  await page.mouse.wheel(0, -400);
  await expect.poll(() => strip.evaluate((s) => s.scrollLeft)).toBe(0);
  await expect(strip).not.toHaveClass(/fade-start/);
  await expect(strip).toHaveClass(/fade-end/);
  expect(await page.evaluate(() => scrollY)).toBe(0);   // the wheel moved the chips, not the page
});

test('choosing a chip: the next page\'s strip glides it to the middle', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 900 });
  await withFavorites(page, ['berlin', 'nyc', 'tokyo', 'sydney', 'tromso', 'nairobi', 'toronto', 'hongkong']);
  await openPlace(page, 'berlin');
  const strip = page.locator('.card-map .map-chips');
  await strip.getByRole('link', { name: 'Tromsø' }).click();
  await expect(page.locator('.hero-place')).toContainText('Tromsø');
  // In the middle, or as near as the strip goes (it can't scroll past either end).
  const offCentre = () => strip.evaluate((s) => {
    const chip = s.querySelector('[aria-current="page"]').getBoundingClientRect();
    const box = s.getBoundingClientRect();
    const end = s.scrollWidth - s.clientWidth;
    const want = s.scrollLeft + ((chip.left + chip.right) / 2 - (box.left + box.right) / 2);
    return Math.abs(Math.max(0, Math.min(end, want)) - s.scrollLeft);
  });
  await expect.poll(offCentre).toBeLessThan(3);
});
