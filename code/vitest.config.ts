import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { projects: [
  { test: { name: 'web', include: ['apps/web/**/*.test.{ts,tsx}'] } },
  { test: { name: 'worker', include: ['apps/worker/**/*.test.ts'] } },
  { test: { name: 'contracts', include: ['packages/contracts/**/*.test.ts'] } },
  { test: { name: 'database', include: ['packages/database/**/*.test.ts'] } },
] } });
