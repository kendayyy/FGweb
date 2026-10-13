import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import {performance} from 'node:perf_hooks';

const FG_RELATIONS_WHITELIST = [
  'rooms',
  'call_groups',
  'call_members',
  'call_admissions',
  'user',
  'session',
  'profiles',
  'call_publish_slots',
  'call_restrictions',
  'room_members',
  'play_sessions',
  'game_interests',
  'admin_actions',
  'teams',
  'team_members',
  'play_requests',
];

const FG_RELATIONS_SET = new Set(FG_RELATIONS_WHITELIST);
const ALLOWED_STATES = new Set(['active', 'idle', 'idleInTransaction', 'idleInTransactionAborted', 'fastpath', 'disabled']);
const ALLOWED_WAIT_EVENT_TYPES = new Set(['Activity', 'BufferPin', 'Client', 'Extension', 'IO', 'IPC', 'Lock', 'LWLock', 'Timeout', 'none']);
const ALLOWED_WAIT_EVENTS = new Set([
  'transactionid',
  'tuple',
  'relation',
  'virtualxid',
  'extend',
  'object',
  'advisory',
  'ClientRead',
  'ClientWrite',
  'DataFileRead',
  'DataFileWrite',
  'DataFileSync',
  'WALWrite',
  'WALSync',
  'WALRead',
  'BufferMapping',
  'BufferContent',
  'ProcArray',
  'LockManager',
  'LWLock',
  'Timeout',
  'CheckpointDelay',
  'SyncRep',
  'none',
]);
const ALLOWED_LOCK_MODES = new Set([
  'AccessShareLock',
  'RowShareLock',
  'RowExclusiveLock',
  'ShareUpdateExclusiveLock',
  'ShareLock',
  'ShareRowExclusiveLock',
  'ExclusiveLock',
  'AccessExclusiveLock',
  'none',
]);
const ALLOWED_LOCK_TYPES = new Set([
  'relation',
  'extend',
  'page',
  'tuple',
  'transactionid',
  'virtualxid',
  'object',
  'userlock',
  'advisory',
  'none',
]);
const ALLOWED_QUERY_SHAPES = new Set([
  'selectRoomsUpdate',
  'selectRoomsShare',
  'selectCallGroupsUpdate',
  'selectCallGroupsShare',
  'commit',
  'begin',
  'rollback',
  'updateCallAdmissions',
  'updateOther',
  'selectOther',
  'insert',
  'delete',
]);

const PG_WAIT_SQL = `
WITH target_relations AS (
    SELECT c.oid AS relid, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = $1 AND c.relname = ANY($2::text[])
),
owned_relation_locks AS (
    SELECT l.pid, l.locktype, l.mode, l.granted, r.relname
    FROM pg_locks l
    JOIN target_relations r ON l.relation = r.relid
),
owned_pids AS (
    SELECT DISTINCT pid FROM owned_relation_locks
)
SELECT
    a.pid,
    clock_timestamp() AS server_timestamp,
    ROUND(EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint AS server_epoch_ms,
    COALESCE(pg_blocking_pids(a.pid), ARRAY[]::integer[]) AS raw_blocking_pids,
    CASE WHEN a.xact_start IS NULL THEN 0 ELSE ROUND(EXTRACT(EPOCH FROM (clock_timestamp() - a.xact_start)) * 1000)::bigint END AS xact_age_ms,
    CASE WHEN a.query_start IS NULL THEN 0 ELSE ROUND(EXTRACT(EPOCH FROM (clock_timestamp() - a.query_start)) * 1000)::bigint END AS query_age_ms,
    CASE a.state
        WHEN 'active' THEN 'active'
        WHEN 'idle' THEN 'idle'
        WHEN 'idle in transaction' THEN 'idleInTransaction'
        WHEN 'idle in transaction (aborted)' THEN 'idleInTransactionAborted'
        WHEN 'fastpath function call' THEN 'fastpath'
        WHEN 'disabled' THEN 'disabled'
        ELSE 'other'
    END AS state,
    COALESCE(a.wait_event_type, 'none') AS wait_event_type,
    COALESCE(a.wait_event, 'none') AS wait_event,
    CASE
        WHEN a.query ~* '^\\s*SELECT\\s+.*\\s+FROM\\s+.*rooms.*\\s+FOR\\s+UPDATE' THEN 'selectRoomsUpdate'
        WHEN a.query ~* '^\\s*SELECT\\s+.*\\s+FROM\\s+.*rooms.*\\s+FOR\\s+SHARE' THEN 'selectRoomsShare'
        WHEN a.query ~* '^\\s*SELECT\\s+.*\\s+FROM\\s+.*call_groups.*\\s+FOR\\s+UPDATE' THEN 'selectCallGroupsUpdate'
        WHEN a.query ~* '^\\s*SELECT\\s+.*\\s+FROM\\s+.*call_groups.*\\s+FOR\\s+SHARE' THEN 'selectCallGroupsShare'
        WHEN a.query ~* '^\\s*COMMIT(\\s*;\\s*)?$' THEN 'commit'
        WHEN a.query ~* '^\\s*BEGIN(\\s*;\\s*)?$' THEN 'begin'
        WHEN a.query ~* '^\\s*ROLLBACK(\\s*;\\s*)?$' THEN 'rollback'
        WHEN a.query ~* '^\\s*UPDATE\\s+.*call_admissions' THEN 'updateCallAdmissions'
        WHEN a.query ~* '^\\s*UPDATE\\s+' THEN 'updateOther'
        WHEN a.query ~* '^\\s*SELECT\\s+' THEN 'selectOther'
        WHEN a.query ~* '^\\s*INSERT\\s+' THEN 'insert'
        WHEN a.query ~* '^\\s*DELETE\\s+' THEN 'delete'
        ELSE 'other'
    END AS query_shape,
    COALESCE(bool_and(l.granted), true) AS all_relation_locks_granted,
    (NOT COALESCE(bool_and(l.granted), true) OR cardinality(COALESCE(pg_blocking_pids(a.pid), ARRAY[]::integer[])) > 0) AS is_waiting,
    array_agg(DISTINCT l.relname) AS relations,
    array_agg(DISTINCT l.mode) AS lock_modes,
    array_agg(DISTINCT l.locktype) AS lock_types
FROM owned_pids p
JOIN pg_stat_activity a ON a.pid = p.pid
JOIN owned_relation_locks l ON l.pid = p.pid
WHERE a.pid <> pg_backend_pid()
GROUP BY a.pid, a.xact_start, a.query_start, a.state, a.wait_event_type, a.wait_event, a.query
ORDER BY is_waiting DESC, query_age_ms DESC
LIMIT 65;
`;

export function startOwnedPgWaitObservation({ connectionString, schema, evidence }) {
  if (typeof schema !== 'string' || !/^t30_screen_[a-f0-9]{32}$/.test(schema)) {
    throw new Error('Invalid schema namespace');
  }
  if (typeof connectionString !== 'string' || !connectionString) {
    throw new Error('Missing connectionString');
  }
  if (typeof evidence !== 'string' || !evidence) {
    throw new Error('Missing evidence directory');
  }

  const url = new URL(connectionString);
  url.searchParams.set(
    'options',
    `-c search_path=${schema} -c default_transaction_read_only=on -c statement_timeout=1000`
  );

  const pool = new pg.Pool({
    connectionString: url.href,
    max: 1,
    connectionTimeoutMillis: 1500,
    statement_timeout: 1000,
    query_timeout: 1500,
  });

  const observedClients = new WeakSet();
  const clientEnds = [];
  let stopped = false;
  let inFlightPromise = null;
  let stopPromise = null;
  let sampleCount = 0;
  let failureCount = 0;
  let readFailures = 0;
  let writeFailures = 0;
  let idleErrors = 0;
  let wasTruncated = false;
  let inFlightSettled = true;
  let poolEnded = false;

  pool.on('error', () => {
    idleErrors += 1;
    failureCount += 1;
  });

  const diagnosticsPath = path.join(evidence, 'pg-wait-diagnostics.jsonl');
  const healthPath = path.join(evidence, 'pg-wait-observation-health.json');

  function writeFinalHealth() {
    const health = {
      recordedAt: new Date().toISOString(),
      inFlightSettled,
      poolEnded,
      failureCount,
      readFailures,
      writeFailures,
      idleErrors,
      truncated: wasTruncated,
      sampleCount,
      observationComplete: failureCount === 0 && !wasTruncated && inFlightSettled && poolEnded,
    };
    try {
      fs.writeFileSync(healthPath, JSON.stringify(health, null, 2) + '\n');
    } catch {
      writeFailures += 1;
      failureCount += 1;
      health.failureCount = failureCount;
      health.writeFailures = writeFailures;
      health.observationComplete = false;
    }
    return health;
  }

  async function sample() {
    if (stopped || inFlightPromise) return;
    const currentSampleIndex = ++sampleCount;
    const task = (async () => {
      let client = null;
      const monotonicStart = performance.now();
      const hostStart = Date.now();
      const hostStartIso = new Date(hostStart).toISOString();
      try {
        client = await pool.connect();
        if (!observedClients.has(client)) {
          observedClients.add(client);
          clientEnds.push(new Promise(resolve => client.once('end', resolve)));
          client.on('error', () => {
            idleErrors += 1;
            failureCount += 1;
          });
        }

        const res = await client.query(PG_WAIT_SQL, [schema, FG_RELATIONS_WHITELIST]);
        client.release();
        client = null;

        const hostEnd = Date.now();
        const hostEndIso = new Date(hostEnd).toISOString();
        const hostDurationMs = performance.now() - monotonicStart;

        const truncated = res.rows.length > 64;
        if (truncated) {
          wasTruncated = true;
        }
        const rawRows = res.rows.slice(0, 64);
        const ownedPidSet = new Set(rawRows.map((r) => Number(r.pid)));

        const rows = rawRows.map((r) => {
          const rawPids = Array.isArray(r.raw_blocking_pids) ? r.raw_blocking_pids.map(Number) : [];
          const scopedBlockerPids = rawPids.filter((p) => ownedPidSet.has(p));
          const externalBlockerCount = rawPids.filter((p) => !ownedPidSet.has(p)).length;

          const state = ALLOWED_STATES.has(r.state) ? r.state : 'other';
          const waitEventType = ALLOWED_WAIT_EVENT_TYPES.has(r.wait_event_type) ? r.wait_event_type : 'other';
          const waitEvent = ALLOWED_WAIT_EVENTS.has(r.wait_event) ? r.wait_event : 'other';
          const queryShape = ALLOWED_QUERY_SHAPES.has(r.query_shape) ? r.query_shape : 'other';

          const relations = (Array.isArray(r.relations) ? r.relations : []).map((name) =>
            FG_RELATIONS_SET.has(name) ? name : 'other'
          );
          const lockModes = (Array.isArray(r.lock_modes) ? r.lock_modes : []).map((mode) =>
            ALLOWED_LOCK_MODES.has(mode) ? mode : 'other'
          );
          const lockTypes = (Array.isArray(r.lock_types) ? r.lock_types : []).map((t) =>
            ALLOWED_LOCK_TYPES.has(t) ? t : 'other'
          );

          const serverEpochMs = Number(r.server_epoch_ms);
          const serverAt =
            r.server_timestamp instanceof Date
              ? r.server_timestamp.toISOString()
              : Number.isFinite(serverEpochMs)
              ? new Date(serverEpochMs).toISOString()
              : null;

          const xactAgeMs =
            Number.isFinite(Number(r.xact_age_ms)) && Number(r.xact_age_ms) >= 0 ? Number(r.xact_age_ms) : 0;
          const queryAgeMs =
            Number.isFinite(Number(r.query_age_ms)) && Number(r.query_age_ms) >= 0 ? Number(r.query_age_ms) : 0;

          return {
            pid: Number.isInteger(Number(r.pid)) && Number(r.pid) > 0 ? Number(r.pid) : 0,
            blockerPids: scopedBlockerPids,
            externalBlockerCount,
            serverAt,
            serverEpochMs: Number.isFinite(serverEpochMs) ? serverEpochMs : 0,
            hostStart: hostStartIso,
            hostEnd: hostEndIso,
            hostDurationMs,
            xactAgeMs,
            queryAgeMs,
            state,
            waitEventType,
            waitEvent,
            queryShape,
            granted: Boolean(r.all_relation_locks_granted),
            isWaiting: Boolean(r.is_waiting),
            relations,
            lockModes,
            lockTypes,
          };
        });

        const record = {
          hostStart: hostStartIso,
          hostEnd: hostEndIso,
          hostDurationMs,
          sampleIndex: currentSampleIndex,
          truncated,
          rowCount: rows.length,
          rows,
        };

        try {
          fs.appendFileSync(diagnosticsPath, JSON.stringify(record) + '\n');
        } catch {
          writeFailures += 1;
          failureCount += 1;
        }
      } catch (err) {
        if (client) {
          try {
            client.release(err);
          } catch {}
          client = null;
        }
        readFailures += 1;
        failureCount += 1;
        const pgCode = typeof err?.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code) ? err.code : 'other';
        try {
          fs.appendFileSync(
            diagnosticsPath,
            JSON.stringify({
              hostAt: new Date().toISOString(),
              sampleIndex: currentSampleIndex,
              sampleError: true,
              code: pgCode,
              failureCount,
              invalidated: true,
            }) + '\n'
          );
        } catch {
          writeFailures += 1;
          failureCount += 1;
        }
      } finally {
        inFlightPromise = null;
      }
    })();

    inFlightPromise = task;
    await task;
  }

  const timer = setInterval(() => {
    void sample().catch(() => {});
  }, 1000);
  timer.unref();

  return async function stop() {
    if (stopPromise) return stopPromise;
    stopPromise = (async () => {
      if (stopped) {
        const health = writeFinalHealth();
        if (!health.observationComplete) {
          throw new Error('Diagnostic observation incomplete or failed');
        }
        return health;
      }
      stopped = true;
      clearInterval(timer);

      if (inFlightPromise) {
        let inFlightTimeoutHandle;
        const inFlightTimeoutPromise = new Promise((_, reject) => {
          inFlightTimeoutHandle = setTimeout(() => reject(new Error('in_flight_timeout')), 2000);
        });
        try {
          await Promise.race([inFlightPromise, inFlightTimeoutPromise]);
          inFlightSettled = true;
        } catch {
          inFlightSettled = false;
          failureCount += 1;
        } finally {
          clearTimeout(inFlightTimeoutHandle);
        }
      } else {
        inFlightSettled = true;
      }

      let poolEndTimeoutHandle;
      const poolEndTimeoutPromise = new Promise((_, reject) => {
        poolEndTimeoutHandle = setTimeout(() => reject(new Error('pool_end_timeout')), 2000);
      });
      try {
        await Promise.race([(async () => {await pool.end(); await Promise.all(clientEnds);})(), poolEndTimeoutPromise]);
        poolEnded = true;
      } catch {
        poolEnded = false;
        failureCount += 1;
      } finally {
        clearTimeout(poolEndTimeoutHandle);
      }

      const health = writeFinalHealth();
      if (!health.observationComplete) {
        throw new Error('Diagnostic observation incomplete or failed');
      }
      return health;
    })();
    return stopPromise;
  };
}
