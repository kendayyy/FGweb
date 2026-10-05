import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Client } from 'pg';
import { parseEnv } from 'node:util';
const startedAt = new Date().toISOString();
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const state = JSON.parse(fs.readFileSync('.runtime/T08/browser-state.json', 'utf8'));
assert.equal(state.stopped, true);
assert.equal(state.cleanupFailed, false);
const client = new Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  const result = await client.query('SELECT count(*)::int AS count FROM pg_namespace WHERE nspname=$1', [state.schemaName]);
  assert.equal(result.rows[0].count, 0, 'Owned browser schema must be cleaned');
} finally { await client.end(); }
const env = parseEnv(fs.readFileSync('.env.local', 'utf8'));
const secrets = Object.entries(env).filter(([key,value]) => /SECRET|PASSWORD|PRIVATE_KEY/.test(key) && value.length > 8);
function scan(directory) {
  for (const entry of fs.readdirSync(directory, {withFileTypes:true})) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) scan(file);
    else if (entry.isFile()) {
      const content = fs.readFileSync(file).toString();
      for (const [key,value] of secrets) assert.equal(content.includes(value), false, `Private ${key} found in evidence: ${file}`);
    }
  }
}
scan('quality/evidence/T08');
const baseline = JSON.parse(fs.readFileSync('quality/spec-baseline.json', 'utf8'));
for (const [key,file] of Object.entries({specSha256:'../.doc/01-product-spec.md',designSha256:'../.doc/02-frontend-design.md',taskSha256:'../.doc/task.md',mockupLobbySha256:'../.doc/mockups/01-lobby-desktop-mobile.png',mockupCallSha256:'../.doc/mockups/02-group-call-live.png'})) assert.equal(hash(file).toLowerCase(), baseline.hashes[key].toLowerCase());
const evidencePath = 'quality/evidence/T08/closeout-audit.txt';
const report = 'PASS: owned browser schema removed; signal cleanup confirmed; current configured secrets absent from T08 evidence; five baseline hashes unchanged.\n';
fs.writeFileSync(evidencePath, report);
fs.writeFileSync('quality/evidence/T08/closeout-audit-verification.json', JSON.stringify({command:'node --env-file=.env.local quality/evidence/T08/closeout-audit.mjs',cwd:'E:/FGweb/code',startedAt,completedAt:new Date().toISOString(),exitCode:0,evidencePath,evidenceSha256:hash(evidencePath)},null,2));
console.log(report.trim());
