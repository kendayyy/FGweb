# FG T30 - Signaling Gateway Startup DB Readiness & Pool Retention Review Notes (`antigravity-gateway-db-ready-1`)

## 1. Problem Context & Measured Connection Failure vs Remaining Lock Waits

In Native16 (`quality/evidence/T30/native16-photo-review.json` and `gateway-api-timing-summary-7.json`), the FIRST screen capture failed, with the earliest socket drain classified as:
- `connectTimeout: true`
- `connectionClosed: true`
- Followed later by ticker room lock timeout `57014` at 3048ms.

### Diagnostic Analysis
1. **Installed `pg-pool/index.js` (line 276)**:
   In `node_modules/pg-pool/index.js`, line 276 wraps new physical connection attempts with `connectionTimeoutMillis: 2000`. When 10+ clients burst into the signaling gateway simultaneously, fresh physical TCP/TLS handshakes to PostgreSQL can exceed 2000ms under container scheduling load, resulting in `Connection terminated due to connection timeout`.
2. **Behavior of `min` in `pg-pool`**:
   `pg-pool`'s `min` configuration prevents idle eviction (`_isAboveMin()` checks `this._clients.length > this.options.min`), but does **not** eagerly pre-spawn physical connections at process start. Connections are only created lazily as checkouts occur.
3. **Connection Failure vs Remaining Lock Waits**:
   Pool pre-warming eliminates physical connection establishment latency and timeout errors under burst traffic. However, `room:57014` lock contention on PostgreSQL rows remains an independent transactional concern; warming the pool ensures connection availability but is not claimed to resolve all transactional lock-wait conflicts.

---

## 2. Signaling Gateway Startup Readiness & Fixed Pool Retention Policy

1. **Pool Configuration**:
   - `min: 16, max: 16, connectionTimeoutMillis: 2000, statement_timeout: 3000`.
   - Default idle timeout (10000ms) unchanged.
   - Retains fixed pool capacity of 16 connections.
2. **Internal Startup Readiness Promise**:
   - At gateway startup, an internal `readyPromise` acquires exactly 16 connections concurrently via `Promise.allSettled(acquirePromises)`.
   - In `finally`, every successfully acquired client is released back to the pool.
   - If any acquisition fails, `readyPromise` rejects with `firstError`.
   - An immediate rejection handler (`void readyPromise.catch(() => {})`) prevents unhandled rejections, while awaited consumers observe the rejection.
3. **HTTP & WebSocket Upgrade Gating**:
   - `checkOrigin(req)` is enforced first.
   - `OPTIONS` preflight requests respond immediately without awaiting database readiness.
   - All active paths (`/health`, `/rtc/.../validate`, `/twirp/...`, and WebSocket upgrades `/rtc`) await `readyPromise` before active database authorization or queries.
   - `/health` only returns 200 after `await readyPromise` and `await pool.query('SELECT 1 FROM call_admissions LIMIT 1')`.
   - Startup failures fail closed with HTTP 503 (`Media admission denied`), never exposing raw errors, connection details, or database DSNs.
4. **Teardown & Lifecycle**:
   - `close()` marks `closing = true`, halts interval timers, closes client bindings and servers, awaits `await readyPromise.catch(() => {})` so any in-flight startup acquires settle and release, and finally calls `await pool.end()`.
   - No connection or client leaks.
5. **No Public API / Type Changes**:
   - `createSignalingGateway` return signature `{ server, close }` remains identical.

---

## 3. Canonical Native Fixture Restorations

1. **`private-gateway-shaped-fixture.mjs`**:
   Mounts canonical `apps/api/dist/modules/calls` (`apps/api/dist/modules/calls -> /gateway/app, readonly`).
2. **`fixture-server-shaped.mjs`**:
   All temporary `api-lock-observation-6` imports and invocations removed; matches clean canonical fixture server.

---

## 4. Integration Test Suite Structure (24 Total Real-PG Callbacks)

The test suite in `t30-signaling-throughput.integration.spec.ts` preserves all 22 existing test callbacks verbatim and adds 2 meaningful real-PG black-box tests directly against the actual gateway:

1. **Preserved Callbacks (22 Callbacks)**:
   - 15 original throughput/guard callbacks (32 PING/PONG, mid-batch revoke/ban/expire, screen quota limits, queue bounds, warm prepared statements, reader/writer isolation).
   - 2 concurrent reader callbacks with 1500ms deadline, exact DTO assertions, and `canonicalDtoAdmission` wrapping.
   - 5 negative principal authorization callbacks (`outsider`, `expired_session`, `deleted_session`, `banned`, `no_onboarding`).
2. **New Black-Box Test 23 (Warm Pool Retention & Fresh Lease PING)**:
   - Starts gateway with a unique `application_name`.
   - Verifies `/health` returns 200.
   - Queries `pg_stat_activity` to assert exactly 16 idle backends are present before any client authentication.
   - Awaits 11000ms (> 10s idle eviction timeout) and re-queries `pg_stat_activity` to prove all 16 idle backends are retained without eviction.
   - Connects a valid joined principal and exchanges a PING/PONG frame to prove fresh lease and active signaling.
   - Closes gateway and asserts all 16 backends terminate cleanly.
3. **New Black-Box Test 24 (Fail-Closed on Invalid DB Bootstrap & Clean Teardown)**:
   - Starts gateway with an incorrect database password in the local fixture URL.
   - Verifies `/health` returns 503 with generic body (`Media admission denied`), confirming no passwords, DSNs, or raw errors leak.
   - Verifies WebSocket connection is rejected with 503 and upstream SFU receives zero requests.
   - Verifies `gateway.close()` settles cleanly within bounded time (< 5000ms).
   - Asserts scoped PostgreSQL activity for the invalid application name is completely terminated.

---

## 5. File Verification & SHA-256 Hashes

| File | SHA-256 | Description |
| :--- | :--- | :--- |
| `signaling-gateway.ts` | `c4052b41ee1a254fdaadabf1b5376449595be66adf281929ef971d97d44e8c55` | Startup pool warming (`min: 16`, `max: 16`), internal readyPromise, fail-closed 503 |
| `t30-signaling-throughput.integration.spec.ts` | `e03812aa6b9cb707d9654ad499058c675a79a1bf47147345a95b7caed5446415` | 24 executed integration test callbacks (22 preserved + 2 real-PG startup/retention) |
| `fixture-server-shaped.mjs` | `bfd4c5fe5131ea69b4240858e1249bdfe9663e7142b65ede609ee9951f06b3a2` | Restored canonical fixture server |
| `private-gateway-shaped-fixture.mjs` | `d891dbd9f976a5ea39de29dc842ae9826f782a57efa10a656bf1822d28d3696f` | Restored canonical gateway mount fixture |
| `review-notes.md` | *(Computed below)* | Review documentation |

*No production source, dist, tests, git ledger, or history files were altered. No build or test runs were executed. No claim of task PASS or native acceptance.*
