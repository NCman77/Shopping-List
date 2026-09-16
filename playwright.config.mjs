import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:4173',
    headless: true,
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'node tests/e2e/static-server.mjs',
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: !process.env.CI
  }
});
