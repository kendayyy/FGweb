import { defineConfig } from 'drizzle-kit';
import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  const envPath = path.resolve(__dirname, '../../.env.local');
  if (fs.existsSync(envPath)) {
    const env = parseEnv(fs.readFileSync(envPath, 'utf8'));
    return env.DATABASE_URL || '';
  }
  return '';
}

export default defineConfig({
  schema: './src/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  // Application journal is separate from historical disposable-test artifacts.
  migrations: { schema: 'fg_migrations' },
  dbCredentials: {
    url: getDatabaseUrl(),
  },
});
