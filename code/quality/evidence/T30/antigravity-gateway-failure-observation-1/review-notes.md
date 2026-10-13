# FG T30 — Private Signaling Gateway Failure Observation Review Notes

**Directory**: `quality/evidence/T30/antigravity-gateway-failure-observation-1`  
**Agent**: Antigravity (Gemini 3.6 Flash High)  
**Policy**: T30 only, fixed Gemini 3.6 Flash (High), NO Anti2 (`NO-ANTI2-01`), no subagents. Proposal only.  
**Execution Boundary**: Zero test, build, or browser runs executed. Zero changes to application source, `apps/api/dist`, database schemas, test assertions, timeouts, task ledger, or session history. No functional fix or task PASS claimed.

---

## 1. Diagnostic Context & Native27 Telemetry

- **Native27 Run Baseline (`native27-photo-review.json`)**:
  - The built runtime preview run passed initial joins (7,274 ms, 4,055 ms, 9,275 ms) and completed the first native capture at 16,021 ms.
  - The test failed at the second original 45-second screen capture assertion.
  - Telemetry observed:
    - Client WebSocket disconnects with code 1006.
    - Subsequent reconnect attempts returning HTTP 503 / 502.
    - SFU participant removals and WebRTC DTLS timeouts.
- **Problem Statement**:
  - Prior baselines (build8, profile query batching, lock modes) were verified green, and runs native22/native23 demonstrated two real captures, track switches, and single-video TURN RTP transmission.
  - The exact failure mechanism within the private signaling gateway (whether pg pool acquisition exhaustion, upstream SFU handshake stalls, join message timeouts, or lease lock contention) cannot be determined without isolated, non-invasive stage and error observability.
  - **No Speculative Assumptions**: In accordance with project instructions, no assumptions regarding TTL, timeouts, database locks, or host resources are made prior to concrete observational measurement.

---

## 2. Implemented Observational Modules

### A. Observed Signaling Gateway (`signaling-gateway-observed.js`)
Derived from the exact compiled distribution file `apps/api/dist/modules/calls/signaling-gateway.js`.

1. **Safe Logging Subsystem (`logObservation`)**:
   - All emitted diagnostic records begin with the fixed constant prefix: `FG_T30_GATEWAY_OBSERVATION`.
   - Records are emitted as single-line JSON to `process.stdout`.
   - Wrapped in strict `try / catch` blocks with failover to `process.stderr` emitting a minimal `{ type: 'writeFailure', count: N }` marker. Logging failures will never throw or interrupt request handling.

2. **Strict Privacy & Error Taxonomy (`extractTaxonomy`)**:
   - **Zero Sensitive Data**: Strictly no logging of `error.message`, stack traces, raw error objects, SQL queries, parameters, authorization tokens, cookies, URLs, room IDs, lease IDs, client identities, or container IDs.
   - **Normalized Error Properties**:
     - `pgCode`: Exactly 5 alphanumeric characters matching `/^[0-9A-Z]{5}$/`, otherwise literal `'other'`.
     - `admissionStatus`: Numeric HTTP status if the error is an instance of `AdmissionDenied`, otherwise `0`.
     - `errorName`: Mapped strictly to an allowlist (`['Error', 'TypeError', 'RangeError', 'AdmissionDenied', 'AbortError', 'TimeoutError', 'AggregateError', 'DatabaseError']`), otherwise literal `'other'`.

3. **Targeted Failure Catch Points**:
   - **`scheduleDrain` Catch (Line 438)**:
     - Logged immediately before existing branches.
     - Emits `site: 'scheduleDrain'`, timestamps, error taxonomy, and `bindingClosed` boolean.
     - Original error handling (`closeBinding`, `invalidate`, `remove`) remains completely untouched.
   - **HTTP Handler Catch (Line 543)**:
     - Logged immediately before response writing.
     - Emits `site: 'httpHandler'`, timestamps, error taxonomy, and `headersSent` boolean.
     - Original status mapping and response closure remain completely untouched.
   - **WebSocket `upgrade` Pipeline (Lines 560–680)**:
     - Local variable `phase` tracked across the asynchronous upgrade lifecycle:
       - `'init'`: Initial request parsing and path validation.
       - `'readyPromise'`: Awaiting pool connection pre-warming.
       - `'authorize'`: Token verification and lease validation.
       - `'upstream-open'`: Establishing upstream WebSocket connection to SFU.
       - `'join'`: Awaiting initial SFU `join` signal response.
       - `'lockedLease'`: Final lease update and publication permission sync.
     - Outer catch emits `site: 'upgrade'`, exact last `phase`, elapsed `durationMs`, error taxonomy, and `socketDestroyed` boolean before closing the client socket.
     - Inner catch (upstream termination and participant removal) rethrows unchanged.

4. **Event Loop Delay & Process Resource Sampling**:
   - Integrated `node:perf_hooks` `monitorEventLoopDelay({ resolution: 20 })`.
   - Unreferenced 1,000 ms timer (`perfTimer.unref()`).
   - Emits records with `type: 'perf'`, monotonic elapsed `wallMs` (`process.hrtime.bigint()`), event loop delay percentiles (`meanMs`, `maxMs`, `p99Ms`), CPU deltas (`cpuUserUs`, `cpuSysUs`), and process memory (`rss`, `heapTotal`, `heapUsed`).
   - Histogram is reset every interval.
   - Stopped idempotently via `stopPerformanceTiming()` during `gateway.close()`.

### B. Docker Fixture Single-File Mount (`private-gateway-shaped-fixture.mjs`)
Derived from canonical `quality/evidence/T30/private-gateway-shaped-fixture.mjs`.

- Preserves all canonical container options, network creation, SFU configuration, port allocations, and cleanup procedures.
- Introduces a single read-only single-file Docker bind mount on the gateway container execution (Line 41):
  ```
  --mount type=bind,source=${path.resolve(root,'quality/evidence/T30/antigravity-gateway-failure-observation-1/signaling-gateway-observed.js')},target=/gateway/app/signaling-gateway.js,readonly
  ```
- This overlays `signaling-gateway-observed.js` onto `/gateway/app/signaling-gateway.js` inside the container without modifying the underlying `apps/api/dist` files or changing other modules in `/gateway/app`.
- All other mounts (`/gateway/node_modules`, `/gateway/input.json`) and runtime commands remain byte-identical.

---

## 3. Pinned Artifact & Base Hashes

| Component | Path | SHA-256 Hash |
| :--- | :--- | :--- |
| **Base Compiled Gateway** | `apps/api/dist/modules/calls/signaling-gateway.js` | `1f811f51373134c5914c757af5c26708ac0d7483d76f67ca76c25a9807554439` |
| **Base Fixture** | `quality/evidence/T30/private-gateway-shaped-fixture.mjs` | `d891dbd9f976a5ea39de29dc842ae9826f782a57efa10a656bf1822d28d3696f` |
| **Observed Gateway** | `quality/evidence/T30/antigravity-gateway-failure-observation-1/signaling-gateway-observed.js` | `604df1a28533e847fb22f7c5dd912f71e5f46e2381d27c5313fc0f3e122116b0` |
| **Observation Fixture** | `quality/evidence/T30/antigravity-gateway-failure-observation-1/private-gateway-shaped-fixture.mjs` | `2f6f6c456a749b114555bc7878f2228eba77e5f891dae23a396ddaa48fb3117e` |

---

## 4. Verification & Diagnostic Disclaimer

- Both files verified clean with `node --check` (exit code 0).
- This is a diagnostic observation proposal intended solely to identify error codes and failure stages.
- No tests, builds, or browser runs were executed by this agent.
- This proposal does not constitute or satisfy final native acceptance.
- Any subsequent functional fix will be submitted as a separate proposal after concrete diagnostic logs are obtained from sequential Codex execution.
