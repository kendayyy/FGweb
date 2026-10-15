import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const [label, command, ...args] = process.argv.slice(2);
assert(label && /^[a-z0-9-]+$/.test(label) && command, 'Usage: node record-check.mjs label command args');
const dir = 'quality/evidence/T38';
fs.mkdirSync(dir, { recursive: true });
const evidencePath = `${dir}/codex-${label}.txt`;
assert(!fs.existsSync(evidencePath), `Preserve previous execution; use a new label. ${evidencePath} already exists.`);

const startedAt = new Date().toISOString();
const stream = fs.createWriteStream(evidencePath);
const child = spawn(command, args, { cwd: process.cwd(), shell: false, windowsHide: true, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
if (label.startsWith('headed-')) {
  // Playwright assertion diagnostics can include visible form values.
  for (const output of [child.stdout, child.stderr]) {
    let pending = '';
    output.setEncoding('utf8');
    output.on('data', chunk => {
      pending += chunk; const end = pending.lastIndexOf('\n');
      if (end >= 0) { stream.write(pending.slice(0, end + 1).replace(/(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/g, '[REDACTED_43_CHAR_TOKEN]')); pending = pending.slice(end + 1); }
    });
    output.on('end', () => { if (pending) stream.write(pending.replace(/(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/g, '[REDACTED_43_CHAR_TOKEN]')); });
  }
} else {
  child.stdout.pipe(stream, { end: false });
  child.stderr.pipe(stream, { end: false });
}

const result = await new Promise((resolve) => {
  child.once('error', (error) => {
    stream.write(String(error));
    resolve({ exitCode: 1, signal: null });
  });
  child.once('close', (exitCode, signal) => resolve({ exitCode: exitCode ?? 1, signal }));
});

await new Promise((resolve) => stream.end(resolve));

const record = {
  command: [command, ...args].join(' '),
  cwd: process.cwd(),
  startedAt,
  completedAt: new Date().toISOString(),
  ...result,
  evidencePath,
  evidenceSha256: createHash('sha256').update(fs.readFileSync(evidencePath)).digest('hex'),
};

fs.writeFileSync(`${dir}/codex-${label}.json`, JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify(record));
process.exitCode = result.exitCode;



