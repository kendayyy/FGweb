import {defineConfig} from '@playwright/test';
import path from 'node:path';
export default defineConfig({
  testDir:path.resolve('tests/e2e'),testMatch:'feed.spec.ts',
  fullyParallel:false,workers:1,retries:0,timeout:240000,
  outputDir:path.resolve('.runtime/t38-feed-fe/playwright-output'),
  reporter:[['line']],
  use:{browserName:'chromium',channel:'chrome',headless:false,viewport:{width:1440,height:900},reducedMotion:'reduce',trace:'off',video:'off',screenshot:'off'},
});
