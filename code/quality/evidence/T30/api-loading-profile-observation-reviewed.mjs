import fs from 'node:fs';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import os from 'node:os';

let observationFailures = 0;
function recordObservationFailure() {
  observationFailures += 1;
  try {
    process.stderr.write(JSON.stringify({ t30ObservationWriteFailure: true, count: observationFailures }) + '\n');
  } catch {
    /* Observation failure must never replace a route or database outcome. */
  }
}

export function instrumentOwnedApiPools(pg, evidence) {
  const OriginalPool = pg.Pool;
  let sequence = 0;
  pg.Pool = class extends OriginalPool {
    constructor(...args) {
      super(...args);
      const self = this;
      const poolIndex = ++sequence;
      const stack = String(new Error().stack ?? '').replaceAll('\\', '/');
      const owner =
        ['calls.service.js', 'call-lifecycle.service.js', 'play-sessions.service.js', 'recruitments.service.js', 'teams.service.js', 'rooms.service.js', 'profiles.service.js'].find((name) =>
          stack.includes('/' + name + ':')
        ) ?? 'other';

      try {
        fs.appendFileSync(evidence + '/api-pool-owners.jsonl', JSON.stringify({ poolIndex, owner }) + '\n');
      } catch {
        recordObservationFailure();
      }

      // A. Wrap this.connect after super construction
      const originalConnect = this.connect.bind(this);
      this.connect = function (...connectArgs) {
        const start = Date.now();
        const startedAt = new Date(start).toISOString();

        if (typeof connectArgs[connectArgs.length - 1] === 'function') {
          const originalCb = connectArgs[connectArgs.length - 1];
          connectArgs[connectArgs.length - 1] = function (err, client, release) {
            const completedMs = Date.now();
            const completedAt = new Date(completedMs).toISOString();
            const durationMs = completedMs - start;
            if (err) {
              try {
                fs.appendFileSync(
                  evidence + '/api-pool-connect.jsonl',
                  JSON.stringify({
                    owner,
                    poolIndex,
                    backendPid: 0,
                    startedAt,
                    completedAt,
                    durationMs,
                    ok: false,
                    code: /^[0-9A-Z]{5}$/.test(err?.code ?? '') ? err.code : 'other',
                    waitingCount: typeof self.waitingCount === 'number' ? self.waitingCount : 0,
                    totalCount: typeof self.totalCount === 'number' ? self.totalCount : 0,
                    idleCount: typeof self.idleCount === 'number' ? self.idleCount : 0,
                  }) + '\n'
                );
              } catch {
                recordObservationFailure();
              }
            } else {
              try {
                fs.appendFileSync(
                  evidence + '/api-pool-connect.jsonl',
                  JSON.stringify({
                    owner,
                    poolIndex,
                    backendPid: typeof client?.processID === 'number' ? client.processID : Number(client?.processID) || 0,
                    startedAt,
                    completedAt,
                    durationMs,
                    ok: true,
                    waitingCount: typeof self.waitingCount === 'number' ? self.waitingCount : 0,
                    totalCount: typeof self.totalCount === 'number' ? self.totalCount : 0,
                    idleCount: typeof self.idleCount === 'number' ? self.idleCount : 0,
                  }) + '\n'
                );
              } catch {
                recordObservationFailure();
              }
            }
            return originalCb.apply(this, arguments);
          };
          return originalConnect(...connectArgs);
        }

        const promise = originalConnect(...connectArgs);
        if (!promise || typeof promise.then !== 'function') return promise;
        return promise.then(
          (client) => {
            const completedMs = Date.now();
            const completedAt = new Date(completedMs).toISOString();
            const durationMs = completedMs - start;
            try {
              fs.appendFileSync(
                evidence + '/api-pool-connect.jsonl',
                JSON.stringify({
                  owner,
                  poolIndex,
                  backendPid: typeof client?.processID === 'number' ? client.processID : Number(client?.processID) || 0,
                  startedAt,
                  completedAt,
                  durationMs,
                  ok: true,
                  waitingCount: typeof self.waitingCount === 'number' ? self.waitingCount : 0,
                  totalCount: typeof self.totalCount === 'number' ? self.totalCount : 0,
                  idleCount: typeof self.idleCount === 'number' ? self.idleCount : 0,
                }) + '\n'
              );
            } catch {
              recordObservationFailure();
            }
            return client;
          },
          (err) => {
            const completedMs = Date.now();
            const completedAt = new Date(completedMs).toISOString();
            const durationMs = completedMs - start;
            try {
              fs.appendFileSync(
                evidence + '/api-pool-connect.jsonl',
                JSON.stringify({
                  owner,
                  poolIndex,
                  backendPid: 0,
                  startedAt,
                  completedAt,
                  durationMs,
                  ok: false,
                  code: /^[0-9A-Z]{5}$/.test(err?.code ?? '') ? err.code : 'other',
                  waitingCount: typeof self.waitingCount === 'number' ? self.waitingCount : 0,
                  totalCount: typeof self.totalCount === 'number' ? self.totalCount : 0,
                  idleCount: typeof self.idleCount === 'number' ? self.idleCount : 0,
                }) + '\n'
              );
            } catch {
              recordObservationFailure();
            }
            throw err;
          }
        );
      };

      // B. Client query observation
      this.on('connect', (client) => {
        const original = client.query.bind(client);

        if (owner === 'profiles.service.js') {
          client.query = function (...queryArgs) {
            const start = Date.now();
            const startedAt = new Date(start).toISOString();
            const pid = typeof client.processID === 'number' ? client.processID : Number(client.processID) || 0;

            const logProfileQuery = (completedMs, ok, err) => {
              const completedAt = new Date(completedMs).toISOString();
              const durationMs = completedMs - start;
              const record = {
                at: completedAt,
                owner: 'profiles.service.js',
                backendPid: pid,
                t30ApiDiagnostic4: 'profile-query',
                poolIndex,
                startedAt,
                completedAt,
                durationMs,
                ok,
              };
              if (!ok) {
                record.code = /^[0-9A-Z]{5}$/.test(err?.code ?? '') ? err.code : 'other';
              }
              try {
                fs.appendFileSync(evidence + '/api-lock-diagnostics.jsonl', JSON.stringify(record) + '\n');
              } catch {
                recordObservationFailure();
              }
            };

            if (typeof queryArgs[queryArgs.length - 1] === 'function') {
              const originalCb = queryArgs[queryArgs.length - 1];
              queryArgs[queryArgs.length - 1] = function (err, res) {
                logProfileQuery(Date.now(), !err, err);
                return originalCb.apply(this, arguments);
              };
              return original.apply(this, queryArgs);
            }

            const result = original.apply(this, queryArgs);
            if (!result || typeof result.then !== 'function') return result;
            return result.then(
              (value) => {
                logProfileQuery(Date.now(), true);
                return value;
              },
              (error) => {
                logProfileQuery(Date.now(), false, error);
                throw error;
              }
            );
          };
        } else {
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
        }
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

export function startOwnedPerformanceTiming(evidence) {
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();

  let prevWall = process.hrtime.bigint();
  let prevCpu = process.cpuUsage();

  function getOsCpuTotals() {
    const cpus = os.cpus() || [];
    let busy = 0;
    let total = 0;
    for (const cpu of cpus) {
      const times = cpu.times || {};
      const coreBusy = (times.user || 0) + (times.nice || 0) + (times.sys || 0) + (times.irq || 0);
      const coreTotal = coreBusy + (times.idle || 0);
      busy += coreBusy;
      total += coreTotal;
    }
    return { busy, total, cores: cpus.length };
  }

  let prevOsCpu = getOsCpuTotals();

  function sample() {
    try {
    const nowWall = process.hrtime.bigint();
    const wallMs = Number(nowWall - prevWall) / 1e6;
    prevWall = nowWall;

    const currentCpu = process.cpuUsage();
    const cpuDeltaUser = currentCpu.user - prevCpu.user;
    const cpuDeltaSystem = currentCpu.system - prevCpu.system;
    prevCpu = currentCpu;

    const currentOsCpu = getOsCpuTotals();
    const osCpuDeltaBusy = currentOsCpu.busy - prevOsCpu.busy;
    const osCpuDeltaTotal = currentOsCpu.total - prevOsCpu.total;
    const cores = currentOsCpu.cores;
    prevOsCpu = currentOsCpu;

    const mem = process.memoryUsage();

    const meanMs = Number((histogram.mean / 1e6).toFixed(3));
    const maxMs = Number((histogram.max / 1e6).toFixed(3));
    const p99Ms = Number((histogram.percentile(99) / 1e6).toFixed(3));

    histogram.reset();

    try {
      fs.appendFileSync(
        evidence + '/api-performance-timing.jsonl',
        JSON.stringify({
          at: new Date().toISOString(),
          wallMs: Number(wallMs.toFixed(3)),
          eventLoop: {
            meanMs,
            maxMs,
            p99Ms,
          },
          cpu: {
            userMicroseconds: cpuDeltaUser,
            systemMicroseconds: cpuDeltaSystem,
          },
          memory: {
            rss: mem.rss,
            heapTotal: mem.heapTotal,
            heapUsed: mem.heapUsed,
            freemem: os.freemem(),
            totalmem: os.totalmem(),
          },
          osCpu: {
            cores,
            busyDelta: osCpuDeltaBusy,
            totalDelta: osCpuDeltaTotal,
          },
        }) + '\n'
      );
    } catch {
      recordObservationFailure();
    }
    } catch { recordObservationFailure(); }
  }

  const timer = setInterval(sample, 1000);
  timer.unref();

  let stopped = false;
  return function stop() {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    sample();
    try {
      histogram.disable();
    } catch { recordObservationFailure(); }
  };
}
