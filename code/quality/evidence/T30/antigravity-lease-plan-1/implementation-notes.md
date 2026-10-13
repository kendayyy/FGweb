# FG T30 — Minimal Named Prepared QueryConfig for liveLease (antigravity-lease-plan-1)

## 1. Overview & Rationale

During Native8 execution (`quality/evidence/T30/gateway-timing-summary-2.json`), `db-query:lease` was executed 609 times with a p50 latency of 47ms (max 497ms). Under concurrent room lock contention, these cumulative delays caused `db-query:lock-room` to exceed the 3000ms canonical statement timeout, failing with PostgreSQL error `57014` (`canceling statement due to statement timeout`).

Diagnostics in `codex-t30-query-plan-diagnostic-2.txt` confirmed:
- **Planning time**: 14.9–27.5ms per query invocation.
- **Execution time**: 0.38–0.79ms per query invocation.

Over 95% of query latency was spent by PostgreSQL repeatedly parsing and planning the exact same query template. By wrapping the query in node-postgres's named prepared query configuration with `name: 'fg_live_call_admission_v1'`, PostgreSQL parses and plans the statement once per connection, reusing the plan via parameter binding (`Bind` and `Execute`) on subsequent calls. This reduces per-call query latency from ~47ms to <1ms without modifying data access semantics or caching query results.

---

## 2. Invariants & Scope Boundaries

1. **Exact SQL & Parameters Verbatim**:
   - The query SQL text in `apps/api/src/modules/calls/lease-store.ts` is 100% character-for-character identical to canonical baseline.
   - No modifications to tables, joins, predicates, `clock_timestamp()` evaluations, time intervals, or subqueries.
   - Parameter array `values: [id]` is strictly preserved.
2. **Zero Result or Authority Caching**:
   - Results are never cached in memory, in local variables, or across calls.
   - Every invocation of `liveLease(db, id)` issues a real database query to PostgreSQL under read-committed semantics.
   - Revocations, bans, session expirations, and room state changes take effect immediately on the very next invocation.
3. **Connection-Scoped Driver Management**:
   - Uses standard node-postgres `QueryConfig` (`{ name: 'fg_live_call_admission_v1', text, values: [id] }`).
   - The `pg` driver automatically manages `Parse`, `Bind`, and `Execute` per backend connection.
   - Function signature `liveLease(db: Pool | PoolClient, id: string): Promise<LiveLease | undefined>` is unchanged.
4. **Untouched Adjacent Code**:
   - `publicationSources` and `publicationPermission` remain completely unmodified.
   - No schema changes, no migration additions, no global `plan_cache_mode` alterations, no timeout adjustments.
5. **No Actual Production Modifications**:
   - All proposals are confined strictly to `quality/evidence/T30/antigravity-lease-plan-1/**`.
   - Production source, dist, tests, and ledger are untouched.

---

## 3. Behavior Tests Added to Integration Suite

The proposed test file `quality/evidence/T30/antigravity-lease-plan-1/apps/api/test/t30-signaling-throughput.integration.spec.ts`:
1. Preserves all 9 existing integration tests, assertions, timeouts, and fixtures verbatim.
2. Imports `liveLease` from `../src/modules/calls/lease-store.js`.
3. Adds 3 real-owned-PG behavior tests via `it.each(['revoke', 'ban', 'expire'] as const)`:
   - **Warm Execution**: Executes 25 consecutive `liveLease` calls on the SAME dedicated `PoolClient`.
   - **Parameter Differentiation**: Verifies that passing distinct admission IDs (`userA` vs `userB`) correctly distinguishes the two valid records on the same prepared statement.
   - **Immediate Invalidation on Independent Commit**: An external connection executes an independent mutation (`UPDATE call_admissions SET revoked_at=...`, `INSERT INTO admin_actions ... BAN`, or `UPDATE session SET expires_at=...`). The warm client's next call for `userA` immediately returns `undefined`, while `userB` remains valid.
   - **Prepared Statement Inspection**: Queries `pg_prepared_statements` for `name = 'fg_live_call_admission_v1'`, recording only numeric `generic_plans`, `custom_plans`, and `cacheCount` metrics.
   - **Cleanliness & Security**: Zero raw SQL, params, tokens, or IDs are logged.
   - **Cleanup**: The dedicated `PoolClient` is guaranteed released in a `finally` block.

---

## 4. Test Fixture Assumptions & Unresolved Risks

1. **Connection Pooling vs Prepared Statements**:
   - In node-postgres, named queries are prepared per physical backend connection. With `max: 20` pool clients, each connection will prepare `fg_live_call_admission_v1` on its first invocation. Subsequent calls on that connection will execute with zero planning overhead.
2. **PostgreSQL Plan Selection**:
   - PostgreSQL default behavior evaluates custom plans for the first 5 executions, after which it evaluates switching to a generic plan if the generic plan is not more expensive. This is standard PostgreSQL engine behavior and requires no configuration tweaks.
3. **Real Native E2E Verification**:
   - While integration tests verify that the named prepared statement functions correctly against real PostgreSQL with immediate invalidation, final proof of latency reduction under full concurrency will be established during Codex's execution of the Native9 E2E test.
