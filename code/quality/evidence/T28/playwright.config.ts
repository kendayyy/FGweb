import {defineConfig,devices} from '@playwright/test';
import path from 'node:path';
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve('.cache/ms-playwright');
export default defineConfig({testDir:path.resolve('tests/e2e'),testMatch:'voice.spec.ts',outputDir:path.resolve('.cache/t28',path.basename(process.env.FG_T28_EVIDENCE_DIR??'headed-local')),workers:1,retries:0,timeout:240000,reporter:'line',use:{...devices['Desktop Chrome'],headless:false,actionTimeout:20000,trace:'off',video:'off',screenshot:'off',launchOptions:{args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required']}}});
