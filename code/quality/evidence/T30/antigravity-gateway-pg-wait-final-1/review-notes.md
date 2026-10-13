# T30 Gateway PostgreSQL Lock Wait Diagnostic Sampler (Final Revision)

## 1. Overview & Codex Finding Resolutions

This final revision (`antigravity-gateway-pg-wait-final-1`) addresses the critical findings identified by Codex in the prior round:

### 1.1 `writeFinalHealth` IO Failure Accounting & Rejection on Incomplete Observation
- **Problem**: Previously, `writeFinalHealth` swallowed file writing IO errors in a silent catch block, allowing callers to assume success even if health metrics could not be persisted. Furthermore, `stop()` returned a resolved outcome even when `failureCount > 0` or queries timed out.
- **Resolution**:
  - `writeFinalHealth` now catches write errors and directly increments `writeFailures` and `failureCount`, forcing `observationComplete = false`.
  - `stop()` inspects `health.observationComplete`. If any failures occurred (`failureCount > 0`, truncation, unsettled in-flight read, or pool close failure), `stop()` **rejects with a safe generic Error** (`Error('Diagnostic observation incomplete or failed')`).
  - On complete success, `stop()` resolves with the verified `health` object.
  - Repeat calls return the exact same settled Promise idempotently, without unhandled promise rejections.

### 1.2 Client Lifecycle, Error Handling & Pool End Starvation
- **Problem**: In `node-postgres`, `query_timeout` is a client-side timer. When it fires, the query callback returns an error, but the underlying TCP connection and client object may remain active. If returned to the pool via a normal `release()`, the pool does not know the socket is compromised, which can starve or hang subsequent operations like `pool.end()`.
- **Resolution**:
  - The sampler acquires an explicit client via `client = await pool.connect()` and attaches a client `'error'` listener.
  - On query completion, `client.release()` cleanly returns the client to the pool.
  - On any query timeout, error, or exception, the sampler invokes `client.release(err)`. In `pg-pool`, passing an error argument to `release()` instructs the pool to **destroy the client and close the socket immediately**, rather than returning it to the pool.
  - The PostgreSQL server enforces `statement_timeout = 1000` via connection startup options, ensuring server-side query cancellation independently of client callbacks.
  - No business queries or foreign sessions are cancelled.

### 1.3 Server Clock & Monotonic Host Timing
- **Problem**: Previously, `clock_timestamp() AT TIME ZONE 'UTC'` produced a `timestamp without time zone` in PostgreSQL, which the `pg` driver parsed into Windows local timezone (UTC+7), creating clock ambiguity.
- **Resolution**:
  - The query now selects `clock_timestamp() AS server_timestamp` (retaining full PostgreSQL `timestamptz` semantics) and `ROUND(EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint AS server_epoch_ms`.
  - The sampler records host monotonic read duration: `hostStart` (ISO), `hostEnd` (ISO), and `hostDurationMs` (`hostEnd - hostStart`).
  - No speculative clock corrections are applied.

### 1.4 Strict Constant Allowlists & Anchored Query Classification
- **Problem**: Arbitrary regex for `wait_event` was not a strict allowlist, and query classifications could match substrings in arbitrary comments or parameters.
- **Resolution**:
  - `wait_event` is strictly checked against an explicit constant Set (`transactionid`, `tuple`, `relation`, `virtualxid`, `extend`, `object`, `advisory`, `ClientRead`, `ClientWrite`, `DataFileRead`, `DataFileWrite`, `DataFileSync`, `WALWrite`, `WALSync`, `WALRead`, `BufferMapping`, `BufferContent`, `ProcArray`, `LockManager`, `LWLock`, `Timeout`, `CheckpointDelay`, `SyncRep`, `none`). Any unrecognized event maps to `'other'`.
  - `wait_event_type` includes `LWLock` alongside standard types.
  - `lock_types` are validated against an explicit enum Set (`relation`, `extend`, `page`, `tuple`, `transactionid`, `virtualxid`, `object`, `userlock`, `advisory`, `none`).
  - SQL query classification regexes are anchored to command starts (`^\s*SELECT...`, `^\s*COMMIT(\s*;)?$`, `^\s*BEGIN(\s*;)?$`, `^\s*ROLLBACK(\s*;)?$`).
  - Finite non-negative ages (`xactAgeMs >= 0`, `queryAgeMs >= 0`) and valid positive integer PIDs are strictly validated.

### 1.5 Resilient Fixture Server Cleanup
- **Problem**: In the previous fixture, IO errors during media diagnostic/stat file writes prevented `fixture.close()` from executing. Similarly, Redis keys errors prevented `redis.quit()`, and schema drop failures prevented `pool.end()`.
- **Resolution**:
  - `cleanup()` introduces an `attempt(name, fn)` helper for every distinct cleanup operation.
  - `fixture.close()` is called independently of `mediaDiagnostics`.
  - `redis.quit()` is called independently of `redisKeys`.
  - `pool.end()` is called independently of `dropSchema`.
  - `apiOwnerHealth` is written independently of `cleanup.json`.
  - True resource removal boolean flags (`appClosed`, `webClosed`, `mediaRemoved`, `presenceRemoved`, `schemaRemoved`) are updated only upon actual success.
  - Aggregated generic errors are thrown via `AggregateError` only after all teardown steps complete.

---

## 2. File Inventory & SHA-256 Hashes

| File | Type | SHA-256 Hash |
| :--- | :--- | :--- |
| `quality/evidence/T30/fixture-server-shaped.mjs` | Base Approved Fixture | `9d4d97ad27b74f8843dd21974e4571e4af789a107bf4a345334bd4acf103098a` |
| `quality/evidence/T30/antigravity-gateway-pg-wait-final-1/fixture-server-shaped.mjs` | Proposed Shaped Fixture Server | `57c75ebb81e9ffea31e4ea33f9290c7dfd582a38a2f2b75b6386eede24d401be` |
| `quality/evidence/T30/antigravity-gateway-pg-wait-final-1/pg-wait-observation.mjs` | Proposed PG Lock Wait Sampler | `4246e8ef5a45041c52cf49901568262d71b4a8962a79f8c4b78bbe1754eb4e75` |
| `quality/evidence/T30/antigravity-gateway-pg-wait-review-1/pg-wait-observation.mjs` | Prior Sampler (Preserved) | `d55119651cb06cbf2130274362571feb452deab8cb1492642360543238d762e1` |
| `quality/evidence/T30/antigravity-gateway-sql-wait-observation-1/pg-wait-observation.mjs` | Initial Sampler (Preserved) | `cd4305f9fffc2449d122a8ae8df70a0aa125f5a849308bb758fa050fc9a50790` |

---

## 3. Detailed Explanation: `client.release(error)` vs `query_timeout` Only Callback

In `pg` (`node-postgres`):
1. **Query Timeout Mechanism**: The `query_timeout` setting creates a Node.js `setTimeout` timer for each query execution. When the client timer triggers, the query callback returns an error `Query read timeout`. However, the query callback alone cannot prove that the PostgreSQL server has halted processing or that the underlying socket protocol state is synchronized.
2. **Client Starvation Risk**: If code simply calls `client.release()`, the client is returned to the pool's idle queue. A subsequent query or `pool.end()` awaiting a clean disconnect will attempt to communicate over a desynchronized or hung connection, leading to pool teardown timeouts.
3. **Destruction via `release(err)`**: In `pg-pool`, calling `client.release(err)` with an Error object signals connection failure. The pool immediately executes `client.destroy()`, closing the raw TCP stream and removing the client from the pool inventory. This guarantees that `pool.end()` will never stall on a dead connection.
4. **Server-Side Bounds**: Independently, the PostgreSQL server session is configured with `-c statement_timeout=1000` and `-c default_transaction_read_only=on`. If a query exceeds 1,000 ms, PostgreSQL cancels the statement server-side with error code `57014`.

---

## 4. Controlled Real PostgreSQL Blocker Smoke Steps

The following steps define the verification procedure for Codex to validate the lock sampler against real PostgreSQL:

### Step 1: Controlled Lock Scenario Setup
1. Connect to PostgreSQL using `.env.local` credentials.
2. Create an isolated schema:
   ```sql
   CREATE SCHEMA "t30_screen_00000000000000000000000000000001";
   CREATE TABLE "t30_screen_00000000000000000000000000000001".rooms (id text PRIMARY KEY);
   INSERT INTO "t30_screen_00000000000000000000000000000001".rooms (id) VALUES ('smoke-room-1');
   ```
3. Open Connection 1 (Writer):
   ```sql
   SET search_path TO "t30_screen_00000000000000000000000000000001";
   BEGIN;
   SELECT id FROM rooms WHERE id = 'smoke-room-1' FOR UPDATE;
   ```
4. Open Connection 2 (Reader):
   ```sql
   SET search_path TO "t30_screen_00000000000000000000000000000001";
   BEGIN;
   SELECT id FROM rooms WHERE id = 'smoke-room-1' FOR SHARE;
   -- Query blocks on Connection 1.
   ```

### Step 2: Sampler Execution & Observation Validation
1. Start observation:
   ```javascript
   const stop = startOwnedPgWaitObservation({
     connectionString: process.env.DATABASE_URL,
     schema: 't30_screen_00000000000000000000000000000001',
     evidence: 'scratch/smoke-evidence',
   });
   ```
2. Wait 1,200 ms.
3. Verify `scratch/smoke-evidence/pg-wait-diagnostics.jsonl`:
   - Reader: `isWaiting: true`, `queryShape: 'selectRoomsShare'`, `state: 'active'`, `blockerPids: [WriterPID]`, `externalBlockerCount: 0`.
   - Writer: `isWaiting: false`, `queryShape: 'selectRoomsUpdate'`, `state: 'idleInTransaction'`.
   - `relations` contains `['rooms']`.
   - `lockModes` contains `['RowShareLock']`.
   - Waiter sorted first.
   - Timestamps include `serverAt`, `serverEpochMs`, `hostStart`, `hostEnd`, `hostDurationMs`.

### Step 3: Read-Only Enforcement Verification
1. Connect via sampler connection:
   ```javascript
   await samplerPool.query("INSERT INTO rooms (id) VALUES ('fail')");
   ```
2. Assert error code `25006` (`read_only_sql_transaction`).

### Step 4: Bounded Stop & Draining Verification
1. Call `const health = await stop()`.
2. Release locks: Connection 1 `ROLLBACK`, Connection 2 `ROLLBACK`.
3. Assert `health`:
   - `inFlightSettled: true`
   - `poolEnded: true`
   - `failureCount: 0`
   - `truncated: false`
   - `observationComplete: true`
4. Assert repeat `await stop()` returns the exact same resolved `health` object.
5. Wait 1,500 ms and assert no subsequent records appended.

### Step 5: Failure Path Invalidation Verification
1. Initialize sampler with unreachable host or invalid schema.
2. Call `await stop()`.
3. Assert `stop()` **rejects** with generic `Error('Diagnostic observation incomplete or failed')`.
4. Assert `health.observationComplete === false` and `health.failureCount > 0`.

### Step 6: Teardown
1. Drop the temporary schema:
   ```sql
   DROP SCHEMA "t30_screen_00000000000000000000000000000001" CASCADE;
   ```

---

## 5. Compliance & Policy Confirmation

- No tests or builds were run.
- Zero edits to application source, `dist/`, runtime configs, database schemas, ledger, or history.
- Purely diagnostic proposals. No task PASS claimed.
