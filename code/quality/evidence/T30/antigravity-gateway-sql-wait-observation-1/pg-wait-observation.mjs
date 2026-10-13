import fs from 'node:fs';
import path from 'node:path';

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

const PG_WAIT_SQL = `
WITH target_relations AS (
    SELECT c.oid AS relid, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = $1 AND c.relname = ANY($2::text[])
),
relation_locks AS (
    SELECT l.pid, l.locktype, l.mode, l.granted, r.relname
    FROM pg_locks l
    JOIN target_relations r ON l.relation = r.relid
),
waiters AS (
    SELECT pid FROM relation_locks WHERE NOT granted
),
blockers AS (
    SELECT unnest(pg_blocking_pids(pid)) AS pid FROM waiters
),
active_pids AS (
    SELECT pid FROM relation_locks
    UNION
    SELECT pid FROM blockers
)
SELECT
    a.pid,
    COALESCE(pg_blocking_pids(a.pid), ARRAY[]::integer[]) AS blocking_pids,
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
    l.relname,
    l.locktype,
    l.mode AS lock_mode,
    COALESCE(l.granted, false) AS granted
FROM active_pids p
JOIN pg_stat_activity a ON a.pid = p.pid
LEFT JOIN relation_locks l ON l.pid = p.pid
WHERE a.pid <> pg_backend_pid()
LIMIT 65;
`;

export function startOwnedPgWaitObservation(pool, schema, evidence) {
  let stopped = false;
  let inFlightPromise = null;
  let sampleIndex = 0;
  let observationFailures = 0;

  async function sample() {
    if (stopped || inFlightPromise) return;
    const currentSampleIndex = ++sampleIndex;
    const task = (async () => {
      try {
        const res = await pool.query(PG_WAIT_SQL, [schema, FG_RELATIONS_WHITELIST]);
        const incomplete = res.rows.length > 64;
        const rows = res.rows.slice(0, 64);
        const record = {
          at: new Date().toISOString(),
          sampleIndex: currentSampleIndex,
          incomplete,
          rowCount: rows.length,
          rows: rows.map((r) => ({
            pid: Number(r.pid),
            blockingPids: Array.isArray(r.blocking_pids) ? r.blocking_pids.map(Number) : [],
            xactAgeMs: Number(r.xact_age_ms),
            queryAgeMs: Number(r.query_age_ms),
            state: r.state,
            waitEventType: r.wait_event_type,
            waitEvent: r.wait_event,
            queryShape: r.query_shape,
            relname: r.relname ?? 'none',
            locktype: r.locktype ?? 'none',
            lockMode: r.lock_mode ?? 'none',
            granted: Boolean(r.granted),
          })),
        };
        try {
          fs.appendFileSync(path.join(evidence, 'pg-wait-diagnostics.jsonl'), JSON.stringify(record) + '\n');
        } catch {
          observationFailures += 1;
        }
      } catch (err) {
        observationFailures += 1;
        const pgCode = typeof err?.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code) ? err.code : 'other';
        try {
          fs.appendFileSync(
            path.join(evidence, 'pg-wait-diagnostics.jsonl'),
            JSON.stringify({
              at: new Date().toISOString(),
              sampleIndex: currentSampleIndex,
              sampleError: true,
              code: pgCode,
              failureCount: observationFailures,
              invalidated: true,
            }) + '\n'
          );
        } catch {}
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
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    if (inFlightPromise) {
      try {
        await Promise.race([
          inFlightPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('wait_timeout')), 2000)),
        ]);
      } catch {}
    }
  };
}
