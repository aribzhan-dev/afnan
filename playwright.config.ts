import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: 'http://127.0.0.1:8001',
    browserName: 'chromium',
    channel: 'chrome',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: '.venv/bin/python scripts/test_server.py',
    url: 'http://127.0.0.1:8001/api/health',
    reuseExistingServer: false,
    timeout: 30000,
  },
  reporter: 'list',
});
