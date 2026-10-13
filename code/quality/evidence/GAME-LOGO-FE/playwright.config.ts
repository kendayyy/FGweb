import {defineConfig,devices} from '@playwright/test';
import path from 'node:path';
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve('.cache/ms-playwright');
export default defineConfig({testDir:path.resolve('tests/e2e'),testMatch:'game-logos.spec.ts',outputDir:path.resolve('.cache/game-logos/results'),workers:1,retries:0,timeout:45000,reporter:'line',use:{...devices['Desktop Chrome'],headless:false,trace:'off',video:'off',screenshot:'off'}});
