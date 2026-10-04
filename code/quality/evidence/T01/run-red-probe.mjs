import fs from 'fs';
import path from 'path';
import net from 'net';
import { execSync } from 'child_process';

const timestamp = new Date().toISOString();
const cwd = process.cwd();
const logLines = [];

logLines.push('=== T01 PREPARATION RED PROBE ===');
logLines.push(`Timestamp: ${timestamp}`);
logLines.push(`Cwd: ${cwd}`);

// 1. Check package.json
logLines.push('\n--- Check 1: Root & Workspace Package Manifests ---');
const manifests = [
  'package.json',
  'apps/web/package.json',
  'apps/api/package.json',
  'apps/worker/package.json',
  'packages/contracts/package.json',
  'packages/database/package.json'
];
for (const m of manifests) {
  const p = path.join(cwd, m);
  if (fs.existsSync(p)) {
    logLines.push(`EXISTS: ${m}`);
  } else {
    logLines.push(`RED: Missing manifest ${m}`);
  }
}

// 2. Check docker compose status
logLines.push('\n--- Check 2: Docker Containers ---');
try {
  const ps = execSync('docker compose -f infra/compose.local.yml ps', { encoding: 'utf8', stdio: 'pipe' });
  logLines.push(ps.trim() || 'No containers running');
} catch (err) {
  logLines.push(`RED: Docker compose check failed: ${err.message}`);
}

// Helper TCP port check
async function checkPort(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, '127.0.0.1');
  });
}

// 3. Port checks
logLines.push('\n--- Check 3: Port Reachability ---');
const pgPort = await checkPort(5432);
logLines.push(pgPort ? 'PostgreSQL port 5432 is OPEN' : 'RED: PostgreSQL port 5432 is CLOSED');

const redisPort = await checkPort(6379);
logLines.push(redisPort ? 'Redis port 6379 is OPEN' : 'RED: Redis port 6379 is CLOSED');

const livekitPort = await checkPort(7880);
logLines.push(livekitPort ? 'LiveKit port 7880 is OPEN' : 'RED: LiveKit port 7880 is CLOSED');

// 4. Playwright cache
logLines.push('\n--- Check 4: Playwright Cache ---');
const pwCache = path.join(cwd, '.cache', 'ms-playwright');
if (fs.existsSync(pwCache)) {
  logLines.push(`EXISTS: .cache/ms-playwright`);
} else {
  logLines.push(`RED: Missing Playwright browser cache at .cache/ms-playwright`);
}

const output = logLines.join('\n');
console.log(output);

fs.writeFileSync(path.join(cwd, 'quality/evidence/T01/red-preparation.txt'), output, 'utf8');
