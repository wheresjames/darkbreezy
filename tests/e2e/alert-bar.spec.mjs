// Warnings in the large-screen and wallpaper layouts: the thin bar (widgets/alert-bar.js).
import { test, expect } from '@playwright/test';
import { openPlace, fakeServices, recordedAt, placeUrl } from './fake-services.mjs';

// New York's fixture: a Tornado Warning (extreme) and a Flood Watch (moderate).
async function bigScreen(page, opts) {
  await page.setViewportSize({ width: 3440, height: 1300 });
  await page.clock.install({ time: recordedAt('nyc') });
  await fakeServices(page, opts);
  await page.goto(`./${placeUrl('nyc')}`);
  await page.locator('.alert-bar').waitFor();
}
const seat = (page) => page.locator('.alert-bar .ab-event');

test('a thin bar: the most severe in the hot seat, the rest waiting beside it', async ({ page }) => {
  await bigScreen(page);
  const bar = page.locator('.alert-bar');
  expect((await bar.boundingBox()).height).toBeLessThanOrEqual(80);
  await expect(bar).toHaveAttribute('data-severity', 'extreme');
  await expect(seat(page)).toHaveText('Tornado Warning');
  await expect(bar.locator('.ab-chip')).toHaveText(['Flood Watch']);
  await expect(bar.locator('.ab-text')).toContainText('TAKE COVER NOW!');
  // Not repeated among the small cards; every warning in hidden text for screen readers.
  await expect(page.locator('.instruments .card-warnings')).toHaveCount(0);
  await expect(bar.locator('.visually-hidden')).toContainText('Flooding caused by excessive rainfall is possible.');
});

test('turns: the extreme one goes through twice, then the next takes the seat', async ({ page }) => {
  await bigScreen(page);
  // Its text is one page of about 25 words: 7.5 s a pass. Step a second at a time.
  let handover = 0;
  for (let s = 1; s <= 40 && !handover; s++) {
    await page.clock.runFor(1000);
    if ((await seat(page).textContent()) === 'Flood Watch') handover = s;
  }
  expect(handover).toBeGreaterThanOrEqual(15);   // two passes, not one
  expect(handover).toBeLessThanOrEqual(25);
  await expect(page.locator('.alert-bar')).toHaveAttribute('data-severity', 'moderate');
  await expect(page.locator('.alert-bar .ab-chip')).toHaveText(['Tornado Warning']);
});
const MAX_ONE_PASS = 13000;   // a one-page warning: at most 12 s

test('hover pauses it; a click opens every warning in full, Esc closes', async ({ page }) => {
  await bigScreen(page);
  await page.locator('.alert-bar').hover();
  await page.clock.runFor(3 * MAX_ONE_PASS);
  await expect(seat(page)).toHaveText('Tornado Warning');
  await page.locator('.alert-bar .ab-main').click();
  const panel = page.getByRole('dialog', { name: 'Warnings in full' });
  await expect(panel).toContainText('Extreme: Tornado Warning');
  await expect(panel).toContainText('Moderate: Flood Watch');
  await panel.getByRole('link', { name: 'Official page' }).first().waitFor();
  await panel.locator('.ab-close').focus();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
});

test('wallpaper: the same bar, nothing to click', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.clock.setFixedTime(recordedAt('nyc'));
  await fakeServices(page);
  await page.goto(`./?wallpaper=1&dim=20${placeUrl('nyc')}`);
  await page.locator('.alert-bar').waitFor();
  await expect(page.locator('.alert-bar button')).toHaveCount(0);
  await expect(seat(page)).toHaveText('Tornado Warning');
});

test('reduced motion: the turns still change, nothing slides or fades', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await bigScreen(page);
  await expect(page.locator('.alert-bar .animate')).toHaveCount(0);
});

test('while warnings load or can\'t be checked: the usual card among the small cards, no bar', async ({ page }) => {
  await page.setViewportSize({ width: 3440, height: 1300 });
  // The national source down: "couldn't check", never "no warnings", whatever GDACS says.
  for (const gdacs of [503, undefined]) {
    await openPlace(page, 'nyc', { 'nws-alerts': 503, gdacs });
    const card = page.locator('.instruments .card-warnings');
    await expect(card.locator('.card-error')).toBeVisible();   // "couldn't check", or the service's error
    await expect(card.locator('.card-error button')).toHaveText(/Try again/);
    await expect(card).not.toContainText('No warnings in effect');
    await expect(page.locator('.alert-bar')).toHaveCount(0);
  }
});

test('the country\'s warnings show without waiting for a slow global feed (GDACS)', async ({ page }) => {
  await page.setViewportSize({ width: 3440, height: 1300 });
  await openPlace(page, 'nyc', { delay: { gdacs: 20000 } });
  await expect(seat(page)).toHaveText('Tornado Warning', { timeout: 4000 });
});

test('"Try it" in Settings opens the place last looked at', async ({ page }) => {
  await openPlace(page, 'nyc');
  await page.goto('./#/settings');
  await expect(page.getByLabel('Address for a wallpaper app')).toHaveValue(/#\/place\/40\.71,-74\.01\//);
});

// Settings › Warnings: the ticker auto/always/never, and whether the card goes last when there are none.
const withSettings = (page, data) => page.addInitScript((d) => localStorage.setItem('darkbreezy:settings', JSON.stringify({ v: 5, data: d })), data);
const cardOrder = (page) => page.locator('.grid > .card').evaluateAll((els) => els.map((e) => e.dataset.widget));

test('ticker Never: the full list across the top of the large-screen layout', async ({ page }) => {
  await withSettings(page, { alertTicker: 'never' });
  await page.setViewportSize({ width: 3440, height: 1300 });
  await openPlace(page, 'nyc');
  await expect(page.locator('.wall-alerts .card-warnings .alert')).toHaveCount(2);
  await expect(page.locator('.alert-bar')).toHaveCount(0);
});

test('ticker Always: the bar in the usual layout too, a full row where the card would be', async ({ page }) => {
  await withSettings(page, { alertTicker: 'always', layout: 'scroll' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await openPlace(page, 'nyc');
  await expect(seat(page)).toHaveText('Tornado Warning');
  expect((await cardOrder(page))[0]).toBe('warnings');
  const [b, grid] = await Promise.all([page.locator('.grid > .alert-bar'), page.locator('.grid')].map((l) => l.boundingBox()));
  expect(Math.abs(b.width - grid.width)).toBeLessThan(2);
});

test('warnings in effect: where the card is in the order; across the top of the large-screen layout', async ({ page }) => {
  await withSettings(page, { order: ['hourly', 'daily', 'wind', 'warnings'] });
  await page.setViewportSize({ width: 1280, height: 900 });
  await openPlace(page, 'nyc');
  await expect(page.locator('.card-warnings .alert').first()).toBeVisible();
  const ids = await cardOrder(page);
  expect(ids.indexOf('warnings')).toBe(ids.indexOf('wind') + 1);
  await page.setViewportSize({ width: 3440, height: 1300 });
  await expect(page.locator('.wall-alerts .alert-bar')).toBeVisible();
  await expect(page.locator('.instruments .card-warnings')).toHaveCount(0);
});

test('no warnings, not moved to the bottom: the card stays where it is in the order', async ({ page }) => {
  await withSettings(page, { quietLast: false, order: ['hourly', 'warnings', 'daily'] });
  await page.setViewportSize({ width: 1280, height: 900 });
  await openPlace(page, 'nairobi');   // GDACS only, nothing near Nairobi in the fixture
  await expect(page.locator('.card-warnings')).toContainText('No warnings in effect.');
  const ids = await cardOrder(page);
  expect(ids.indexOf('warnings')).toBe(ids.indexOf('hourly') + 1);
  // The large-screen layout too, among the small cards (Hourly is a feature tile there).
  await page.setViewportSize({ width: 3440, height: 1300 });
  // (The layout switches over a frame or two after the resize: asked again until it has.)
  await expect.poll(() => page.locator('.instruments > .card').evaluateAll((els) => els[0]?.dataset.widget)).toBe('warnings');
});

test('the warnings settings: changed in Settings, and from the address', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openPlace(page, 'nyc');
  await expect(page.locator('.alert-bar')).toHaveCount(0);
  await page.goto('./#/settings');
  await page.getByRole('radiogroup', { name: 'Warnings ticker' }).getByRole('radio', { name: 'Always' }).check();
  await page.goBack();
  await expect(page.locator('.grid > .alert-bar')).toBeVisible();
  await page.goto(`./?ticker=never${placeUrl('nyc')}`);
  await expect(page.locator('.card-warnings .alert').first()).toBeVisible();
  await expect(page.locator('.alert-bar')).toHaveCount(0);
});
