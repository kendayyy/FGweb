# T30 Gateway PostgreSQL Lock Wait Diagnostic Sampler Review (Round 2)

## 1. Overview & Context

In `native30`, PostgreSQL `RoomsShare` operations inside the gateway's `lockedLease` transactions encountered `57014` (`statement_timeout: 3000`), while API `FOR SHARE` grants continued to make progress. The gateway's slow/error-only 8-operation wrappers and container mount were accepted in `gateway-sql-observation-source-review-1.json`, but the initial lock wait sampler proposal was rejected due to:
1. Swallowed 2-second timeout in `stop()` that left unmanaged timer handles and potential in-flight queries before schema drop.
2. Unreliable write failure tracking where missing observations could produce a false healthy status.
3. Excessive unaggregated lock rows overflowing the 64-row bound due to multiple locks per PID, alongside unconstrained blocker PID sets.

This revised proposal (`antigravity-gateway-pg-wait-review-1`) completely resolves these findings with:
- A separate dedicated diagnostic `pg.Pool` (`max: 1`) with session startup options `default_transaction_read_only=on`, `statement_timeout=1000`, `connectionTimeoutMillis: 1500`, and `query_timeout: 1500`. Application pools remain untouched.
- Strict namespace validation enforcing `^t30_screen_[a-f0-9]{32}$`.
- Single aggregated row per PID in SQL (`GROUP BY a.pid...`), sorted with waiters first, bounded to limit 65 (max 64 persisted) with explicit `truncated` tracking.
- Blocker identities strictly filtered to the owned application PID set; external blockers are counted numerically (`externalBlockerCount`) without exposing identities.
- Strict categorical allowlists for `state`, `wait_event_type`, `wait_event`, `lock_modes`, `relations`, and `query_shape`; zero SQL text, parameters, or private connection details are returned.
- Deterministic and bounded `stop()`: clears the unref'd timer, races in-flight queries and `pool.end()` against explicit 2-second timeouts with handles cleaned via `clearTimeout()`, and records verified boolean flags (`inFlightSettled`, `poolEnded`, `failureCount`, `truncated`, `observationComplete`) in `pg-wait-observation-health.json`.
- Resilient fixture server cleanup: `cleanup()` attempts all resource disposals (`app`, `web`, `fixture`, `redis`, `pool`) even if `stopPgWait()` or an earlier step throws, recording true individual success flags and rethrowing aggregated failures only after all resources have been processed.

---

## 2. File Inventory & SHA-256 Hashes

| File | Type | SHA-256 Hash |
| :--- | :--- | :--- |
| `quality/evidence/T30/fixture-server-shaped.mjs` | Base Approved Fixture | `9d4d97ad27b74f8843dd21974e4571e4af789a107bf4a345334bd4acf103098a` |
| `quality/evidence/T30/antigravity-gateway-pg-wait-review-1/fixture-server-shaped.mjs` | Proposed Shaped Fixture Server | `a54031c06775a010535a0e02b0b6a06fb9626fa396b7d5312def330dab74dfa9` |
| `quality/evidence/T30/antigravity-gateway-pg-wait-review-1/pg-wait-observation.mjs` | Proposed PG Lock Wait Sampler | `d55119651cb06cbf2130274362571feb452deab8cb1492642360543238d762e1` |
| `quality/evidence/T30/antigravity-gateway-sql-wait-observation-1/pg-wait-observation.mjs` | Rejected Prior Sampler (Preserved) | `cd4305f9fffc2449d122a8ae8df70a0aa125f5a849308bb758fa050fc9a50790` |

---

## 3. Controlled Real PostgreSQL Blocker Smoke Steps

The following steps define the controlled verification procedure for Codex to validate the lock sampler against real PostgreSQL before integration into native testing:

### Step 1: Controlled Lock Scenario Setup
1. Connect to PostgreSQL using `.env.local` credentials.
2. Create an isolated schema matching the required pattern:
   ```sql
   CREATE SCHEMA "t30_screen_00000000000000000000000000000001";
   CREATE TABLE "t30_screen_00000000000000000000000000000001".rooms (id text PRIMARY KEY);
   INSERT INTO "t30_screen_00000000000000000000000000000001".rooms (id) VALUES ('smoke-room-1');
   ```
3. Establish Connection 1 (Writer):
   ```sql
   SET search_path TO "t30_screen_00000000000000000000000000000001";
   BEGIN;
   SELECT id FROM rooms WHERE id = 'smoke-room-1' FOR UPDATE;
   ```
4. Establish Connection 2 (Reader):
   ```sql
   SET search_path TO "t30_screen_00000000000000000000000000000001";
   BEGIN;
   SELECT id FROM rooms WHERE id = 'smoke-room-1' FOR SHARE;
   -- This query blocks on Connection 1.
   ```

### Step 2: Sampler Execution & Observation Validation
1. Initialize the sampler:
   ```javascript
   const stop = startOwnedPgWaitObservation({
     connectionString: process.env.DATABASE_URL,
     schema: 't30_screen_00000000000000000000000000000001',
     evidence: 'scratch/smoke-evidence',
   });
   ```
2. Wait 1,200 ms to capture a sample.
3. Read `scratch/smoke-evidence/pg-wait-diagnostics.jsonl` and verify:
   - Exactly 2 rows returned in `rows`:
     - Row 1: Reader PID, `isWaiting: true`, `queryShape: 'selectRoomsShare'`, `state: 'active'`, `blockerPids: [WriterPID]`, `externalBlockerCount: 0`.
     - Row 2: Writer PID, `isWaiting: false`, `queryShape: 'selectRoomsUpdate'`, `state: 'idleInTransaction'`.
   - `relations` contains `['rooms']`.
   - `lockModes` contains `['RowShareLock']`.
   - Waiters are sorted first (`isWaiting: true` precedes `isWaiting: false`).
   - Zero raw SQL query strings, parameters, or schema names are emitted.

### Step 3: Read-Only Enforcement Verification
1. Attempt an `INSERT` using the sampler pool:
   ```javascript
   await samplerPool.query("INSERT INTO rooms (id) VALUES ('fail')");
   ```
2. Assert error code `25006` (`read_only_sql_transaction`).

### Step 4: Bounded Stop & Draining Verification
1. Call `await stop()`.
2. Rollback Connection 1 and Connection 2:
   ```sql
   -- Connection 1: ROLLBACK;
   -- Connection 2: ROLLBACK;
   ```
3. Inspect `scratch/smoke-evidence/pg-wait-observation-health.json`:
   - `inFlightSettled: true`
   - `poolEnded: true`
   - `failureCount: 0`
   - `truncated: false`
   - `observationComplete: true`
4. Wait 1,500 ms and assert no additional records are appended to `pg-wait-diagnostics.jsonl` (timer stopped and drained).

### Step 5: Failure Path Invalidation
1. Test with an unreachable database host or invalid credentials.
2. Assert `failureCount > 0` and `observationComplete: false` in `pg-wait-observation-health.json`.

### Step 6: Teardown
1. Drop the temporary schema:
   ```sql
   DROP SCHEMA "t30_screen_00000000000000000000000000000001" CASCADE;
   ```

---

## 4. Policy & Compliance Notice

- No tests, builds, or browser runs were executed.
- No changes made to application source (`apps/`), build outputs (`dist/`), database schemas, ledger, or history.
- Purely diagnostic proposal for Codex review and smoke verification. No claim of task PASS or performance improvement.
