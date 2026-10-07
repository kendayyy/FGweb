import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const [task, label, command, ...args] = process.argv.slice(2);
assert(/^[A-Z0-9-]+$/.test(task) && /^[a-z0-9-]+$/.test(label) && command);
assert.equal(path.resolve(process.cwd()).toLowerCase(), path.resolve('E:/FGweb/code').toLowerCase());
const dir = `quality/evidence/${task}`;
fs.mkdirSync(dir, { recursive: true });
const requestPath = path.resolve(`${dir}/visible-${label}-request.json`);
const resultPath = `${dir}/codex-${label}.json`;
assert(!fs.existsSync(requestPath) && !fs.existsSync(resultPath), 'Use a new run label');
fs.writeFileSync(requestPath, JSON.stringify({ task, label, command, args }, null, 2) + '\n', { flag: 'wx' });
// The command being tested is JSON data, never interpolated into shell code.
const script = path.resolve('scripts/show-test.ps1');
const ps = `$p=Start-Process -FilePath powershell.exe -WorkingDirectory 'E:/FGweb/code' -WindowStyle Normal -ArgumentList @('-NoLogo','-NoProfile','-NoExit','-ExecutionPolicy','Bypass','-File','"${script}"','-RequestPath','"${requestPath}"') -PassThru; $p.Id`;
assert(!script.includes('"') && !requestPath.includes('"'));
const pid = Number(execFileSync('powershell.exe', ['-NoProfile', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')], { encoding: 'utf8' }).trim());
assert(Number.isSafeInteger(pid) && pid > 0);
fs.writeFileSync(`${dir}/visible-${label}-launch.json`, JSON.stringify({ pid, windowStyle: 'Normal', noExit: true, launchedAt: new Date().toISOString(), requestPath }, null, 2) + '\n');
console.log(`Opened visible terminal for ${task}/${label}, PID ${pid}.`);
const limit = Date.now() + 45 * 60 * 1000;
while (!fs.existsSync(resultPath)) {
  assert(Date.now() < limit, 'No result before deadline; inspect the visible terminal, do not infer success');
  await delay(500);
  try { process.kill(pid, 0); } catch { throw new Error('Visible terminal exited without test evidence; inspect launcher failure before running tests'); }
}
const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
console.log(JSON.stringify(result));
process.exitCode = result.exitCode;
