# T30 Native37 Minimal Metrics Proposal Notes

## 1. Overview & Context
This proposal implements the minimal diagnostic-only observability harness agreed in `native37-analysis-codex-review-1.json` (`selectedNext`). It addresses unmeasured intervals identified during Native37 (where `games` completed in 3,422 ms, `rooms-own` in 5,767 ms, and `rooms-detail` in 5,553 ms) without modifying application code or altering runtime execution.

Two files are proposed in this directory:
1. `api-room-owner-observation-metrics.mjs`: Minimal non-intrusive pool, CPU, and event loop metrics helper.
2. `fixture-server-shaped.mjs`: Exact canonical fixture integrating the new metrics helper with independent cleanup.

---

## 2. Minimal Diagnostic Additions in `api-room-owner-observation-metrics.mjs`

### Safe Pool Owner Classification
- Added `'auth.service.js'` to `SAFE_OWNERS`. Stack traces from `AuthService` pool queries are now labeled rather than falling back to `'other'`.

### Successful Other-Query Spans ($\ge$ 100 ms)
- When a database query settles successfully with `kind === 'other'` and execution duration is $\ge 100\text{ ms}$, a span is appended to `api-other-query-spans.jsonl`.
- Recorded fields are strictly safe metadata: `startedAt`, `completedAt`, `durationMs`, `poolIndex`, `owner`, `backendPid`, and `ok: true`.
- **Privacy Guarantee**: No SQL text, parameters, query results, or private identifiers are recorded. Original query arguments, return values, and error identity remain untouched.

### Periodic API Child Process & Pool Snapshots (1 Hz)
- **Owned Pool Metrics**: Tracks instances created via `pg.Pool` within the API process. Snapshots `totalCount`, `idleCount`, `waitingCount`, `max` (`options.max`), and `ended` status.
- **Process CPU Delta**: Records child process user and system CPU deltas (`process.cpuUsage(lastUsage)`) alongside monotonic elapsed time (`performance.now()`). No host-wide or browser CPU claims are made.
- **Event Loop Delay**: Tracks Node.js event loop lag via `monitorEventLoopDelay({ resolution: 20 })`, recording `meanMs`, `maxMs`, and `p99Ms`.
- Output is appended once per second to `api-runtime-metrics.jsonl`.

### Lifecycle, Safe Error Handling & Health
- Explicit `startOwnedApiMetrics(evidence)` and `stopOwnedApiMetrics()` functions.
- Bounded observer lifespan: `stopOwnedApiMetrics` clears the interval timer and disables the event loop histogram.
- Every I/O error increments `observationFailures` and `metricsWriteFailures` without disrupting application logic.
- Writes `api-metrics-health.json`. Health reports `observationComplete: true` only if `metricsWriteFailures === 0` and `observationFailures === 0`; otherwise, `stopOwnedApiMetrics()` throws to invalidate observation completeness.

---

## 3. Integration in `fixture-server-shaped.mjs`

### Minimal Hook Placement
- Imports `startOwnedApiMetrics` from `./api-room-owner-observation-metrics.mjs`.
- Starts the sampler before child bootstrap:
  ```javascript
  stopApiMetrics = startOwnedApiMetrics(evidence);
  ```
- In `cleanup()`, stops the sampler independently:
  ```javascript
  if (stopApiMetrics) {
    await attempt('apiMetricsSampler', async () => { await stopApiMetrics(); });
  }
  ```

### Preserved Invariants & Independent Cleanup
- **Independent Teardown**: Failure to stop metrics or write health throws within `attempt('apiMetricsSampler')`, registering an error in `errors` while allowing all original cleanup operations (`pgWaitSampler`, `apiApp`, `webSockets`, `webServer`, `mediaContainers`, `redisQuit`, `inspectorRelease`, `inspectorSocketEndWait`, `dropSchema`, `poolEnd`, `cleanupReport`, `inspectorLifecycleReport`, `apiOwnerHealth`) to execute independently.
- **Zero Infiltration**: No overrides to `pool.connect`, no NestJS interceptors or guards, no HTTP payload logging, and no gateway mount modifications.
- Retains original inspector reservation, timer cleanup, and PostgreSQL wait sampling untouched.

---

## 4. Status & Limitations
- This proposal is purely diagnostic. It does not alter application query semantics, connection pool capacities, deadlines, or caches.
- No claim of timing remediation, root cause closure, or test PASS is made.
