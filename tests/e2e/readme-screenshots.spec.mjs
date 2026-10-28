// The README's screenshots (docs/screenshots), against the real services: npm run screenshots
import { test, expect } from '@playwright/test';
test.skip(!process.env.README_SHOTS, 'only when asked');
test.setTimeout(120000);
const FAVS = [
  ['Jacksonville', 'Florida', 'United States', 'US', 30.33, -81.66],
  ['Berlin', 'Berlin', 'Germany', 'DE', 52.52, 13.41],
  ['Tokyo', 'Tokyo', 'Japan', 'JP', 35.69, 139.69],
  ['Sydney', 'New South Wales', 'Australia', 'AU', -33.87, 151.21],
  ['Reykjavík', 'Capital Region', 'Iceland', 'IS', 64.15, -21.94],
  ['Nairobi', 'Nairobi', 'Kenya', 'KE', -1.29, 36.82],
].map(([name, admin1, country, cc, lat, lon]) => ({ id: `${lat.toFixed(2)},${lon.toFixed(2)}`, name, admin1, country, cc, lat, lon }));
const PLACE = '#/place/30.33,-81.66/Jacksonville?n=Jacksonville&a=Florida&c=United+States&cc=US';

for (const [name, width, height, theme] of [['desktop', 1440, 1000, 'dark'], ['large-screen', 2560, 1300, 'dark'], ['phone', 390, 844, 'light']]) {
  test(name, async ({ page }) => {
    await page.addInitScript(([favs, theme]) => {
      localStorage.setItem('darkbreezy:favorites', JSON.stringify({ v: 1, data: { list: favs } }));
      localStorage.setItem('darkbreezy:settings', JSON.stringify({ v: 4, data: { theme } }));
    }, [FAVS, theme]);
    await page.setViewportSize({ width, height });
    await page.goto(`./${PLACE}`);
    await page.locator('.hero-temp').waitFor({ timeout: 30000 });
    await expect(page.locator('.radar-loading')).toHaveCount(0, { timeout: 60000 });   // every radar frame in
    await page.waitForTimeout(3000);   // the map's temperatures
    await page.screenshot({ path: `docs/screenshots/${name}.png` });
  });
}
