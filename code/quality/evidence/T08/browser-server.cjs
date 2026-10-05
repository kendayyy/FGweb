/* eslint-disable @typescript-eslint/no-require-imports */
// Temporary local verification harness. Not a production entrypoint or authentication bypass.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const pg = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const { migrate } = require('drizzle-orm/node-postgres/migrator');
const { NestFactory } = require('@nestjs/core');
const codeRoot = path.resolve(__dirname, '../../..');
const stateFile = path.join(codeRoot, '.runtime/T08/browser-state.json');
const schemaName = 't08_browser_' + randomUUID().replaceAll('-', '');
let client;
let app;
let created = false;
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  const failures = [];
  try { if (app) await app.close(); } catch (error) { failures.push(error); }
  try {
    if (created && /^t08_browser_[a-f0-9]{32}$/.test(schemaName)) {
      await client.query(`DROP SCHEMA "${schemaName}" CASCADE`);
    }
  } catch (error) { failures.push(error); }
  try { if (client) await client.end(); } catch (error) { failures.push(error); }
  if (fs.existsSync(stateFile)) fs.writeFileSync(stateFile, JSON.stringify({ schemaName, stopped: true, cleanupFailed: failures.length > 0 }));
  if (failures.length) throw new AggregateError(failures, 'Owned browser fixture cleanup failed');
}
async function start() {
  if (process.cwd() !== codeRoot) throw new Error('Run only from code directory');
  const origin = new URL(process.env.PUBLIC_ORIGIN);
  const dbUrl = new URL(process.env.DATABASE_URL);
  if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('Local HTTP origin required');
  if (!['localhost', '127.0.0.1'].includes(dbUrl.hostname)) throw new Error('Local database required');
  if (new URL(process.env.BETTER_AUTH_URL).origin !== origin.origin) throw new Error('Same origin required');
  client = new pg.Client({ connectionString: dbUrl.href });
  await client.connect();
  await client.query(`CREATE SCHEMA "${schemaName}"`);
  created = true;
  await client.query(`SET search_path TO "${schemaName}"`);
  const schema = await import('@fg/database');
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.join(codeRoot, 'packages/database/migrations'), migrationsSchema: schemaName });
  await schema.seedGames(db);
  dbUrl.searchParams.set('options', [dbUrl.searchParams.get('options'), '-c search_path=' + schemaName].filter(Boolean).join(' '));
  process.env.DATABASE_URL = dbUrl.href;
  const { AppModule } = await import(pathToFileURL(path.join(codeRoot, 'apps/api/dist/app.module.js')).href);
  app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  app.getHttpAdapter().getInstance().get('/__t08_probe', (_request, response) => {
    response.type('html').send(fs.readFileSync(path.join(__dirname, 'browser-probe.html'), 'utf8'));
  });
  await app.listen(Number(origin.port || 80), '127.0.0.1');
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify({ schemaName, pid: process.pid, origin: origin.origin, startedAt: new Date().toISOString() }));
  console.log('T08 browser probe ready: ' + origin.origin + '/__t08_probe');
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  stop().then(() => process.exit(0)).catch(() => { console.error('Owned fixture cleanup failed; no credentials printed'); process.exit(1); });
});
start().catch(async (error) => {
  console.error('Browser probe startup failed: ' + (error.code || error.name));
  if (error.name === 'TypeError' && !String(error.message).includes('://')) console.error(error.message);
  try { await stop(); } catch { console.error('Owned fixture cleanup failed'); }
  process.exitCode = 1;
});
