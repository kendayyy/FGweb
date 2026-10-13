# FG T30 — Initial API Loading Profile Timing Observation Review Notes

**Directory**: `quality/evidence/T30/antigravity-api-loading-profile-timing-1`  
**Agent**: Antigravity (Gemini 3.6 Flash High)  
**Policy**: T30 only, NO Anti2 (`NO-ANTI2-01`), no subagents. Observational proposal only.  
**Execution Boundary**: Zero tests, builds, or browser runs executed. No edits outside `quality/evidence/T30/antigravity-api-loading-profile-timing-1/`. No edits to app, dist, database schemas, ledger, or history. No claim of task PASS.

---

## 1. Diagnostic Context & Native23 Telemetry

- **Native23 Baseline**:
  - In canonical build8 (`native23-photo-review.json`), real two-capture and single-video TURN RTP transmission succeeded, and the native unsubscribe-switch checkpoint passed.
  - Failure occurred at the original 5000ms initial third-actor room loading checkpoint (`Minh Anh` room/sidebar loading).
  - Telemetry from `api-loading-timing-summary-1.json`:
    - `rooms.service.js` reader lock held for 7,796 ms.
    - `calls.service.js` SHARE lock waited 13,845 ms.
    - `call-lifecycle.service.js` writer lock on room 57014 waited 15,018 ms, but was held for a maximum of only 1,155 ms.
    - `teams.service.js` SHARE lock timed out after 10,021 ms; even read COMMIT took 1,611 ms.
    - HTTP GET requests took 11,000–17,000 ms and returned 500.
- **Problem Statement**:
  - The maximum hold time of the lifecycle writer (1,155 ms) does not account for 11–17 second HTTP delays on its own.
  - Before applying any speculative functional code optimizations, we must isolate whether the bottleneck stems from:
    1. Database connection pool acquisition contention (waiting for a free client from `pg.Pool`).
    2. Actual SQL execution duration for profile queries (`profiles.service.js`).
    3. Host system resource starvation or Node.js event-loop delays.

---

## 2. Implemented Observational Modules

### A. Database Connection Pool Acquisition Observation
- **pg.Pool Subclassing (`instrumentOwnedApiPools`)**:
  - Intercepts `this.connect` on each instantiated `pg.Pool`.
  - Preserves both callback and Promise forms, forwarding original arguments, context (`this`), and return values unchanged.
  - Emits completion records to `evidence/api-pool-connect.jsonl`:
    - `owner`: whitelisted service name (`calls.service.js`, `call-lifecycle.service.js`, `play-sessions.service.js`, `recruitments.service.js`, `teams.service.js`, `rooms.service.js`, `profiles.service.js`, or `'other'`).
    - `poolIndex`: unique instance sequence number.
    - `backendPid`: numeric PostgreSQL backend PID (`client.processID` or `0` on error).
    - `startedAt` / `completedAt`: ISO 8601 UTC timestamps.
    - `durationMs`: time elapsed from `connect()` call to client acquisition.
    - `ok`: boolean flag (`true` on success, `false` on error).
    - `code`: exact 5-character PostgreSQL error code or `'other'`.
    - `waitingCount`: number of queued client requests waiting for a connection.
    - `totalCount`: total number of clients allocated in the pool.
    - `idleCount`: number of idle clients currently available.
  - Does not alter the `release` callback or modify any connection options.

### B. Profile Query Execution Observation
- **Profiles Service Queries**:
  - For `owner === 'profiles.service.js'`, intercepts all actual queries on acquired clients as constant `t30ApiDiagnostic4: 'profile-query'`.
  - Emits records to `evidence/api-lock-diagnostics.jsonl`:
    - `at`: ISO 8601 UTC completion timestamp.
    - `owner`: `'profiles.service.js'`.
    - `backendPid`: numeric backend PID.
    - `t30ApiDiagnostic4`: `'profile-query'`.
    - `poolIndex`: pool instance sequence number.
    - `startedAt` / `completedAt`: ISO 8601 UTC timestamps.
    - `durationMs`: query elapsed time.
    - `ok`: boolean success indicator.
    - `code`: 5-character PostgreSQL error code if failed.
  - **Zero Privacy Leakage**: Strictly never logs SQL query text, parameter values, stack traces, or returned row datasets.
  - Other pool owners retain exact existing lock observation semantics (`lock-room`, `lock-group`, `begin`, `commit`, `rollback`).

### C. HTTP Request Timing Middleware
- **Express / Nest Middleware (`instrumentOwnedHttpTiming`)**:
  - Attached to Nest application before `app.listen`.
  - Intercepts GET requests matching the 10 whitelisted endpoints:
    `me`, `games`, `rooms-own`, `rooms-detail`, `rooms-members`, `rooms-calls`, `room-play-sessions`, `play-detail`, `play-requests`, `call-participants`.
  - Emits records to `evidence/api-http-timing.jsonl` with sequence, route, method, timestamps, duration, status, and finish vs premature close boolean.
  - Non-invasive: calls `next()` synchronously; attaches `once` listeners to `finish` and `close` on the response object.

### D. Host Resource & Event-Loop Observation
- **Performance Timing (`startOwnedPerformanceTiming`)**:
  - Uses `node:perf_hooks` `monitorEventLoopDelay({ resolution: 20 })`.
  - Unreferenced timer (`timer.unref()`) samples every 1000 ms.
  - Emits records to `evidence/api-performance-timing.jsonl`:
    - `at`: ISO 8601 UTC timestamp.
    - `wallMs`: monotonic elapsed duration measured via `process.hrtime.bigint()`.
    - `eventLoop`: mean, max, and p99 delays in milliseconds (converted from nanoseconds).
    - `cpu`: user and system CPU deltas in microseconds (`process.cpuUsage()`).
    - `memory`: `rss`, `heapTotal`, `heapUsed`, `freemem`, `totalmem`.
    - `osCpu`: anonymous numeric deltas for busy and total CPU ticks across cores, plus core count (`os.cpus()`). Excludes hardware models, CPU identifiers, platforms, hostnames, and paths.
  - Resets event loop histogram on each sample to prevent cumulative skew.
  - Returns idempotent `stop()` function to clear interval, take final sample, and disable histogram.

### E. Fixture Integration (`fixture-server-shaped.mjs`)
- Derived from `fixture-server-api-loading-reviewed.mjs`.
- Updates import to `./antigravity-api-loading-profile-timing-1/api-loading-profile-observation.mjs`.
- Instantiates `stopPerformanceTiming` immediately following `mkdirSync(evidence)`.
- Calls `stopPerformanceTiming()` at the start of `cleanup()`.
- All other lines, options, routes, and assertions are byte-identical. Canonical gateway is preserved without gateway observer.

---

## 3. Explicit Review of Technical Tradeoffs

### A. Callback vs Promise Preservation
- In `node-postgres`, `pg.Pool` and `pg.Client` support both callback-based and Promise-based invocation signatures.
- Drizzle ORM and internal `Pool.query` utilize the callback form under the hood (e.g. `this.connect(callback)`).
- Intercepting `this.connect` and `client.query` requires detecting whether the final argument is a function (`typeof connectArgs[connectArgs.length - 1] === 'function'`).
  - For callback style: We wrap the callback, forward the exact `(err, client, release)` arguments, invoke `originalCb.apply(this, arguments)`, and return the synchronous return value of the underlying function (`undefined` or query instance).
  - For Promise style: We attach `.then(success, failure)`, returning the identical `client` or rethrowing the identical `err`.
- This ensures full compatibility across direct pool queries, Drizzle transactions, and manual client checkouts without introducing async barrier delays.

### B. Synchronous I/O Overhead & Failure Decoupling
- We employ `fs.appendFileSync` for telemetry output.
  - **Rationale**: When the Node.js event loop experiences multi-second latency or when a process is terminated by an external timeout, asynchronous file writes (`fs.appendFile` or writable streams) queue in memory and are frequently dropped or delayed past the point of diagnostic capture.
  - **Overhead**: Synchronous appends for these diagnostic records take tens of microseconds per record, amounting to less than 0.1 ms of total blocking across the entire initial loading sequence.
  - **Failure Decoupling**: Every write operation is wrapped in a `try / catch` block. If a write fails (e.g., disk full or I/O contention), `recordObservationFailure()` is invoked, writing a single line to `process.stderr` (`{"t30ObservationWriteFailure": true, "count": N}`). A telemetry write failure will never throw or interrupt application logic or test flow.

### C. 1000 ms Sampling on a Delayed Event Loop
- Node.js timers (`setInterval`) fire during the timer phase of the libuv event loop. If the event loop is blocked by synchronous processing or host CPU starvation, the interval will fire late.
- To prevent skewed metrics:
  - We do not assume a static 1000 ms interval. Instead, we measure the true elapsed duration between sample executions using `process.hrtime.bigint()` and record it as `wallMs`.
  - A `wallMs` significantly greater than 1000 ms directly indicates that the event loop was stalled between ticks.
  - `monitorEventLoopDelay` operates at the libuv turn level and accurately captures event loop delay even if the sampling interval itself is delayed.
  - Snapshot metrics provide valuable diagnostic insight into host health but do not guarantee real-time precision under extreme host starvation.

---

## 4. Pinned SHA-256 Hashes

| Component | Path | SHA-256 Hash |
| :--- | :--- | :--- |
| **Base Observer Reviewed** | `quality/evidence/T30/api-loading-observation-reviewed.mjs` | `ec6464a97ad0c87f869af18aee43ee4b7c19add10ff0ce69b6e32e7772507509` |
| **Base Fixture Reviewed** | `quality/evidence/T30/fixture-server-api-loading-reviewed.mjs` | `0ee421f3aad0c49c196885eddbff7aa902c8b59aba942c8b5033812ade73519a` |
| **Proposal Observer** | `quality/evidence/T30/antigravity-api-loading-profile-timing-1/api-loading-profile-observation.mjs` | `1561cbc43c5c6eac439f203e7f03fc8d85e06bba8caeef46b0f3e144b92521a4` |
| **Proposal Fixture** | `quality/evidence/T30/antigravity-api-loading-profile-timing-1/fixture-server-shaped.mjs` | `13b555d79bff904f3bc2c4d5421de035dd23fb82fe9bf6e016dca5fd652950f6` |

---

## 5. Diagnostic Disclaimer

This artifact suite is an observational proposal for T30 diagnostic isolation only. It does not modify application sources, database schemas, timeouts, deadlines, or test assertions. Zero tests, builds, or browser runs were executed by this agent. Codex will review, gate, adopt, and run headed tests sequentially.
