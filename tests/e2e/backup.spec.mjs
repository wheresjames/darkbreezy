// Settings › Advanced › Back up and move (util/backup.js, views/import.js).
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openPlace, withFavorites } from './fake-services.mjs';

const advanced = async (page) => {
  await page.goto('./#/settings');
  await page.locator('details.advanced summary').click();
};
const stored = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem(`darkbreezy:${k}`) || 'null')?.data, key);

test('export a file, import it in another browser: places added, settings too', async ({ page, browser }) => {
  await withFavorites(page, ['berlin', 'tokyo']);
  await openPlace(page, 'berlin');
  await advanced(page);
  await page.getByRole('radio', { name: 'Dark' }).check();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export file' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^darkbreezy-settings-\d{4}-\d{2}-\d{2}\.json$/);
  const file = await download.path();
  expect(JSON.parse(readFileSync(file, 'utf8')).favorites.map((p) => p.name)).toEqual(['Berlin', 'Tokyo']);

  // Somewhere else, with a place of its own.
  const other = await (await browser.newContext()).newPage();
  await withFavorites(other, ['sydney', 'berlin']);
  await openPlace(other, 'sydney');
  await advanced(other);
  await other.locator('input[type=file]').setInputFiles(file);
  const panel = other.locator('.import-panel');
  await expect(panel).toContainText('2 places: Berlin, Tokyo');
  await expect(panel).toContainText('Theme Dark');
  await panel.getByRole('button', { name: 'Import' }).click();
  await expect(other.locator('.backup-status')).toContainText('Imported 2 places and settings.');
  expect((await stored(other, 'favorites')).list.map((p) => p.name)).toEqual(['Sydney', 'Berlin', 'Tokyo']);
  expect((await stored(other, 'settings')).theme).toBe('dark');
});

test('a shared link: asks first, then places only replace yours when chosen', async ({ page, context }) => {
  await withFavorites(page, ['berlin', 'tokyo']);
  await openPlace(page, 'berlin');
  await advanced(page);
  await page.getByRole('radio', { name: 'Places only' }).check();
  // The copy, not the share sheet; what's copied kept here (Firefox can't be granted the clipboard).
  await page.evaluate(() => {
    delete Navigator.prototype.share;
    navigator.clipboard.writeText = (text) => { window.copied = text; return Promise.resolve(); };
  });
  await page.getByRole('button', { name: 'Share link' }).click();
  await expect(page.locator('.backup-status')).toContainText('Link copied');
  const link = await page.evaluate(() => window.copied);
  expect(link).toMatch(/#\/import\/[zj][A-Za-z0-9_-]+$/);

  const other = await (await context.browser().newContext()).newPage();
  await withFavorites(other, ['sydney']);
  await openPlace(other, 'sydney');
  await other.goto(link.replace(/^.*#/, './#'));
  await expect(other.locator('.import-panel')).toContainText('2 places: Berlin, Tokyo');
  await expect(other.locator('.import-settings')).toHaveCount(0);   // places only
  expect((await stored(other, 'favorites')).list.map((p) => p.name)).toEqual(['Sydney']);   // nothing yet
  await other.getByRole('radio', { name: 'Replace my places' }).check();
  await other.getByRole('button', { name: 'Import' }).click();
  await expect(other.locator('.import-page [role=status]')).toContainText('Imported 2 places.');
  expect((await stored(other, 'favorites')).list.map((p) => p.name)).toEqual(['Berlin', 'Tokyo']);
  await other.getByRole('button', { name: 'Go to the dashboard' }).click();
  await expect(other.locator('.hero-place')).toContainText('Berlin');
});

test('paste: from a box when reading the clipboard isn\'t allowed; nonsense is refused', async ({ page }) => {
  await openPlace(page, 'berlin');
  await advanced(page);
  await page.evaluate(() => { navigator.clipboard.readText = () => Promise.reject(new Error('denied')); });
  await page.getByRole('button', { name: 'Paste' }).click();
  const box = page.getByRole('textbox', { name: 'Backup or link to import' });
  await box.fill('{"hello": "world"}');
  await page.getByRole('button', { name: 'Read it' }).click();
  await expect(page.locator('.backup-status')).toContainText('isn\'t a Dark Breezy backup');
  await box.fill(JSON.stringify({ app: 'darkbreezy', kind: 'places', version: 5, favorites: [{ name: 'Nairobi', lat: -1.29, lon: 36.82, cc: 'KE' }] }));
  await page.getByRole('button', { name: 'Read it' }).click();
  await expect(page.locator('.import-panel')).toContainText('1 place: Nairobi');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('.import-panel')).toHaveCount(0);
});

test('a damaged link says so and changes nothing', async ({ page }) => {
  await openPlace(page, 'berlin');
  await page.goto('./#/import/zAbCdEf');
  await expect(page.locator('.card-error')).toContainText('damaged or cut short');
});
