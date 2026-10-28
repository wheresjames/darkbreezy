// The hero's text on the sky (css/layout.css: --on-sky, its shadow and
// scrim): measured against the actual pixels behind each line, across the
// main kinds of sky. Text is hidden for the screenshot (the scrim stays);
// white text is judged against the brightest spots behind it (90th
// percentile), dark text against the darkest (10th). The shadows add more
// on top of what's measured here.
import { test, expect } from '@playwright/test';
import { openPlace } from './fake-services.mjs';
import { readPng, luminance, contrast } from '../helpers/png.mjs';

const DAY = { lat: 52.52, lon: 13.41 };      // morning in Berlin at the fixture's time
const NIGHT = { lat: 35, lon: -166 };        // night, the same instant
const SCENES = [
  ['clear day', DAY, 0, 0], ['partly cloudy day', DAY, 2, 50], ['overcast day', DAY, 3, 100],
  ['fog', DAY, 45, 100], ['rain', DAY, 63, 100], ['snow', DAY, 73, 100], ['clear night', NIGHT, 0, 0], ['cloudy night', NIGHT, 3, 100],
];
const LINES = [['.hero-place', 4.5], ['.hero-temp', 3], ['.hero-condition', 3], ['.hero-meta', 4.5], ['.hero-summary', 4.5], ['.updated > span', 4.5]];

test('hero text stands out on every kind of sky', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'one browser is enough for pixel measurements');
  await page.setViewportSize({ width: 800, height: 700 });
  await openPlace(page, 'berlin');
  // A constructed stylesheet: the page's CSP rightly refuses <style> tags.
  await page.evaluate(() => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync('.hero-side * { color: transparent !important; text-shadow: none !important; } .hero-icon, .updated .icon-btn { visibility: hidden !important; }');
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  });
  const failures = [];
  const report = [];
  for (const [name, at, code, cloud] of SCENES) {
    await page.evaluate(async ([where, c, cl]) => (await import('./js/sky/sky.js')).setSky({ ...where, code: c, cloud: cl }), [at, code, cloud]);
    await page.waitForTimeout(50);
    const { text, boxes } = await page.evaluate((sels) => ({
      text: getComputedStyle(document.documentElement).getPropertyValue('--on-sky').trim(),
      boxes: sels.map((s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r && r.width ? { x: r.x, y: r.y, w: r.width, h: r.height } : null; }),
    }), LINES.map(([s]) => s));
    const png = readPng(await page.screenshot());
    const white = text.toLowerCase() === '#ffffff';
    const textL = white ? 1 : luminance([11, 20, 48]);
    const row = [];
    LINES.forEach(([sel, need], i) => {
      const b = boxes[i];
      if (!b) return;
      const ls = [];
      for (let y = Math.max(0, Math.floor(b.y)); y < Math.min(png.height, b.y + b.h); y += 2) {
        for (let x = Math.max(0, Math.floor(b.x)); x < Math.min(png.width, b.x + b.w); x += 2) ls.push(luminance(png.pixel(x, y)));
      }
      ls.sort((p, q) => p - q);
      const bg = ls[Math.floor(ls.length * (white ? 0.9 : 0.1))];
      const ratio = contrast(textL, bg);
      row.push(`${sel.replace(/^\./, '')} ${ratio.toFixed(1)}`);
      if (ratio < need) failures.push(`${name}, ${sel}: ${ratio.toFixed(2)} < ${need} (${white ? 'white' : 'dark'} text)`);
    });
    report.push(`${name.padEnd(18)} ${white ? 'white' : 'dark '}  ${row.join('  ')}`);
  }
  console.log(report.join('\n'));
  expect(failures).toEqual([]);
});
