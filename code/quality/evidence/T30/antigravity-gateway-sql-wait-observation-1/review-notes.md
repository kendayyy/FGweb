# T30 Gateway SQL Wait & Lock Contention Diagnostic Review

## 1. Overview & Diagnostic Purpose

In `native28`, the test executed three real screen captures and passed the third publisher slot assertion, but failed at the fourth initial room loading assertion (~5000ms timeout). Telemetry recorded 17 gateway errors with PostgreSQL error code `57014` (`statement_timeout: 3000`):
- 4 errors in `scheduleDrain`
- Errors in `upgrade` during the `authorize` phase (~3.2–4.4s duration)
- Errors in `httpHandler`

Because the event loop delay max was only 228.983ms, host CPU/event loop starvation was ruled out as the primary cause. PostgreSQL `57014` statement timeouts inside the gateway's `lockedLease` transactions are the direct source of HTTP 503/502 and WebSocket 1006 aborts.

This proposal provides purely observational, diagnostic instrumentation to isolate:
1. The exact failing SQL operation within the private signaling gateway's `lockedLease` sequence.
2. The real PostgreSQL lock contention, waiting PIDs, and blocking PIDs across allowlisted FG tables in the test schema.

**Constraints Strictly Preserved:**
- Proposals only in `quality/evidence/T30/antigravity-gateway-sql-wait-observation-1/`.
- Zero changes to application source, `dist/`, runtime configurations, database schemas, ledger, or history.
- Zero test, build, or browser execution by this agent.
- Diagnosis only: no speculative functional modifications, no claims of performance improvement, and no claims of task PASS.

---

## 2. File Inventory & SHA-256 Hashes

| File | Type | SHA-256 Hash |
| :--- | :--- | :--- |
| `quality/evidence/T30/signaling-gateway-observation-reviewed.js` | Base (Canonical) | `ca37d0ee0b1f6b21f102ffa92acc752fa13723b7dcfa75666a7bd69a25d44f07` |
| `quality/evidence/T30/antigravity-gateway-sql-wait-observation-1/signaling-gateway-observed.js` | Proposed Observed Gateway | `66dc198b945ae6a1dfa50b0dfb1d777ab517a012704f01f98edab00cda1bc3ae` |
| `quality/evidence/T30/antigravity-gateway-sql-wait-observation-1/pg-wait-observation.mjs` | Proposed PG Lock Wait Sampler | `cd4305f9fffc2449d122a8ae8df70a0aa125f5a849308bb758fa050fc9a50790` |
| `quality/evidence/T30/fixture-server-shaped.mjs` | Base (Canonical) | `9516d2081afed3bc8c94e3c2a5778a9755638e40e494d6db23ed23724879904b` |
| `quality/evidence/T30/antigravity-gateway-sql-wait-observation-1/fixture-server-shaped.mjs` | Proposed Shaped Fixture Server | `f9a85a97fa0af119a0e581cc06f9b3926021626746e3329c8bd74b53b238bd30` |
| `quality/evidence/T30/private-gateway-shaped-fixture.mjs` | Base (Canonical) | `241d588d5a5cba5e89add923416c229ec50b33dd02d82514d9349188056dcd7e` |
| `quality/evidence/T30/antigravity-gateway-sql-wait-observation-1/private-gateway-shaped-fixture.mjs` | Proposed Gateway Container Fixture | `6902c1ee46b4d81d8074c41a3982be0291442c67c179af5f2d290857bb111ab2` |

---

## 3. Implementation Details

### 3.1 Signaling Gateway Observer (`signaling-gateway-observed.js`)
- Retains 100% of the root fixes, security guards, options, and error handling from `signaling-gateway-observation-reviewed.js`.
- Introduces `observeOperation(db, label, operation)`:
  - Uses `process.hrtime.bigint()` for monotonic wall timing.
  - Captures `db.processID` as numeric `backendPid`.
  - Invokes the operation exactly once via arrow function.
  - Catches errors, logs `{ type: 'sqlOperation', label, at, durationMs, backendPid, ...extractTaxonomy(error) }`, and rethrows the exact same error.
  - For operations completing without error, emits a record only if `durationMs >= 50` (partial slow query observation).
  - All logging and serialization is guarded by `try ... catch { recordObservationFailure(); }`, ensuring logging cannot alter transaction flow or error outcomes.
- Strictly instruments only the 8 operations in `lockedLease`:
  1. `begin` (`BEGIN`)
  2. `setTimezone` (`SET LOCAL TIME ZONE 'UTC'`)
  3. `liveLeaseInitial` (`liveLease(db, id)`)
  4. `lockRoomsShare` / `lockRoomsUpdate` (`SELECT id FROM rooms WHERE id=$1 ...`)
  5. `lockCallGroupsShare` / `lockCallGroupsUpdate` (`SELECT id FROM call_groups WHERE id=$1 ...`)
  6. `liveLeaseCurrent` (`liveLease(db, id)`)
  7. `commit` (`COMMIT`)
  8. `rollback` (`ROLLBACK` in catch)
- The transaction callback `run(db, current)` and all other methods remain un-wrapped and unchanged.

### 3.2 PostgreSQL Lock Wait Sampler (`pg-wait-observation.mjs`)
- Exports `startOwnedPgWaitObservation(pool, schema, evidence)`.
- Runs on the owned fixture pool (not application or API pools) via an unref'd `setInterval(sample, 1000)`.
- Guarded against concurrency via `inFlightPromise` (at most one sample in flight).
- Parameterized SQL:
  - `$1`: the dynamic fixture schema (`t30_screen_...`).
  - `$2`: allowlist of FG relation names (`rooms`, `call_groups`, `call_members`, `call_admissions`, `user`, `session`, `profiles`, `call_publish_slots`, `call_restrictions`, `room_members`, `play_sessions`, `game_interests`, `admin_actions`, `teams`, `team_members`, `play_requests`).
- Collects:
  - Numeric `pid` and `blocking_pids` array.
  - `xact_age_ms` and `query_age_ms`.
  - Normalized `state` enum and `wait_event_type` / `wait_event`.
  - Normalized `query_shape` via SQL `CASE` statement (e.g. `selectRoomsUpdate`, `selectRoomsShare`, `selectCallGroupsUpdate`, `selectCallGroupsShare`, `commit`, `begin`, `rollback`, etc.).
  - Relation name, lock type, lock mode, and granted status.
  - Excludes the sampler backend PID (`a.pid <> pg_backend_pid()`).
  - Zero raw SQL text, parameters, user IDs, or connection secrets are emitted.
- Limit 65 rows: if row count exceeds 64, marks `incomplete: true` and truncates to 64 rows.
- Output: Appends to `${evidence}/pg-wait-diagnostics.jsonl`.
- Idempotent `stop()`: Clears interval, bounds in-flight query completion to a 2000ms timeout before schema cleanup.

### 3.3 Fixture Server (`fixture-server-shaped.mjs`)
- Adds named import `startOwnedPgWaitObservation`.
- Initializes `stopPgWait = startOwnedPgWaitObservation(pool, schema, evidence);` immediately after migrations and game seeding.
- Invokes `if (stopPgWait) { await stopPgWait(); stopPgWait = null; }` at the start of `cleanup()` before closing applications or dropping the schema.

### 3.4 Container Fixture (`private-gateway-shaped-fixture.mjs`)
- Modifies only line 41's bind mount:
  - Points `target=/gateway/app/signaling-gateway.js` to `quality/evidence/T30/antigravity-gateway-sql-wait-observation-1/signaling-gateway-observed.js`.

---

## 4. Instrumentation Overhead & Constraints

1. **Partial Slow Query Emission**:
   - Operations under 50ms are suppressed during normal operation. This deliberately avoids logging overhead and I/O noise, while ensuring all timeouts (`statement_timeout = 3000ms`) and slow locks (>= 50ms) are recorded.
2. **Periodic Sampling Interval (1000ms)**:
   - The lock sampler checks lock status every 1 second. Micro-locks held for < 1000ms that do not block other transactions may not be captured, but any lock contention resulting in multi-second waits or statement timeouts will be reliably sampled.
3. **Strict Relation Scoping**:
   - The query filters explicitly by schema and the 16 allowlisted tables. System catalogs, PostgreSQL background workers, and unrelated database connections are ignored.
4. **No Functional Claims**:
   - This suite does not modify query behavior, locking levels, pool configurations, or timeouts. Functional remedies must only be designed once empirical blocker and wait data is obtained.
