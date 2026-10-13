import fs from 'node:fs';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

let observationFailures = 0;
function recordObservationFailure() {
  observationFailures += 1;
  try {
    process.stderr.write(
      JSON.stringify({ t30ObservationWriteFailure: true, count: observationFailures }) + '\n'
    );
  } catch {
    /* Observation failure must never replace a route or database outcome. */
  }
}

const SAFE_OWNERS = [
  'calls.service.js',
  'call-lifecycle.service.js',
  'play-sessions.service.js',
  'recruitments.service.js',
  'teams.service.js',
  'rooms.service.js',
  'profiles.service.js',
  'auth.service.js',
];

const trackedPools = [];
let metricsTimer = null;
let eventLoopHistogram = null;
let lastCpuUsage = null;
let lastMonotonicMs = 0;
let metricsSampleCount = 0;
let metricsWriteFailures = 0;
let metricsStopped = false;
let metricsEvidenceDir = '';

export function instrumentOwnedApiPools(pg, evidence) {
  const OriginalPool = pg.Pool;
  let sequence = 0;
  pg.Pool = class extends OriginalPool {
    constructor(...args) {
      super(...args);
      const poolIndex = ++sequence,
        stack = String(new Error().stack ?? '').replaceAll('\\', '/'),
        owner = SAFE_OWNERS.find((name) => stack.includes('/' + name + ':')) ?? 'other';
      trackedPools.push({ pool: this, poolIndex, owner });
      try {
        fs.appendFileSync(evidence + '/api-pool-owners.jsonl', JSON.stringify({ poolIndex, owner }) + '\n');
      } catch {
        recordObservationFailure();
      }
      this.on('connect', (client) => {
        const original = client.query.bind(client);
        let started = 0,
          roomHeld = 0,
          groupHeld = 0;
        client.query = function (...queryArgs) {
          const sql = typeof queryArgs[0] === 'string' ? queryArgs[0] : queryArgs[0]?.text ?? '',
            kind =
              /FOR (?:UPDATE|SHARE)/.test(sql) && sql.includes('rooms')
                ? 'lock-room'
                : /FOR (?:UPDATE|SHARE)/.test(sql) && sql.includes('call_groups')
                ? 'lock-group'
                : sql === 'BEGIN'
                ? 'begin'
                : sql === 'COMMIT'
                ? 'commit'
                : sql === 'ROLLBACK'
                ? 'rollback'
                : 'other',
            start = Date.now();
          if (kind === 'begin') {
            started = start;
            roomHeld = 0;
            groupHeld = 0;
          }
          const result = original(...queryArgs);
          if (!result || typeof result.then !== 'function') return result;
          return result.then(
            (value) => {
              const now = Date.now();
              if (kind === 'lock-room') roomHeld = now;
              if (kind === 'lock-group') groupHeld = now;
              if (kind !== 'other') {
                try {
                  fs.appendFileSync(
                    evidence + '/api-lock-diagnostics.jsonl',
                    JSON.stringify({
                      at: new Date(now).toISOString(),
                      backendPid: typeof client.processID === 'number' ? client.processID : Number(client.processID) || 0,
                      t30ApiDiagnostic4: kind,
                      poolIndex,
                      lockMode: sql.includes('FOR SHARE') ? 'share' : sql.includes('FOR UPDATE') ? 'update' : 'none',
                      durationMs: now - start,
                      transactionMs: started ? now - started : 0,
                      roomHeldMs: roomHeld ? now - roomHeld : 0,
                      groupHeldMs: groupHeld ? now - groupHeld : 0,
                      ok: true,
                    }) + '\n'
                  );
                } catch {
                  recordObservationFailure();
                }
              } else {
                const durationMs = now - start;
                if (durationMs >= 100) {
                  try {
                    fs.appendFileSync(
                      evidence + '/api-other-query-spans.jsonl',
                      JSON.stringify({
                        startedAt: new Date(start).toISOString(),
                        completedAt: new Date(now).toISOString(),
                        durationMs,
                        poolIndex,
                        owner,
                        backendPid: typeof client.processID === 'number' ? client.processID : Number(client.processID) || 0,
                        ok: true,
                      }) + '\n'
                    );
                  } catch {
                    recordObservationFailure();
                  }
                }
              }
              if (kind === 'commit' || kind === 'rollback') started = roomHeld = groupHeld = 0;
              return value;
            },
            (error) => {
              try {
                fs.appendFileSync(
                  evidence + '/api-lock-diagnostics.jsonl',
                  JSON.stringify({
                    at: new Date().toISOString(),
                    backendPid: typeof client.processID === 'number' ? client.processID : Number(client.processID) || 0,
                    t30ApiDiagnostic4: kind,
                    poolIndex,
                    lockMode: sql.includes('FOR SHARE') ? 'share' : sql.includes('FOR UPDATE') ? 'update' : 'none',
                    durationMs: Date.now() - start,
                    ok: false,
                    code: /^[0-9A-Z]{5}$/.test(error?.code ?? '') ? error.code : 'other',
                  }) + '\n'
                );
              } catch {
                recordObservationFailure();
              }
              throw error;
            }
          );
        };
      });
    }
  };
}

export function instrumentOwnedHttpTiming(app, evidence) {
  let sequence = 0;
  app.use((req, res, next) => {
    try {
      if (req.method === 'GET') {
        const rawPath = typeof req.path === 'string' ? req.path : String(req.url ?? '').split('?')[0];
        let route = null;
        if (rawPath === '/api/v1/me') route = 'me';
        else if (rawPath === '/api/v1/games') route = 'games';
        else if (rawPath === '/api/v1/rooms/own' || rawPath === '/api/v1/rooms') route = 'rooms-own';
        else if (/^\/api\/v1\/rooms\/[^/]+\/members$/.test(rawPath)) route = 'rooms-members';
        else if (/^\/api\/v1\/rooms\/[^/]+\/calls$/.test(rawPath)) route = 'rooms-calls';
        else if (/^\/api\/v1\/rooms\/[^/]+\/play-sessions$/.test(rawPath)) route = 'room-play-sessions';
        else if (/^\/api\/v1\/rooms\/[^/]+$/.test(rawPath)) route = 'rooms-detail';
        else if (/^\/api\/v1\/play-sessions\/[^/]+\/requests$/.test(rawPath)) route = 'play-requests';
        else if (/^\/api\/v1\/play-sessions\/[^/]+$/.test(rawPath)) route = 'play-detail';
        else if (/^\/api\/v1\/calls\/[^/]+\/participants$/.test(rawPath)) route = 'call-participants';

        if (route !== null) {
          const requestSequence = ++sequence;
          const startedMs = Date.now();
          const startedAt = new Date(startedMs).toISOString();
          let emitted = false;

          const record = (finishVsClose) => {
            if (emitted) return;
            emitted = true;
            const completedMs = Date.now();
            const completedAt = new Date(completedMs).toISOString();
            const durationMs = completedMs - startedMs;
            const status = typeof res.statusCode === 'number' ? res.statusCode : Number(res.statusCode) || 0;
            try {
              fs.appendFileSync(
                evidence + '/api-http-timing.jsonl',
                JSON.stringify({
                  sequence: requestSequence,
                  route,
                  method: 'GET',
                  startedAt,
                  completedAt,
                  durationMs,
                  status,
                  finished: finishVsClose,
                }) + '\n'
              );
            } catch {
              recordObservationFailure();
            }
          };

          res.once('finish', () => record(true));
          res.once('close', () => record(false));
        }
      }
    } catch {
      recordObservationFailure();
    }
    next();
  });
}

export function startOwnedApiMetrics(evidence) {
  if (typeof evidence !== 'string' || !evidence) {
    throw new Error('Missing evidence directory for API metrics');
  }
  metricsEvidenceDir = evidence;
  metricsSampleCount = 0;
  metricsWriteFailures = 0;
  metricsStopped = false;

  eventLoopHistogram = monitorEventLoopDelay({ resolution: 20 });
  eventLoopHistogram.enable();
  lastCpuUsage = process.cpuUsage();
  lastMonotonicMs = performance.now();

  function sample() {
    if (metricsStopped) return;
    metricsSampleCount += 1;
    const nowMonotonic = performance.now();
    const elapsedMonotonicMs = nowMonotonic - lastMonotonicMs;
    const cpuDelta = process.cpuUsage(lastCpuUsage);
    lastCpuUsage = process.cpuUsage();
    lastMonotonicMs = nowMonotonic;

    const meanNs = eventLoopHistogram.mean;
    const maxNs = eventLoopHistogram.max;
    const p99Ns = eventLoopHistogram.percentile(99);
    eventLoopHistogram.reset();

    const poolSnapshots = trackedPools.map(({ pool, poolIndex, owner }) => {
      const maxVal = pool.options?.max;
      return {
        poolIndex,
        owner: SAFE_OWNERS.includes(owner) ? owner : 'other',
        totalCount: Number.isFinite(pool.totalCount) && pool.totalCount >= 0 ? pool.totalCount : 0,
        idleCount: Number.isFinite(pool.idleCount) && pool.idleCount >= 0 ? pool.idleCount : 0,
        waitingCount: Number.isFinite(pool.waitingCount) && pool.waitingCount >= 0 ? pool.waitingCount : 0,
        max: Number.isFinite(maxVal) && maxVal > 0 ? maxVal : 10,
        ended: Boolean(pool.ended),
      };
    });

    const record = {
      recordedAt: new Date().toISOString(),
      sampleIndex: metricsSampleCount,
      elapsedMs: Number.isFinite(elapsedMonotonicMs) && elapsedMonotonicMs >= 0 ? Math.round(elapsedMonotonicMs * 100) / 100 : 0,
      processCpu: {
        userMs: Number.isFinite(cpuDelta.user) ? Math.round((cpuDelta.user / 1000) * 100) / 100 : 0,
        systemMs: Number.isFinite(cpuDelta.system) ? Math.round((cpuDelta.system / 1000) * 100) / 100 : 0,
      },
      eventLoopDelay: {
        meanMs: Number.isFinite(meanNs) ? Math.round((meanNs / 1e6) * 100) / 100 : 0,
        maxMs: Number.isFinite(maxNs) ? Math.round((maxNs / 1e6) * 100) / 100 : 0,
        p99Ms: Number.isFinite(p99Ns) ? Math.round((p99Ns / 1e6) * 100) / 100 : 0,
      },
      pools: poolSnapshots,
    };

    try {
      fs.appendFileSync(metricsEvidenceDir + '/api-runtime-metrics.jsonl', JSON.stringify(record) + '\n');
    } catch {
      metricsWriteFailures += 1;
      recordObservationFailure();
    }
  }

  metricsTimer = setInterval(sample, 1000);
  metricsTimer.unref();

  return stopOwnedApiMetrics;
}

export async function stopOwnedApiMetrics() {
  if (metricsStopped) {
    const health = {
      recordedAt: new Date().toISOString(),
      sampleCount: metricsSampleCount,
      writeFailures: metricsWriteFailures,
      stopped: true,
      observationComplete: metricsWriteFailures === 0 && observationFailures === 0,
    };
    if (!health.observationComplete) {
      throw new Error('API metrics observation incomplete or failed');
    }
    return health;
  }
  metricsStopped = true;
  if (metricsTimer) {
    clearInterval(metricsTimer);
    metricsTimer = null;
  }
  if (eventLoopHistogram) {
    try {
      eventLoopHistogram.disable();
    } catch {
      metricsWriteFailures += 1;
      recordObservationFailure();
    }
  }

  const health = {
    recordedAt: new Date().toISOString(),
    sampleCount: metricsSampleCount,
    writeFailures: metricsWriteFailures,
    stopped: true,
    observationComplete: metricsWriteFailures === 0 && observationFailures === 0,
  };

  try {
    fs.writeFileSync(
      metricsEvidenceDir + '/api-metrics-health.json',
      JSON.stringify(health, null, 2) + '\n'
    );
  } catch {
    metricsWriteFailures += 1;
    recordObservationFailure();
    health.writeFailures = metricsWriteFailures;
    health.observationComplete = false;
  }

  if (!health.observationComplete) {
    throw new Error(
      `API metrics observation incomplete or failed (writeFailures=${metricsWriteFailures}, totalFailures=${observationFailures})`
    );
  }
  return health;
}

export function getOwnedObservationFailures() {
  return observationFailures;
}
