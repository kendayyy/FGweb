import fs from 'node:fs';
let observationFailures = 0;
function recordObservationFailure() {
  observationFailures += 1;
  try { process.stderr.write(JSON.stringify({t30ObservationWriteFailure: true, count: observationFailures}) + '\n'); }
  catch { /* Observation failure must never replace a route or database outcome. */ }
}

export function instrumentOwnedApiPools(pg, evidence) {
  const OriginalPool = pg.Pool;
  let sequence = 0;
  pg.Pool = class extends OriginalPool {
    constructor(...args) {
      super(...args);
      const poolIndex = ++sequence,
        stack = String(new Error().stack ?? '').replaceAll('\\', '/'),
        owner =
          ['calls.service.js', 'call-lifecycle.service.js', 'play-sessions.service.js', 'recruitments.service.js', 'teams.service.js', 'rooms.service.js', 'profiles.service.js'].find((name) =>
            stack.includes('/' + name + ':')
          ) ?? 'other';
      try {
        fs.appendFileSync(evidence + '/api-pool-owners.jsonl', JSON.stringify({ poolIndex, owner }) + '\n');
      } catch { recordObservationFailure(); }
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
                } catch { recordObservationFailure(); }
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
              } catch { recordObservationFailure(); }
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
            } catch { recordObservationFailure(); }
          };

          res.once('finish', () => record(true));
          res.once('close', () => record(false));
        }
      }
    } catch { recordObservationFailure(); }
    next();
  });
}

export function getOwnedObservationFailures(){return observationFailures;}
