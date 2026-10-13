import {defineConfig} from 'drizzle-kit';
// Schema generation only; no database connection or main migration.
export default defineConfig({schema:'./packages/database/src/index.ts',out:'./packages/database/migrations',dialect:'postgresql',migrations:{schema:'fg_migrations'}});
