import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve('.cache/ms-playwright');

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: '.cache/playwright-results',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
