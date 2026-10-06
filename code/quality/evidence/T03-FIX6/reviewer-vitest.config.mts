import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['quality/evidence/T03-FIX6/reviewer-contracts.test.ts'],environment:'node'}});
