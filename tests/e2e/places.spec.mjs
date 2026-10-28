import { test, expect } from '@playwright/test';
import { fakeServices, recordedAt, openPlace } from './fake-services.mjs';

test('first visit: the welcome page', async ({ page }) => {
  await fakeServices(page);
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Weather, without the clutter' })).toBeVisible();
});

test('search, open, favorite: the app then opens there', async ({ page }) => {
  await page.clock.setFixedTime(recordedAt('berlin'));
  await fakeServices(page);
  await page.goto('./#/search');
  const box = page.getByRole('combobox', { name: 'Search for a place' });
  await box.fill('Berl');
  await expect(page.locator('.results li').first()).toContainText('Berlin');
  await box.press('Enter');
  await expect(page.locator('.hero-place')).toContainText('Berlin');
  await page.getByRole('button', { name: 'Add Berlin to your places' }).click();
  await expect(page.getByRole('button', { name: 'Remove Berlin from your places' })).toHaveAttribute('aria-pressed', 'true');
  await page.goto('./#/');
  await expect(page.locator('.hero-place')).toContainText('Berlin');
  await expect(page).toHaveURL(/#\/place\/52\.52,13\.41\//);
  await page.goto('./#/search');
  await expect(page.locator('.fav-list')).toContainText('Berlin');
  await page.getByRole('button', { name: 'Remove Berlin' }).click();
  await expect(page.locator('.fav-list')).toHaveCount(0);
});

test('coordinates typed in, then named by reverse geocoding', async ({ page }) => {
  await page.clock.setFixedTime(recordedAt('berlin'));
  await fakeServices(page);
  await page.goto('./#/search');
  await page.getByRole('combobox').fill('52.52, 13.41');
  await page.getByRole('combobox').press('Enter');
  await expect(page).toHaveURL(/cc=DE/);
  await expect(page.locator('.hero-place')).toContainText('Berlin');
  await expect(page.locator('.card-pollen')).toBeVisible();
});

test('a share link opens the place for anyone', async ({ page }) => {
  await openPlace(page, 'tokyo');
  await expect(page.locator('.hero-place')).toContainText('Tokyo, Japan');
});

test('use my location', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 52.5201, longitude: 13.4049 });
  await page.clock.setFixedTime(recordedAt('berlin'));
  await fakeServices(page);
  // Only rounded coordinates (about 1 km) leave the browser, the name lookup included.
  const sent = [];
  page.on('request', (r) => { if (/^https:/.test(r.url()) && !/localhost/.test(r.url())) sent.push(r.url()); });
  await page.goto('./#/search');
  await page.getByRole('button', { name: 'Use my location' }).click();
  await expect(page.locator('.hero-place')).toContainText('Berlin');
  expect(sent.some((u) => /photon/.test(u))).toBe(true);
  expect(sent.filter((u) => /52\.5201|13\.4049/.test(u))).toEqual([]);
});

test('settings: units, theme and hidden cards apply at once', async ({ page }) => {
  await openPlace(page, 'berlin');
  await page.goto('./#/settings');
  await page.getByLabel('Measurement system').selectOption('imperial');
  await page.getByRole('radio', { name: 'Dark', exact: true }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('switch', { name: 'Pollen' }).uncheck();
  await page.goBack();
  await expect(page.locator('.card-wind')).toContainText('mph');
  await expect(page.locator('.card-pollen')).toHaveCount(0);
  await page.goto('./#/settings');
  await page.getByLabel('Measurement system').selectOption('metric');
  await page.goBack();
  await expect(page.locator('.card-wind')).toContainText('km/h');
});

test('about lists the data sources', async ({ page }) => {
  await fakeServices(page);
  await page.goto('./#/about');
  await expect(page.getByRole('link', { name: /Open-Meteo/ }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Japan Meteorological Agency/ })).toBeVisible();
  // The credits the data's licences ask for.
  await expect(page.getByText('Contains information licensed under the Open Government Licence – Canada.')).toBeVisible();
  await expect(page.getByText(/Copernicus Atmosphere Monitoring Service information/)).toBeVisible();
});

test('unknown addresses: the app\'s not-found message, and 404.html redirects place paths', async ({ page }) => {
  await fakeServices(page);
  await page.goto('./#/nope');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await page.goto('./404.html');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});

test('settings: every control has a name, and the custom units appear when chosen', async ({ page }) => {
  await fakeServices(page);
  await page.goto('./#/settings');
  for (const name of ['Theme', 'Page width', 'Clock', 'Air quality index', 'Rotate: time on each place']) {
    await expect(page.getByRole('radiogroup', { name })).toBeVisible();
  }
  await expect(page.getByRole('switch', { name: 'World map' })).toBeChecked();
  const units = page.locator('section.settings-group').filter({ has: page.getByRole('heading', { name: 'Units' }) });
  await expect(units.getByLabel('Wind', { exact: true })).toHaveCount(0);
  await page.getByLabel('Measurement system').selectOption('custom');
  await units.getByLabel('Wind', { exact: true }).selectOption('kn');
  await expect(units.getByLabel('Wind', { exact: true })).toHaveValue('kn');
  // Labels off: their parts can't be changed.
  await page.getByRole('switch', { name: 'Map labels' }).uncheck();
  await expect(page.getByRole('group', { name: 'Labels show' }).getByLabel('City')).toBeDisabled();
});

test('a place at sea (no country to find): it shows, and doesn\'t look itself up round and round', async ({ page }) => {
  await page.clock.setFixedTime(recordedAt('berlin'));
  await fakeServices(page);
  const json = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
  await page.route('https://photon.komoot.io/**', (r) => r.fulfill({ status: 200, headers: json, body: '{"features":[]}' }));
  await page.route('https://nominatim.openstreetmap.org/**', (r) => r.fulfill({ status: 200, headers: json, body: '{"error":"Unable to geocode"}' }));
  await page.goto('./#/place/10.00,-30.00/Sea');
  await page.locator('.hero-temp').waitFor();
  const hash = await page.evaluate(() => location.hash);
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => location.hash)).toBe(hash);
  await expect(page.locator('.hero-place')).toContainText('Sea');
});
