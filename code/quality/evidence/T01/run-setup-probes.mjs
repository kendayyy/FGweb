import { spawnSync } from 'node:child_process';

for (const file of ['services-readiness.mjs', 'browser-smoke.mjs']) {
  const result = spawnSync(process.execPath, [`quality/evidence/T01/${file}`], { stdio: 'inherit' });
  if (result.status !== 0) { process.exitCode = 1; break; }
}
