import {defineConfig} from 'vitest/config';
export default defineConfig({test:{environment:'node',include:['quality/evidence/T38-FEED-DATA/regression-tests/pending-uploads.test.ts'],testTimeout:30000,hookTimeout:120000}});
