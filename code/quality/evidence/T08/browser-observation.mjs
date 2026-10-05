import fs from 'node:fs';
import { Client } from 'pg';
const state = JSON.parse(fs.readFileSync('.runtime/T08/browser-state.json', 'utf8'));
if (state.stopped || !/^t08_browser_[a-f0-9]{32}$/.test(state.schemaName)) throw new Error('Active owned browser schema required');
const client = new Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  const result = await client.query(`SELECT
    (SELECT count(*)::int FROM "${state.schemaName}"."user") AS users,
    (SELECT count(*)::int FROM "${state.schemaName}"."account" WHERE provider_id='discord') AS discord_accounts,
    (SELECT count(*)::int FROM "${state.schemaName}"."session" WHERE expires_at > now()) AS active_sessions`);
  const observation = { observedAt: new Date().toISOString(), schemaName: state.schemaName, ...result.rows[0], browserAuthenticatedHttp200: 'not yet independently observed' };
  fs.writeFileSync('quality/evidence/T08/browser-observation.json', JSON.stringify(observation, null, 2));
  console.log(JSON.stringify(observation));
} finally {
  await client.end();
}
