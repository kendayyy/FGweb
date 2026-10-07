import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const requestPath = process.argv[2];
const request = JSON.parse(fs.readFileSync(requestPath, 'utf8'));
const root = process.cwd();
assert.equal(path.resolve(root).toLowerCase(), path.resolve('E:/FGweb/code').toLowerCase());
const { task, label, command, args } = request;
assert(/^[A-Z0-9-]+$/.test(task) && /^[a-z0-9-]+$/.test(label));
assert(typeof command === 'string' && Array.isArray(args) && args.every(a => typeof a === 'string'));
const evidencePath = `quality/evidence/${task}/codex-${label}.txt`;
const resultPath = `quality/evidence/${task}/codex-${label}.json`;
assert(!fs.existsSync(evidencePath) && !fs.existsSync(resultPath), 'Never overwrite run evidence');
const startedAt = new Date().toISOString();
console.log(`FG ${task} | ${root}\n${command} ${args.join(' ')}\nStarted: ${startedAt}\n`);
const stream = fs.createWriteStream(evidencePath, { flags: 'wx' });
const child = spawn(command, args, { cwd: root, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.on('data', chunk => { process.stdout.write(chunk); stream.write(chunk); });
child.stderr.on('data', chunk => { process.stderr.write(chunk); stream.write(chunk); });
const result = await new Promise(resolve => {
  child.once('error', error => {
    const message = `${error.code ?? 'LAUNCH_ERROR'}: could not start test executable\n`;
    process.stderr.write(message); stream.write(message);
    resolve({ exitCode: 1, signal: null });
  });
  child.once('close', (code, signal) => resolve({ exitCode: code ?? 1, signal }));
});
await new Promise(resolve => stream.end(resolve));
const record = {
  command: [command, ...args].join(' '), argv: [command, ...args], cwd: root,
  startedAt, completedAt: new Date().toISOString(), ...result, evidencePath,
  evidenceSha256: createHash('sha256').update(fs.readFileSync(evidencePath)).digest('hex'),
  observation: { mode: 'visible-powershell', keepOpen: true, realtimeStdoutStderr: true, requestPath },
};
fs.writeFileSync(resultPath, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
console.log(`\nFG ${task} completed | exit code: ${result.exitCode}\nEvidence: ${evidencePath}\nWindow remains open for review.`);
process.exitCode = result.exitCode;
