import { defineConfig } from 'vitest/config';
export default defineConfig({test:{environment:'jsdom',include:['quality/evidence/T17-FE/*review.test.tsx'],setupFiles:['apps/web/test/setup.ts'],testTimeout:10000,maxWorkers:2}});
