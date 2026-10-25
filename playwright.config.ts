import { defineConfig } from '@playwright/test';

const phone = { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:4173' },
  // CI already ran `npm run build` (dictionary included). Starting preview only avoids building it again.
  webServer: {
    command: process.env.CI ? 'npm run preview' : 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    { name: 'webkit-phone', use: { browserName: 'webkit', ...phone }, testIgnore: /offline-reload/ },
    // Playwright's WebKit build hangs reloading a service-worker page with the server gone; the
    // offline check runs in Chromium here; it was also checked by hand in Safari on the simulator
    // (docs/plans/2026-09-26-m2-m4-notes.md).
    { name: 'chromium-phone', use: { browserName: 'chromium', ...phone }, testMatch: /offline-reload/ },
  ],
});
