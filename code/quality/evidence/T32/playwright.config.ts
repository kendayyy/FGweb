import {defineConfig} from '@playwright/test';
import path from 'node:path';
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve('.cache/ms-playwright');
export default defineConfig({testDir:path.resolve('tests/e2e'),testMatch:'external-live.spec.ts',workers:1,retries:0,timeout:360000,outputDir:path.resolve('.cache/t32/playwright-results'),reporter:'list',use:{headless:false,trace:'off',video:'off',screenshot:'off'}});
