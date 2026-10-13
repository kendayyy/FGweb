import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

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
const ALLOWED_WAIT_EVENT_TYPES = new Set(['Activity', 'BufferPin', 'Client', 'Extension', 'IO', 'IPC', 'Lock', 'Timeout', 'none']);
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
    clock_timestamp() AT TIME ZONE 'UTC' AS server_timestamp,
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
        WHEN a.query ~* 'SELECT .* FROM rooms .* FOR UPDATE' THEN 'selectRoomsUpdate'
        WHEN a.query ~* 'SELECT .* FROM rooms .* FOR SHARE' THEN 'selectRoomsShare'
        WHEN a.query ~* 'SELECT .* FROM call_groups .* FOR UPDATE' THEN 'selectCallGroupsUpdate'
        WHEN a.query ~* 'SELECT .* FROM call_groups .* FOR SHARE' THEN 'selectCallGroupsShare'
        WHEN a.query ~* 'COMMIT' THEN 'commit'
        WHEN a.query ~* 'BEGIN' THEN 'begin'
        WHEN a.query ~* 'ROLLBACK' THEN 'rollback'
        WHEN a.query ~* 'UPDATE call_admissions' THEN 'updateCallAdmissions'
        WHEN a.query ~* 'UPDATE' THEN 'updateOther'
        WHEN a.query ~* 'SELECT' THEN 'selectOther'
        WHEN a.query ~* 'INSERT' THEN 'insert'
        WHEN a.query ~* 'DELETE' THEN 'delete'
        ELSE 'other'
    END AS query_shape,
    COALESCE(bool_and(l.granted), true) AS all_relation_locks_granted,
    (NOT COALESCE(bool_and(l.granted), true) OR cardinality(COALESCE(pg_blocking_pids(a.pid), ARRAY[]::integer[])) > 0) AS is_waiting,
    array_agg(DISTINCT l.relname) AS relations,
    array_agg(DISTINCT l.mode) AS lock_modes
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
      // Must safely not throw or alter caller outcomes
    }
  }

  async function sample() {
    if (stopped || inFlightPromise) return;
    const currentSampleIndex = ++sampleCount;
    const task = (async () => {
      try {
        const res = await pool.query(PG_WAIT_SQL, [schema, FG_RELATIONS_WHITELIST]);
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
          const waitEvent =
            typeof r.wait_event === 'string' && /^[a-zA-Z0-9_]{1,64}$/.test(r.wait_event)
              ? r.wait_event
              : 'other';
          const queryShape = ALLOWED_QUERY_SHAPES.has(r.query_shape) ? r.query_shape : 'other';

          const relations = (Array.isArray(r.relations) ? r.relations : []).map((name) =>
            FG_RELATIONS_SET.has(name) ? name : 'other'
          );
          const lockModes = (Array.isArray(r.lock_modes) ? r.lock_modes : []).map((mode) =>
            ALLOWED_LOCK_MODES.has(mode) ? mode : 'other'
          );

          return {
            pid: Number(r.pid),
            blockerPids: scopedBlockerPids,
            externalBlockerCount,
            serverAt:
              r.server_timestamp instanceof Date
                ? r.server_timestamp.toISOString()
                : typeof r.server_timestamp === 'string'
                ? r.server_timestamp
                : null,
            hostAt: new Date().toISOString(),
            xactAgeMs: Number(r.xact_age_ms),
            queryAgeMs: Number(r.query_age_ms),
            state,
            waitEventType,
            waitEvent,
            queryShape,
            granted: Boolean(r.all_relation_locks_granted),
            isWaiting: Boolean(r.is_waiting),
            relations,
            lockModes,
          };
        });

        const record = {
          hostAt: new Date().toISOString(),
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
      if (stopped) return;
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
        await Promise.race([pool.end(), poolEndTimeoutPromise]);
        poolEnded = true;
      } catch {
        poolEnded = false;
        failureCount += 1;
      } finally {
        clearTimeout(poolEndTimeoutHandle);
      }

      writeFinalHealth();
    })();
    return stopPromise;
  };
}
