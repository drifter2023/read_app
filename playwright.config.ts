import { defineConfig } from '@playwright/test';

const phone = { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:4173' },
  webServer: { command: 'npm run build && npm run preview', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 180_000 },
  projects: [
    { name: 'webkit-phone', use: { browserName: 'webkit', ...phone }, testIgnore: /offline-reload/ },
    // Playwright's WebKit build hangs reloading a service-worker page with the server gone; the
    // offline check runs in Chromium here and in Safari on the simulator (docs/perf/m4-offline.md).
    { name: 'chromium-phone', use: { browserName: 'chromium', ...phone }, testMatch: /offline-reload/ },
  ],
});
