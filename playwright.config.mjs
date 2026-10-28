// End-to-end tests (DARKBREEZY.md §8, step 1.9). Every weather service is
// answered from tests/fixtures (tests/e2e/fake-services.mjs), so they need
// no network.
//
//   npx playwright test                     the unbuilt site in web/
//   npm run test:e2e:dist                   the built site in dist/web
//   npx playwright test --update-snapshots  after an intended visual change

import { defineConfig, devices } from '@playwright/test';

const PORT = 8740;
const root = process.env.DARKBREEZY_E2E_ROOT || 'web';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '*.spec.mjs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01 } },
  snapshotPathTemplate: '{testDir}/screenshots/{arg}-{projectName}{ext}',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: 'retain-on-failure',
    // The offline worker would answer requests the tests fake with page.route.
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: {
    command: `node scripts/serve.mjs ${root} ${PORT}`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
  },
});
