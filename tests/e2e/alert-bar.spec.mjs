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
