import { defineConfig, devices } from '@playwright/test';

// Les tests tournent contre le site servi en local (aucun build).
// CHROME=1 utilise le Chrome installé sur la machine au lieu du Chromium de Playwright.
const useChrome = !!process.env.CHROME;
const PORT = Number(process.env.PORT || 4173);

export default defineConfig({
  testDir: 'tests',
  testMatch: '**/*.spec.mjs',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'en-US',
    timezoneId: 'Europe/Paris',
    trace: 'retain-on-failure',
    ...(useChrome ? { channel: 'chrome' } : {}),
  },
  projects: [
    { name: 'bureau', use: { ...devices['Desktop Chrome'], ...(useChrome ? { channel: 'chrome' } : {}) } },
    { name: 'mobile', use: { ...devices['Pixel 7'], ...(useChrome ? { channel: 'chrome' } : {}) }, grep: /@mobile/ },
  ],
  webServer: {
    command: `node tools/serve.mjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
  },
});
