import {defineConfig,devices} from '@playwright/test';
import path from 'node:path';
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve('.cache/ms-playwright');
export default defineConfig({testDir:path.resolve('quality/evidence/T25'),testMatch:'roster.spec.ts',outputDir:path.resolve('.cache/t25',path.basename(process.env.FG_T25_EVIDENCE_DIR??'headed-local')),workers:1,retries:0,timeout:120000,reporter:'line',use:{...devices['Desktop Chrome'],headless:false,actionTimeout:15000,trace:'off',video:'off',screenshot:'off'}});
