import { defineConfig } from 'vitest/config';
export default defineConfig({test:{environment:'jsdom',include:['quality/evidence/T17-FE/dm-incomplete-pages-review.test.tsx'],setupFiles:['apps/web/test/setup.ts'],testTimeout:10000}});
