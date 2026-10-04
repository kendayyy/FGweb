import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';

test('browser readiness fails when project browser binaries are absent', () => {
  const result = spawnSync(process.execPath, ['quality/evidence/T01/browser-smoke.mjs'], {
    encoding: 'utf8', timeout: 15000,
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: path.resolve('.cache/missing-browser-regression') },
  });
  assert.equal(result.signal, null, 'probe must terminate itself');
  assert.equal(result.status, 1, 'missing browser must never return success');
});

test('service readiness fails fast when local credentials are absent', () => {
  const result = spawnSync(process.execPath, ['quality/evidence/T01/services-readiness.mjs'], {
    encoding: 'utf8', timeout: 10000,
    env: { ...process.env, FG_LOCAL_ENV_PATH: path.resolve('.cache/missing-service-env-regression') },
  });
  assert.equal(result.signal, null, 'probe must terminate itself');
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stdout + result.stderr, /password=|secret=/i);
});
