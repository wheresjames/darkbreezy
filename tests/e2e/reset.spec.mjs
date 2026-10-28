import { test, expect } from '@playwright/test';
import { openPlace, withFavorites } from './fake-services.mjs';

// The cache buster ends by reloading stylesheets and images on a hidden
// blob: page (cache-bust.js refreshMemory). With frame-src missing from
// the CSP that page was blocked, and every refresh waited out a
// 15-second timeout at 100%.
test('the reset page refreshes the whole app in a few seconds, not 15', async ({ page }) => {
  const blocked = [];
  page.on('console', (m) => { if (/Content[- ]Security[- ]Policy|CSP/i.test(m.text())) blocked.push(m.text()); });
  await page.goto('./reset.html');
  await expect(page.locator('#reset-done')).toBeVisible({ timeout: 4000 });
  expect(blocked).toEqual([]);
});

test('nothing the dashboard loads is blocked by its security policy', async ({ page }) => {
  const blocked = [];
  page.on('console', (m) => { if (/Content[- ]Security[- ]Policy|CSP/i.test(m.text())) blocked.push(m.text()); });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await withFavorites(page, ['berlin', 'tokyo']);
  await openPlace(page, 'berlin');
  await expect(page.locator('.card-loading')).toHaveCount(0);
  await page.evaluate(async () => {
    const { refreshMemory } = await import('./js/cache-bust.js');
    const t = performance.now();
    await refreshMemory([new URL('css/base.css', location.href).href, new URL('assets/icons.svg', location.href).href]);
    if (performance.now() - t > 3000) throw new Error('refreshMemory waited for its timeout');
  });
  expect(blocked).toEqual([]);
});
