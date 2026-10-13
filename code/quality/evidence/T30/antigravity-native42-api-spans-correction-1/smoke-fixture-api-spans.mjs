import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { parseEnv } from 'node:util';
import { fork } from 'node:child_process';
import WebSocket from 'ws';

/**
 * FG T30 — Smoke Verification Script for Instrumented API Lock Spans Fixture Server
 * 
 * Directly modeled on proven probe-native38-metrics-fixture1-normal.mjs.
 * Verifies:
 * 1. Built SPA HTML & strict Content-Security-Policy
 * 2. Exact built asset hashes matching build review
 * 3. Real authenticated owned API proxy (/api/v1/rooms/:id)
 * 4. Actual Engine.IO / Socket.IO websocket handshake
 * 5. Retained inspector client state across driver idle period
 * 6. Inspect protocol transition from 0 callers -> 1 caller after authenticated API admission
 * 7. Clean settlement of all 5 owned runtime resources and inspector lifecycle
 * 8. Complete observer health settlement for both api-lock-spans and pg-wait helpers
 * 9. Safe HTTP timing telemetry containing route, duration, and status without URL/user leakage
 */

const d = 'quality/evidence/T30';
const proposalDir = `${d}/antigravity-native42-api-spans-correction-1`;
const fixturePath =
  process.env.FG_FIXTURE_PATH ||
  (fs.existsSync(`${d}/fixture-server-native42-api-spans.mjs`)
    ? `${d}/fixture-server-native42-api-spans.mjs`
    : `${proposalDir}/fixture-server-native42-api-spans.mjs`);

const folder = process.env.FG_SMOKE_FOLDER || `${proposalDir}/smoke-fixture-run`;
const runtime = path.resolve('.runtime/t30');
const temp = path.join(runtime, 'temporary-built-smoke-' + randomUUID());

if (fs.existsSync(folder)) {
  fs.rmSync(folder, { recursive: true, force: true });
}
fs.mkdirSync(folder, { recursive: true });
fs.mkdirSync(runtime, { recursive: true });

const before = new Set(fs.readdirSync(runtime));
fs.mkdirSync(temp, { recursive: true });

const h = (p) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const env = parseEnv(fs.readFileSync('.env.local', 'utf8'));

const privateValues = Object.entries(env)
  .filter(([k, v]) => /SECRET|PASSWORD|TOKEN|KEY|DATABASE_URL/.test(k) && typeof v === 'string' && v.length > 7)
  .map(([, v]) => v);

try {
  const parsedDb = new URL(env.DATABASE_URL);
  if (parsedDb.password && parsedDb.password.length > 3) {
    privateValues.push(parsedDb.password);
  }
} catch {}

const sanitize = (s) => {
  if (typeof s !== 'string') return String(s ?? '');
  let sanitized = s;
  for (const v of privateValues) {
    if (v) sanitized = sanitized.split(v).join('[REDACTED]');
  }
  return sanitized
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT]')
    .replace(/(?:postgres(?:ql)?|redis):\/\/[^@\s]+@/g, '[REDACTED_CONNECTION]@')
    .replace(/(?:wss?|https?):\/\/[^\s]+/g, '[URL REDACTED]');
};

const child = fork(fixturePath, [], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    TEMP: temp,
    TMP: temp,
    FG_T30_EVIDENCE_DIR: folder,
  },
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
});

for (const stream of [child.stdout, child.stderr]) {
  if (!stream) continue;
  let pending = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    pending += chunk;
    const end = pending.lastIndexOf('\n');
    if (end >= 0) {
      process.stdout.write(sanitize(pending.slice(0, end + 1)));
      pending = pending.slice(end + 1);
    }
  });
  stream.on('end', () => {
    if (pending) process.stdout.write(sanitize(pending));
  });
}

const exitPromise = new Promise((resolve) =>
  child.once('exit', (code, signal) => resolve({ code, signal }))
);

const phases = [];
const checks = [];
const errors = [];
let ready = null;
let closed = null;
let ws = null;
let requestId = 100;
const pending = new Map();

const bounded = (p, ms, label) => {
  let timer;
  return Promise.race([
    p,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timeout (${ms}ms)`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
};

const ask = async (kind) => {
  const id = ++requestId;
  const reply = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  child.send({ id, kind });
  try {
    return await bounded(reply, 15000, 'owned inspection');
  } finally {
    pending.delete(id);
  }
};

let readyResolve, readyReject;
const readyPromise = new Promise((resolve, reject) => {
  readyResolve = resolve;
  readyReject = reject;
});
readyPromise.catch(() => {});

child.on('message', (message) => {
  const request = pending.get(message.id);
  if (request) {
    if (message.failed) request.reject(new Error('Owned inspection failed'));
    else request.resolve(message);
  }
  if (message.kind === 'phase') phases.push({ at: new Date().toISOString(), phase: message.name });
  if (message.kind === 'ready') readyResolve(message);
  if (message.kind === 'failed') readyReject(new Error(`Owned fixture failed at ${message.phase}`));
});
child.on('error', readyReject);

try {
  ready = await bounded(readyPromise, 90000, 'fixture ready');
  for (const actor of Object.values(ready.actors)) {
    if (actor.cookie) privateValues.push(actor.cookie);
  }

  // 1. Built SPA HTML and CSP validation
  const response = await fetch(ready.origin + '/rooms/' + ready.roomId, {
    headers: { Accept: 'text/html' },
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.equal(createHash('sha256').update(html).digest('hex'), h('apps/web/dist/index.html'));
  assert(!html.includes('/@vite/client') && !html.includes('/src/main'));

  const csp = response.headers.get('content-security-policy');
  assert(csp?.includes("default-src 'none'"));
  const scriptSrc = csp.split(';').find((s) => s.trim().startsWith('script-src'));
  assert(scriptSrc?.includes("'self'"));
  assert(!scriptSrc.includes("'unsafe-inline'") && !scriptSrc.includes("'unsafe-eval'"));
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');

  checks.push({
    kind: 'built SPA HTML and CSP',
    status: 200,
    htmlSha256: h('apps/web/dist/index.html'),
    noDevRuntime: true,
    cspSha256: createHash('sha256').update(csp).digest('hex'),
  });

  // 2. Built asset actual HTTP fetch matching index review
  const review = JSON.parse(fs.readFileSync(`${d}/t30-build-1-index-review.json`, 'utf8'));
  for (const asset of review.activeAssets) {
    const url = ready.origin + '/' + asset.path.slice('apps/web/dist/'.length);
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    assert.equal(r.status, 200);
    const digest = createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex');
    assert.equal(digest, asset.sha256);
    checks.push({ kind: 'built asset actual HTTP', path: asset.path, status: 200, sha256: digest });
  }

  // 3. Real authenticated owned API proxy
  const api = await fetch(ready.origin + '/api/v1/rooms/' + ready.roomId, {
    headers: {
      Cookie: 'better-auth.session_token=' + ready.actors.sender.cookie,
      Origin: ready.origin,
    },
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(api.status, 200);
  const room = await api.json();
  assert.equal(room.id, ready.roomId);
  assert.equal(room.ownerId, ready.actors.sender.id);
  checks.push({ kind: 'real authenticated owned API proxy', status: api.status });

  // 4. Actual WebSocket handshake
  await bounded(
    new Promise((resolve, reject) => {
      ws = new WebSocket(ready.origin.replace('http:', 'ws:') + '/socket.io/?EIO=4&transport=websocket', {
        headers: {
          Origin: ready.origin,
          Cookie: 'better-auth.session_token=' + ready.actors.sender.cookie,
        },
      });
      ws.once('error', reject);
      ws.once('message', (data) => {
        try {
          assert(String(data).startsWith('0{'));
          checks.push({
            kind: 'actual Socket.IO Engine.IO websocket proxy handshake',
            opened: true,
            namespaceAclNotClaimed: true,
          });
          ws.close();
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    }),
    10000,
    'actual websocket handshake'
  );

  assert(Number.isInteger(ready.inspectorPid) && ready.inspectorPid > 0);

  // 5. Retained inspector after idle period
  const idleStartedAt = new Date().toISOString();
  const idleStart = performance.now();
  await new Promise((resolve) => setTimeout(resolve, 5000));

  const initial = await ask('inspect');
  assert.equal(initial.inspectorPid, ready.inspectorPid);
  assert.equal(initial.callers, 0);
  assert.equal(initial.publisherSlots, 0);
  assert.equal(initial.rooms, 1);
  assert.equal(initial.play_state, 'ACTIVE');

  checks.push({
    kind: 'real retained inspector after idle period',
    idleStartedAt,
    idleEndedAt: new Date().toISOString(),
    idleMs: performance.now() - idleStart,
    backendPid: initial.inspectorPid,
    callers: initial.callers,
    rooms: initial.rooms,
    publisherSlots: initial.publisherSlots,
  });

  // 6. Real API admission and inspect transition from 0 callers to 1 caller
  const post = async (route) => {
    const res = await fetch(ready.origin + '/api/v1/' + route, {
      method: 'POST',
      headers: {
        Cookie: 'better-auth.session_token=' + ready.actors.sender.cookie,
        Origin: ready.origin,
        'Content-Type': 'application/json',
      },
      body: '{}',
      signal: AbortSignal.timeout(10000),
    });
    assert([200, 201].includes(res.status));
    return res.json();
  };

  const call = await post('rooms/' + ready.roomId + '/calls');
  const joined = await post('calls/' + call.id + '/join');
  assert(typeof joined.token === 'string');
  privateValues.push(joined.token);

  const current = await ask('inspect');
  assert.equal(current.inspectorPid, ready.inspectorPid);
  assert.equal(current.callers, 1);
  assert.equal(current.people.length, 1);
  assert.equal(current.people[0].user_id, ready.actors.sender.id);
  assert.equal(current.open_calls, 1);
  assert.equal(current.publisherSlots, 0);

  checks.push({
    kind: 'same real inspector reads newly committed real API admission (0 to 1 transition)',
    backendPid: current.inspectorPid,
    beforeCallers: initial.callers,
    afterCallers: current.callers,
    currentUserMatched: true,
    openCalls: current.open_calls,
    publisherSlots: current.publisherSlots,
    nativeTracksRead: true,
  });
} catch (error) {
  errors.push({
    name: sanitize(error?.name ?? 'Error'),
    phase: phases.at(-1)?.phase ?? 'setup',
    message: sanitize(error?.message ?? 'unknown'),
  });
} finally {
  ws?.terminate();
  if (child.connected) {
    child.send({ kind: 'stop', id: 1 });
  }
  try {
    closed = await bounded(exitPromise, 60000, 'owned cleanup');
  } catch (error) {
    errors.push({ name: sanitize(error?.name ?? 'Error'), message: sanitize(error?.message ?? 'unknown') });
    child.kill();
    closed = await bounded(exitPromise, 10000, 'fixture termination').catch(() => ({
      code: null,
      signal: 'unknown',
    }));
  }
}

// Verification of cleanup and runtime settlement
const cleanupPath = folder + '/cleanup.json';
const cleanup = fs.existsSync(cleanupPath) ? JSON.parse(fs.readFileSync(cleanupPath, 'utf8')) : null;
if (!cleanup || !Object.values(cleanup).every((v) => v === true)) {
  errors.push({ phase: 'cleanup', message: 'Owned cleanup not confirmed' });
}

const removed = [];
const retained = [];
for (const name of fs.readdirSync(runtime)) {
  if (before.has(name)) continue;
  const p = path.resolve(runtime, name);
  assert.equal(path.dirname(p), runtime);
  assert(p.startsWith(runtime + path.sep));
  if (name === path.basename(temp)) {
    try {
      fs.rmSync(p, { recursive: true, force: true });
      removed.push(name);
    } catch {
      retained.push(name);
    }
    continue;
  }
  if (/^gateway-[a-f0-9-]{36}$/i.test(name)) {
    const proof = path.join(p, 'cleanup.json');
    if (fs.existsSync(proof)) {
      const j = JSON.parse(fs.readFileSync(proof, 'utf8'));
      if (j.containersRemoved && j.networkRemoved) {
        fs.writeFileSync(folder + '/gateway-cleanup.json', JSON.stringify(j, null, 2) + '\n', { flag: 'w' });
        fs.rmSync(p, { recursive: true, force: true });
        removed.push(name);
        continue;
      }
    }
    retained.push(name);
  }
}

// Verify inspector lifecycle
const inspectorFile = folder + '/inspector-lifecycle.json';
const inspector = fs.existsSync(inspectorFile) ? JSON.parse(fs.readFileSync(inspectorFile, 'utf8')) : null;
try {
  assert(inspector);
  assert.equal(inspector.backendPid, ready?.inspectorPid);
  assert.equal(inspector.reserved, true);
  assert.equal(inspector.released, true);
  assert.equal(inspector.actualSocketEnded, true);
  assert.equal(inspector.poolEnded, true);
  assert.equal(inspector.failureCount, 0);
  assert.equal(inspector.writeFailureCount, 0);
  assert.equal(inspector.healthy, true);
  checks.push({ kind: 'actual owned inspector release/socket-end/pool-end lifecycle', inspector });
} catch {
  errors.push({ phase: 'inspector lifecycle', message: 'Actual clean own-client settlement not proven' });
}

// Verify observation health records
try {
  const pgHealth = JSON.parse(fs.readFileSync(folder + '/pg-wait-observation-health.json', 'utf8'));
  const spansHealth = JSON.parse(fs.readFileSync(folder + '/api-lock-spans-health.json', 'utf8'));

  assert.equal(pgHealth.failureCount, 0);
  assert.equal(pgHealth.poolEnded, true);
  assert.equal(pgHealth.inFlightSettled, true);
  assert.equal(pgHealth.observationComplete, true);

  assert.equal(spansHealth.failureCount, 0);
  assert.equal(spansHealth.droppedCount, 0);
  assert.equal(spansHealth.observationComplete, true);
  assert.equal(spansHealth.timerStopped, true);
  assert.equal(spansHealth.histogramDisabled, true);
  assert(spansHealth.sampleCount > 0);

  const spansLines = fs
    .readFileSync(folder + '/api-lock-spans.jsonl', 'utf8')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map(JSON.parse);

  const httpSpans = spansLines.filter((v) => v.type === 'http');
  assert(httpSpans.length > 0, 'Must record at least one HTTP span');
  assert(
    httpSpans.some((v) => v.route === 'http-rooms-detail' && v.status === 200),
    'Must record http-rooms-detail span'
  );

  for (const span of httpSpans) {
    assert(Number.isFinite(span.durationMs) && span.durationMs >= 0);
    assert(!('path' in span) && !('url' in span) && !('userId' in span), 'Raw URL/user leaked in HTTP span');
  }

  checks.push({
    kind: 'actual safe real HTTP timing and API spans observation lifecycle',
    totalSpans: spansLines.length,
    httpSpans: httpSpans.length,
    pgHealth,
    spansHealth,
  });
} catch {
  errors.push({ phase: 'observation lifecycle/timing', message: 'Observation health or spans verification failed' });
}

const result = {
  recordedAt: new Date().toISOString(),
  reviewer: 'Codex',
  fixture: { path: fixturePath, sha256: h(fixturePath) },
  phases,
  checks,
  closed,
  cleanup,
  removed,
  retained,
  errors,
  scope: 'Real built frontend HTTP/CSP/assets and owned API/WS/cleanup startup only, no UI or capture acceptance',
  nativeAcceptance: false,
};

fs.writeFileSync(proposalDir + '/api-spans-fixture-smoke-review.json', JSON.stringify(result, null, 2) + '\n', {
  flag: 'w',
});
console.log(JSON.stringify({ checks, closed, cleanup, retained, errors, nativeAcceptance: false }, null, 2));

if (errors.length || retained.length || closed?.code !== 0) {
  process.exitCode = 1;
}
