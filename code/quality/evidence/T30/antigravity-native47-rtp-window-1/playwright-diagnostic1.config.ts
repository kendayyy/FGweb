import {defineConfig} from '@playwright/test';
import path from 'node:path';

process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve('.cache/ms-playwright');

export default defineConfig({
  testDir: path.resolve('quality/evidence/T30/antigravity-native47-rtp-window-1'),
  testMatch: 'screen-share-diagnostic1.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 360000,
  outputDir: path.resolve('.cache/t30/playwright-results-diag1'),
  reporter: 'list',
  use: {
    headless: false,
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
});
