import { test, expect } from '@playwright/test';
import { openPlace, fakeServices, recordedAt, placeUrl } from './fake-services.mjs';

// The fixture has RainViewer's 13 frames: 2 hours, every 10 minutes.
const scrub = (page) => page.getByRole('slider', { name: 'Radar frame' });

test('the radar loop plays the last 2 hours by itself, starting from the latest frame', async ({ page }) => {
  await openPlace(page, 'berlin');
  const radar = page.locator('.card-radar');
  await expect(scrub(page)).toHaveAttribute('max', '12');
  await expect(radar.locator('.radar-layer')).toHaveCount(13);
  await expect(radar.locator('.radar-when')).toHaveText('Latest');
  await expect(radar.getByRole('button', { name: 'Pause radar' })).toBeVisible();
  // After holding on the latest frame it starts over from the oldest.
  await expect(scrub(page)).not.toHaveValue('12', { timeout: 6000 });
  await expect(radar.locator('.radar-layer.is-shown')).toHaveCount(1);
});

test('pause, and step through the frames by hand', async ({ page }) => {
  await openPlace(page, 'berlin');
  const radar = page.locator('.card-radar');
  await radar.getByRole('button', { name: 'Pause radar' }).click();
  await scrub(page).fill('0');
  await expect(radar.locator('.radar-when')).toHaveText('−120 min');
  await expect(radar.getByRole('button', { name: 'Play radar' })).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(scrub(page)).toHaveValue('0');
  const shown = await radar.locator('.radar-layer').evaluateAll((ls) => ls.findIndex((l) => l.classList.contains('is-shown')));
  expect(shown).toBe(0);
});

test('autoplay off in settings: it waits on the latest frame', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('darkbreezy:settings', JSON.stringify({ v: 2, data: { radarAutoplay: false } })));
  await openPlace(page, 'berlin');
  await expect(page.locator('.card-radar').getByRole('button', { name: 'Play radar' })).toBeVisible();
  await page.waitForTimeout(3000);
  await expect(scrub(page)).toHaveValue('12');
});

test('reduced motion: it doesn\'t play by itself', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openPlace(page, 'berlin');
  await expect(page.locator('.card-radar').getByRole('button', { name: 'Play radar' })).toBeVisible();
  await page.waitForTimeout(3000);
  await expect(scrub(page)).toHaveValue('12');
});

test('settings has the switch', async ({ page }) => {
  await openPlace(page, 'berlin');
  await page.goto('./#/settings');
  await expect(page.getByRole('switch', { name: 'Play the radar loop' })).toBeChecked();
});

test('the radar list is fetched again when RainViewer\'s next frame is out, not before', async ({ page }) => {
  const { fakeServices, placeUrl } = await import('./fake-services.mjs');
  const { readFileSync } = await import('node:fs');
  const rv = JSON.parse(readFileSync(new URL('../fixtures/recorded/rainviewer-maps.json', import.meta.url), 'utf8'));
  const newest = rv.radar.past.at(-1).time * 1000;
  // Three minutes after the newest frame: the next one is due at +11.5 minutes.
  await page.clock.install({ time: newest + 3 * 60e3 });
  let asks = 0;
  await fakeServices(page);
  page.on('request', (r) => { if (r.url().startsWith('https://api.rainviewer.com/')) asks++; });
  await page.goto(`./${placeUrl('berlin')}`);
  await page.locator('.radar-scrub').waitFor();
  expect(asks).toBe(1);
  await page.clock.runFor(8 * 60e3);           // newest + 11 min: not yet
  expect(asks).toBe(1);
  await page.clock.runFor(60e3);               // newest + 12 min: due (11.5)
  await expect.poll(() => asks).toBe(2);
  // The fake still has no newer frame: it asks again a minute later.
  await page.clock.runFor(61e3);
  await expect.poll(() => asks).toBe(3);
});

test('rate limited by RainViewer: it waits a minute and fills in every tile, instead of leaving holes', async ({ page }) => {
  const { fakeServices, placeUrl, recordedAt } = await import('./fake-services.mjs');
  await page.clock.install({ time: recordedAt('berlin') });
  // Like RainViewer: over the limit for a while, then fine again (a time window, not a count).
  let limited = true;
  let refused = 0;
  await fakeServices(page, { tiles: (n) => (limited && n > 30 ? (refused++, 429) : 0) });
  await page.goto(`./${placeUrl('berlin')}`);
  await page.locator('.radar-scrub').waitFor();
  await page.clock.runFor(5000);
  await expect(page.locator('.radar-loading')).toBeVisible();
  await page.clock.runFor(20e3);
  const refusedWhileLimited = refused;
  limited = false;
  // The clock jumps; the (fake) network still takes real milliseconds: step, and let it answer.
  await expect.poll(async () => { await page.clock.runFor(5000); return page.locator('.radar-loading').count(); }, { timeout: 20000 }).toBe(0);
  const missing = await page.locator('.card-radar .radar-layer img').evaluateAll((imgs) => imgs.filter((i) => !i.src.startsWith('blob:')).length);
  expect(missing).toBe(0);
  // It stopped asking once refused: a handful of refusals, not the rest of the 117.
  expect(refusedWhileLimited).toBeLessThanOrEqual(8);
});

test('the large radar asks RainViewer for tiles at a pace, not all 325 at once', async ({ page }) => {
  const { fakeServices, placeUrl, recordedAt } = await import('./fake-services.mjs');
  await page.setViewportSize({ width: 3440, height: 1300 });
  await page.clock.install({ time: recordedAt('berlin') });
  const asks = [];
  await fakeServices(page, { tiles: () => { asks.push(Date.now()); return 0; } });
  await page.goto(`./${placeUrl('berlin')}`);
  await page.locator('.feature-radar .radar-scrub').waitFor();
  await page.clock.runFor(1000);
  expect(asks.length).toBeLessThanOrEqual(125);   // the burst (120), and a second at 5 a second
  await expect.poll(async () => { await page.clock.runFor(2000); return asks.length; }, { timeout: 20000 }).toBe(325);
  await expect.poll(async () => { await page.clock.runFor(1000); return page.locator('.radar-loading').count(); }, { timeout: 10000 }).toBe(0);
});

test('a map tile that doesn\'t load leaves a gap, not a broken-image box', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.clock.setFixedTime(recordedAt('berlin'));
  await fakeServices(page);
  await page.route(/https:\/\/gibs\.earthdata\.nasa\.gov\//, (r) => r.fulfill({ status: 500, body: '' }));
  await page.goto(`./${placeUrl('berlin')}`);
  const tiles = page.locator('.card-radar img.tile-base');
  await expect(tiles.first()).toBeAttached();
  await expect.poll(() => tiles.evaluateAll((imgs) => imgs.every((i) => getComputedStyle(i).visibility === 'hidden'))).toBe(true);
});
