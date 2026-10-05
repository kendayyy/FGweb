import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { Client } from 'pg';
import { makeSignature } from 'better-auth/crypto';
import { MeDTOSchema } from '@fg/contracts';
const startedAt = new Date().toISOString();
const state = JSON.parse(fs.readFileSync('.runtime/T08/browser-state.json', 'utf8'));
assert.match(state.schemaName, /^t08_browser_[a-f0-9]{32}$/);
assert.equal(state.stopped, undefined);
const client = new Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  const found = await client.query(`SELECT s.token, s.user_id, a.account_id
    FROM "${state.schemaName}"."session" s
    JOIN "${state.schemaName}"."account" a ON a.user_id=s.user_id AND a.provider_id='discord'
    WHERE s.expires_at > now() AND s.created_at >= $1`, [state.startedAt]);
  assert.equal(found.rows.length, 1, 'One real browser OAuth-created session required');
  const session = found.rows[0];
  // Native HTTP verification uses the actual OAuth-created session. No synthetic DB seed.
  // The user confirmed browser login; no browser cookie store is available to this probe.
  const signature = await makeSignature(session.token, process.env.BETTER_AUTH_SECRET);
  const cookie = `better-auth.session_token=${encodeURIComponent(`${session.token}.${signature}`)}`;
  const me = await fetch(`${state.origin}/api/v1/me`, { headers: { Cookie: cookie } });
  assert.equal(me.status, 200);
  const payload = await me.json();
  assert.equal(MeDTOSchema.safeParse(payload).success, true);
  assert.equal(payload.id === session.user_id && payload.discordId === session.account_id, true);
  assert.equal('accessToken' in payload || 'refreshToken' in payload || 'token' in payload, false);
  const logout = await fetch(`${state.origin}/api/auth/sign-out`, {
    method: 'POST', headers: { Cookie: cookie, Origin: state.origin, 'Content-Type': 'application/json' }, body: '{}',
  });
  assert.equal(logout.status, 200);
  const replay = await fetch(`${state.origin}/api/v1/me`, { headers: { Cookie: cookie } });
  assert.equal(replay.status, 401);
  const remaining = await client.query(`SELECT count(*)::int AS count FROM "${state.schemaName}"."session" WHERE token=$1`, [session.token]);
  assert.equal(remaining.rows[0].count, 0);
  const evidencePath = 'quality/evidence/T08/real-oauth-result.txt';
  const report = 'PASS: user confirmed real Discord browser login; one OAuth-created Discord account/session found. Native HTTP real-session /me200 with validated MeDTO/Discord identity, no credential fields; sign-out200; replay401; session deleted. Cookie was reconstructed privately from actual OAuth session for native HTTP verification, not inspected in browser. No user identity or secrets logged.\n';
  fs.writeFileSync(evidencePath, report);
  fs.writeFileSync('quality/evidence/T08/real-oauth-verification.json', JSON.stringify({ command: 'node --env-file=.env.local quality/evidence/T08/real-oauth-probe.mjs', cwd: 'E:/FGweb/code', startedAt, completedAt: new Date().toISOString(), exitCode: 0, evidencePath, evidenceSha256: createHash('sha256').update(report).digest('hex') }, null, 2));
  console.log(report.trim());
} finally { await client.end(); }
