import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    name: 'lifecycle-noop-write',
    include: ['quality/evidence/T30/antigravity-lifecycle-noop-write-1/**/*.spec.ts'],
    testTimeout: 60000,
    hookTimeout: 60000,
    globals: true,
    environment: 'node',
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
  resolve: {
    alias: {
      '@fg/database': path.resolve(process.cwd(), 'packages/database/dist/index.js'),
      '@fg/contracts': path.resolve(process.cwd(), 'packages/contracts/dist/index.js'),
    },
  },
});
