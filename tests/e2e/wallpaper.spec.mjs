// Wallpaper mode (views/wallpaper.js): for desktop wallpaper apps, which
// only take an address and allow no clicks.
import { test, expect } from '@playwright/test';
import { fakeServices, recordedAt, openPlace } from './fake-services.mjs';

const PLACE = '#/place/52.52,13.41/Berlin?n=Berlin&c=Germany&cc=DE';
const FAV = 'fav=52.52,13.41,Berlin,DE|40.71,-74.01,New York,US|35.68,139.69,Tokyo,JP';

async function open(page, query, { width = 1366, height = 768 } = {}) {
  await page.setViewportSize({ width, height });
  await page.clock.setFixedTime(recordedAt('berlin'));
  await fakeServices(page);
  await page.goto(`./?${query}${PLACE}`);
  await page.locator('.hero-temp').waitFor();
  await page.waitForTimeout(800);   // the fit settles over a few frames
}

const state = (page) => page.evaluate(() => {
  const cards = [...document.querySelectorAll('.wall .card, .wall .hero-side')].map((c) => c.getBoundingClientRect());
  let overlaps = 0;
  const instruments = [...document.querySelectorAll('.instruments > .card')].map((c) => c.getBoundingClientRect());
  for (let i = 0; i < instruments.length; i++) for (let j = i + 1; j < instruments.length; j++) {
    const [a, b] = [instruments[i], instruments[j]];
    if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlaps++;
  }
  return {
    wallpaper: document.documentElement.hasAttribute('data-wallpaper'),
    wall: document.body.classList.contains('wall-mode'),
    dim: getComputedStyle(document.documentElement, '::after').opacity,
    header: getComputedStyle(document.getElementById('header')).display,
    scroll: document.documentElement.scrollHeight - innerHeight,
    lowest: Math.max(...cards.map((c) => c.bottom)),
    height: innerHeight,
    overlaps,
  };
});

for (const [width, height] of [[1366, 768], [1920, 1080], [3440, 1440]]) {
  test(`from the address: the large-screen layout, dimmed, no controls, fitted to ${width}×${height}`, async ({ page }) => {
    await open(page, `wallpaper=1&dim=35&${FAV}`, { width, height });
    // Wait for the fit to settle (a few frames, longer under load) rather than a fixed time.
    await expect.poll(async () => { const x = await state(page); return x.scroll <= 0 && x.lowest <= x.height && x.overlaps === 0; }, { timeout: 20000 }).toBe(true);
    const r = await state(page);
    expect(r.wallpaper).toBe(true);
    expect(r.wall).toBe(true);
    expect(r.dim).toBe('0.35');
    expect(r.header).toBe('none');
    expect(r.scroll).toBeLessThanOrEqual(0);
    expect(r.lowest).toBeLessThanOrEqual(r.height);
    expect(r.overlaps).toBe(0);
    await expect(page.locator('.radar-controls, .rotate-btn')).toHaveCount(2);
    await expect(page.locator('.radar-controls')).toBeHidden();
    await expect(page.locator('.rotate-btn')).toBeHidden();
    await expect(page.locator('.footer-credit')).toBeInViewport();
    await expect(page.locator('.footer-links')).toBeHidden();   // nobody clicks a wallpaper
    await expect(page.locator('.card-map .map-fav')).toHaveCount(2);   // the favorites from the address
  });
}

test('address settings are for that page only: nothing is saved', async ({ page }) => {
  await open(page, `wallpaper=1&dim=60&theme=dark&${FAV}`);
  expect((await state(page)).wallpaper).toBe(true);
  await page.goto(`./${PLACE}`);
  await page.locator('.hero-temp').waitFor();
  const r = await state(page);
  expect(r.wallpaper).toBe(false);
  expect(r.header).not.toBe('none');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('darkbreezy:favorites') || 'null'));
  expect(stored?.data?.list || []).toEqual([]);   // the address's favorites weren't saved
  const settings = await page.evaluate(() => JSON.parse(localStorage.getItem('darkbreezy:settings') || 'null'));
  expect(settings?.data?.wallpaper ?? false).toBe(false);
  expect(settings?.data?.theme ?? 'auto').toBe('auto');
});

test('from Settings: "Try it" opens wallpaper mode in a new window; this one stays as it is', async ({ page, context }) => {
  await openPlace(page, 'berlin');
  await page.goto('./#/settings');
  await expect(page.getByRole('switch', { name: 'Wallpaper mode' })).toHaveCount(0);   // no switch to get stuck with
  await page.getByRole('slider', { name: 'Darkness' }).fill('70');
  const [win] = await Promise.all([context.waitForEvent('page'), page.getByRole('button', { name: 'Try it' }).click()]);
  await win.locator('.hero-temp').waitFor();
  await win.waitForTimeout(400);
  let r = await state(win);
  expect(r.wallpaper).toBe(true);
  expect(r.dim).toBe('0.7');
  // Esc: the way out, to the same page without the wallpaper parameters.
  await win.keyboard.press('Escape');
  const bar = win.locator('.wallpaper-bar');
  await expect(bar).toBeVisible();
  await bar.getByRole('button', { name: 'Exit' }).click();
  await win.locator('.hero-temp').waitFor();
  expect(win.url()).not.toContain('wallpaper=');
  r = await state(win);
  expect(r.wallpaper).toBe(false);
  expect(r.header).not.toBe('none');
  // The settings window was never in wallpaper mode.
  await page.goBack();
  await page.locator('.hero-temp').waitFor();
  expect((await state(page)).wallpaper).toBe(false);
});

test('a wallpaper switch saved by an earlier version is cleared: a normal visit is never stuck in it', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('darkbreezy:settings', JSON.stringify({ v: 2, data: { wallpaper: true, dim: 60 } }));
    }
  });
  await openPlace(page, 'berlin');
  const r = await state(page);
  expect(r.wallpaper).toBe(false);
  expect(r.header).not.toBe('none');
  // Upgraded settings are written back with the next change: the switch goes, the darkness stays.
  await page.goto('./#/settings');
  await page.getByRole('radio', { name: '24-hour' }).check();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('darkbreezy:settings')).data);
  expect(saved.wallpaper).toBe(false);
  expect(saved.dim).toBe(60);
});

test('the settings page under a wallpaper address: not dimmed, the header back, and a note', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await fakeServices(page);
  await page.goto('./?wallpaper=1&dim=50&clock=24#/settings');
  await expect(page.locator('.settings-notice')).toContainText('wallpaper, dim, clock');
  const r = await state(page);
  expect(r.wallpaper).toBe(false);
  expect(r.header).not.toBe('none');
});

test('the address built in Settings opens the same thing', async ({ page }) => {
  const { withFavorites } = await import('./fake-services.mjs');
  await withFavorites(page, ['berlin', 'tokyo']);
  await openPlace(page, 'berlin');
  await page.goto('./#/settings');
  await page.getByRole('radio', { name: '24-hour' }).check();
  await page.getByRole('slider', { name: 'Darkness' }).fill('25');
  const address = await page.getByLabel('Address for a wallpaper app').inputValue();
  expect(address).toContain('wallpaper=1');
  expect(address).toContain('dim=25');
  expect(address).toContain('clock=24');
  expect(address).toContain('fav=52.52,13.41,Berlin,DE|35.68,139.69,Tokyo,JP');
  expect(address).toContain('#/place/52.52,13.41/');
  // A fresh browser (a wallpaper app) with nothing stored.
  await page.evaluate(() => localStorage.clear());
  await page.goto(address);
  await page.locator('.hero-temp').waitFor();
  const r = await state(page);
  expect(r.wallpaper).toBe(true);
  expect(r.dim).toBe('0.25');
  await expect(page.locator('.card-map .map-fav')).toHaveCount(1);
  await expect(page.locator('.card-map .fav-label')).toContainText('Tokyo');
});

test('settings from the address: their controls are dimmed and off; the rest still work', async ({ page }) => {
  await page.clock.setFixedTime(recordedAt('berlin'));
  await fakeServices(page);
  await page.goto(`./?theme=dark&rotate=1&cards=hourly,daily,wind&${FAV}${PLACE}`);
  await page.locator('.hero-temp').waitFor();
  // The map's Rotate button and the star: set by the address, so off.
  await expect(page.locator('.rotate-btn')).toBeDisabled();
  await expect(page.getByRole('button', { name: /from your places/ })).toBeDisabled();
  await page.goto(`./?theme=dark&rotate=1&cards=hourly,daily,wind&${FAV}#/settings`);
  const theme = page.getByRole('radiogroup', { name: 'Theme' });
  await expect(theme.getByRole('radio', { name: 'Dark' })).toBeChecked();
  await expect(theme.getByRole('radio', { name: 'Light' })).toBeDisabled();
  await expect(page.locator('.setting.from-url')).toHaveCount(1);
  await expect(page.locator('.setting.from-url')).toContainText('Set by this page\'s address.');
  await expect(page.getByRole('radiogroup', { name: 'Clock' }).getByRole('radio', { name: '24-hour' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Restore defaults' })).toBeDisabled();
  await expect(page.getByRole('switch', { name: 'Wind' })).toBeDisabled();
  await page.goto(`./?${FAV}#/search`);
  await expect(page.getByRole('button', { name: 'Remove Berlin' })).toBeDisabled();
});
