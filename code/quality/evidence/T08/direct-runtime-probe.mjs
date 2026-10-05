import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const startedAt = new Date().toISOString();
const state = JSON.parse(fs.readFileSync('.runtime/T08/browser-state.json', 'utf8'));
assert.equal(state.stopped, undefined);
assert.equal(state.origin, 'http://localhost:5173');
const page = await fetch(`${state.origin}/__t08_probe`);
assert.equal(page.status, 200);
assert.match(await page.text(), /Đăng nhập Discord/);
const guest = await fetch(`${state.origin}/api/v1/me`);
assert.equal(guest.status, 401);
const foreign = await fetch(`${state.origin}/api/auth/sign-in/social`, {
  method: 'POST', headers: { Origin: 'http://foreign.invalid', 'Content-Type': 'application/json' },
  body: JSON.stringify({ provider: 'discord', callbackURL: `${state.origin}/__t08_probe` }),
});
assert.equal(foreign.status, 403);
for (const endpoint of ['get-access-token', 'refresh-token']) {
  const response = await fetch(`${state.origin}/api/auth/${endpoint}`, {
    method: 'POST', headers: { Origin: state.origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerId: 'discord' }),
  });
  assert.equal(response.status, 404);
}
const result = 'PASS: compiled AppModule native startup; probe200; guest401; foreign Origin403; provider credential routes404. Real browser OAuth still requires separate verification.\n';
const evidencePath = 'quality/evidence/T08/direct-native-smoke.txt';
fs.writeFileSync(evidencePath, result);
fs.writeFileSync('quality/evidence/T08/direct-native-verification.json', JSON.stringify({
  command: 'node quality/evidence/T08/direct-runtime-probe.mjs', cwd: 'E:/FGweb/code',
  startedAt, completedAt: new Date().toISOString(), exitCode: 0, evidencePath,
  evidenceSha256: createHash('sha256').update(result).digest('hex'),
  serverPid: state.pid, schemaName: state.schemaName,
}, null, 2));
console.log(result.trim());
