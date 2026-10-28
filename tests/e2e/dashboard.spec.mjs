import { test, expect } from '@playwright/test';
import { openPlace, fakeServices, recordedAt, placeUrl } from './fake-services.mjs';

const cards = (page) => page.locator('.card').evaluateAll((els) => els.map((e) => e.dataset.widget));

test.describe('dashboard', () => {
  test('Berlin: forecast, pollen, DWD warnings, station reading', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openPlace(page, 'berlin');
    await expect(page).toHaveTitle('Berlin, Germany · Dark Breezy');
    await expect(page.locator('.hero-place')).toContainText('Berlin');
    await expect(page.locator('.card-warnings')).toContainText('Official WARNING of STORM GUSTS');
    await expect(page.locator('.card-warnings .alert')).toHaveCount(2);
    await expect(page.locator('.card-warnings')).toHaveClass(/top-severe/);
    await expect(page.locator('.card-station')).toContainText('Deutscher Wetterdienst');
    const ids = await cards(page);
    for (const id of ['hourly', 'daily', 'wind', 'sun', 'uv', 'aqi', 'pollen', 'humidity', 'pressure', 'radar']) expect(ids).toContain(id);
    expect(ids).not.toContain('discussion');
    expect(ids).not.toContain('marine');
    await expect(page.locator('.card-aqi')).toContainText('European AQI');
    expect(errors).toEqual([]);
  });

  test('New York: NWS tornado warning first, discussion, no pollen', async ({ page }) => {
    await openPlace(page, 'nyc');
    const first = page.locator('.card-warnings .alert').first();
    await expect(first).toContainText('Tornado Warning');
    await expect(first).toHaveAttribute('data-severity', 'extreme');
    await expect(page.locator('.card-warnings .alert')).toHaveCount(2, { timeout: 5000 });   // the expired advisory is left out
    await first.locator('summary').click();
    await expect(first).toContainText('TAKE COVER NOW!');
    await expect(first.getByRole('link', { name: 'Official page' })).toHaveAttribute('href', /forecast\.weather\.gov/);
    await expect(page.locator('.card-discussion')).toContainText('NWS OKX');
    await expect(page.locator('.card-station')).toContainText('US National Weather Service');
    expect(await cards(page)).not.toContain('pollen');
    await expect(page.locator('.card-aqi')).toContainText('US AQI');
  });

  test('a country without a warnings source says so and links its weather service', async ({ page }) => {
    await openPlace(page, 'nairobi');
    const w = page.locator('.card-warnings');
    await expect(w).toContainText('aren\'t available here');
    await expect(w.getByRole('link', { name: 'Kenya Meteorological Department' })).toBeVisible();
    expect(await cards(page)).not.toContain('station');
  });

  test('Japan and Hong Kong warnings', async ({ page }) => {
    await openPlace(page, 'tokyo');
    await expect(page.locator('.card-warnings')).toContainText('Heavy Rain Warning');
    await expect(page.locator('.card-warnings')).toContainText('Thunderstorm Advisory');
    await openPlace(page, 'hongkong');
    await expect(page.locator('.card-warnings')).toContainText('Red Rainstorm Warning Signal');
    await expect(page.locator('.card-warnings .alert')).toHaveCount(2);
  });

  test('polar night: no sunrise, aurora shown', async ({ page }) => {
    await page.clock.setFixedTime(Date.UTC(2026, 11, 21, 11));
    await fakeServices(page);
    await page.goto(`./${placeUrl('tromso')}`);
    await expect(page.locator('.card-sun')).toContainText('Polar night');
    await expect(page.locator('.card-aurora')).toBeVisible();
  });

  test('coast: the sea card', async ({ page }) => {
    await openPlace(page, 'sydney');
    await expect(page.locator('.card-marine')).toContainText('waves');
  });

  test('a failing source shows its own error, the rest still works', async ({ page }) => {
    // Waits for failures and a retry: give them room when both browsers run side by side.
    const slow = { timeout: 15000 };
    // The fake services read this at each request, so the test can bring a service back.
    const outage = { air: 500, brightsky: 'abort' };
    const airAsks = [];
    page.on('request', (r) => { if (r.url().includes('air-quality-api')) airAsks.push(r.url()); });
    page.on('response', (r) => { if (r.url().includes('air-quality-api')) airAsks.push(`→ ${r.status()}`); });
    await openPlace(page, 'berlin', outage);
    await expect(page.locator('.card-aqi .card-error')).toContainText('(500)', slow);
    // Germany's own source down: "couldn't check", not "no warnings".
    await expect(page.locator('.card-warnings')).toContainText('Couldn\'t check for official warnings (Deutscher Wetterdienst)', slow);
    await expect(page.locator('.card-warnings')).not.toContainText('No warnings in effect');
    await expect(page.locator('.card-hourly')).toBeVisible();
    // Retry: the service is back.
    delete outage.air;
    // Clicked on the button itself: under load the cards can still be settling into place, and a
    // click at the button's coordinates could land where it just moved from (that's the layout's
    // timing, not what this test is about).
    await page.locator('.card-aqi').getByRole('button', { name: 'Try again' }).dispatchEvent('click');
    await expect.poll(() => airAsks.filter((a) => a.startsWith('http')).length, { ...slow, message: `air requests: ${airAsks.join(' ')}` }).toBeGreaterThanOrEqual(2);
    await expect(page.locator('.card-aqi'), `air requests: ${airAsks.join(' ')}`).toContainText('European AQI', slow);
  });

  test('the second visit draws from the cache, even with every service down', async ({ page }) => {
    await openPlace(page, 'berlin');
    await expect(page.locator('.card-aqi')).toContainText('AQI');
    await page.unrouteAll();
    await page.route(/^https:\/\/(?!localhost)/, (r) => r.abort('failed'));
    await page.reload();
    await expect(page.locator('.hero-temp')).toBeVisible();
    await expect(page.locator('.card-aqi')).toContainText('AQI');
    await expect(page.locator('.card-warnings')).toContainText('STORM GUSTS');
  });

  test('first visit with the forecast down: an error to retry, no blank page', async ({ page }) => {
    await page.clock.setFixedTime(recordedAt('berlin'));
    await fakeServices(page, { forecast: 503 });
    await page.goto(`./${placeUrl('berlin')}`);
    await expect(page.locator('.card-hourly .card-error')).toBeVisible();
    await expect(page.locator('.hero-place')).toContainText('Berlin');
  });
});

test.describe('card order', () => {
  const order = (page) => page.locator('.grid > .card').evaluateAll((els) => els.map((e) => e.dataset.widget));

  test('no warnings in effect: the warnings card goes last; Next 2 hours follows Hourly and 10 days', async ({ page }) => {
    await openPlace(page, 'nairobi');   // GDACS only, nothing near Nairobi in the fixture
    await expect(page.locator('.card-warnings')).toContainText('No warnings in effect.');
    const ids = await order(page);
    expect(ids.at(-1)).toBe('warnings');
    expect(ids.indexOf('nowcast')).toBeGreaterThan(ids.indexOf('daily'));
    expect(ids.indexOf('daily')).toBeGreaterThan(ids.indexOf('hourly'));
  });

  test('warnings in effect: the card stays first', async ({ page }) => {
    await openPlace(page, 'berlin');
    await expect(page.locator('.card-warnings .alert').first()).toBeVisible();
    expect((await order(page))[0]).toBe('warnings');
  });

  test('warnings that couldn\'t be checked stay first', async ({ page }) => {
    await openPlace(page, 'nairobi', { gdacs: 500 });
    await expect(page.locator('.card-warnings .card-error')).toBeVisible();
    expect((await order(page))[0]).toBe('warnings');
  });

  test('an order saved before the change gets Next 2 hours moved', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('darkbreezy:settings', JSON.stringify({ v: 1, data: { order: ['warnings', 'nowcast', 'hourly', 'daily'] } })));
    await openPlace(page, 'berlin');
    const ids = await order(page);
    expect(ids.indexOf('nowcast')).toBeGreaterThan(ids.indexOf('daily'));
  });
});
