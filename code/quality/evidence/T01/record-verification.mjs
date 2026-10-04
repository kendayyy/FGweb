import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const node = process.execPath;
const npm = path.join(path.dirname(node), 'node_modules/npm/bin/npm-cli.js');
const evidence = 'quality/evidence/T01';
const commands = [
  ['ci', node, [npm, 'ci']],
  ['dependencies', node, [npm, 'ls', '--all', '--json']],
  ['audit', node, [npm, 'audit', '--json']],
  ['lint', node, [npm, 'run', 'lint']],
  ['typecheck', node, [npm, 'run', 'typecheck']],
  ['regression', node, [npm, 'run', 'test:setup']],
  ['drizzle', node, ['quality/evidence/T01/drizzle-probe.mjs']],
  ['vite', node, ['quality/evidence/T01/vite-probe.mjs']],
  ['readiness', node, [npm, 'run', 'verify']],
  ['compose', 'docker', ['compose', '--env-file', 'infra/.env.local', '-f', 'infra/compose.local.yml', 'ps', '--format', 'json']],
];
const records = [];
for (const [label, executable, args] of commands) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(executable, args, { encoding: 'utf8', timeout: 300000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, npm_config_devdir: path.resolve('.cache/node-gyp') } });
  const log = `${evidence}/final-${label}.txt`;
  fs.writeFileSync(log, (result.stdout || '') + (result.stderr || ''));
  records.push({ command: [executable, ...args].join(' '), label, cwd: process.cwd(), startedAt, completedAt: new Date().toISOString(), exitCode: result.status, signal: result.signal, evidencePath: log });
  console.log(`${label}: exit ${result.status}`);
  fs.writeFileSync(`${evidence}/verification.json`, JSON.stringify(records, null, 2));
  if (result.status !== 0) { process.exitCode = 1; break; }
}
const files = ['package.json','package-lock.json','.npmrc','eslint.config.js','tsconfig.json','vitest.config.ts','playwright.config.ts','apps/web/vite.config.ts','infra/compose.local.yml', ...['apps/web','apps/api','apps/worker','packages/contracts','packages/database'].flatMap(p => [`${p}/package.json`, `${p}/tsconfig.json`]), ...fs.readdirSync(evidence).filter(name => name.endsWith('.mjs')).map(name => `${evidence}/${name}`)];
const hashes = Object.fromEntries(files.map(file => [file, createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
fs.writeFileSync(`${evidence}/output-hashes.json`, JSON.stringify({ specSha256: JSON.parse(fs.readFileSync('quality/spec-baseline.json','utf8').replace(/^\uFEFF/, '')).hashes.specSha256, files: hashes }, null, 2));
