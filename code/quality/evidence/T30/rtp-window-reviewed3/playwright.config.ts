import {defineConfig} from '@playwright/test';
import path from 'node:path';
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve('.cache/ms-playwright');
export default defineConfig({testDir:path.resolve('quality/evidence/T30/rtp-window-reviewed3'),testMatch:'screen-share-diagnostic.spec.ts',workers:1,retries:0,timeout:360000,outputDir:path.resolve('.cache/t30/playwright-results-rtp-window3'),reporter:'list',use:{headless:false,trace:'off',video:'off',screenshot:'off'}});
