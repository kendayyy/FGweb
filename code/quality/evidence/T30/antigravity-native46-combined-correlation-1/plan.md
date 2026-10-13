# FG T30 Followup Native46 Diagnostic Proposal: Synchronized Gateway & API Correlation (Proposal 1)

## 1. Context & Native46 Failure Review

The canonical Native46 run (`quality/evidence/T30/native46-photo-timing-review1.json`) executed with the canonical observer-free fixture, build12, source lifecycle GREEN7, and call/publishing GREEN66 (all 73 current cases intact).

### Same-Run Observed Sequence:
1. **Initial Joins (All 3 Succeeded)**:
   - Owner join: 5,644 ms (`12:32:51.789Z`)
   - Linh join: 4,766 ms (`12:33:05.689Z`)
   - MinhAnh join: 6,959 ms (`12:33:22.072Z`)
2. **First Publication & Capture (Succeeded)**:
   - First publisher screen capture: 19,934 ms (`12:33:42.021Z`)
3. **Second Screen Share Failure**:
   - Timed out on the second publisher's stop-share button at line 63:140 after 45,000 ms.
4. **Observed Error Progression**:
   - `12:33:31.486Z`: First WebSocket closure with code `signalClosed1006: true`.
   - `12:33:38.960Z`: Subsequent HTTP/WebSocket `502 Bad Gateway` error.
   - `12:33:49.535Z`: Second `502 Bad Gateway` error.
   - `12:33:53.699Z`: Second WebSocket closure with `signalClosed1006: true`.
   - Additional `502 Bad Gateway` errors recorded up to `12:34:25.247Z`.
5. **Host Hardware State**:
   - Host CPU busy mean: 91.66%
   - Host minimum free RAM: 677,216,256 bytes (~677 MB)
   - *Constraint*: Host saturation is an observed correlation only; this proposal makes **NO claim of a hardware-only cause, NO app fix, and NO native PASS claim**.

---

## 2. Core Problem & Diagnostic Missing Link

In previous isolated investigations:
- **Gateway Telemetry (Native40)**: Observed `lockedLease` executing `SELECT id FROM rooms WHERE id=$1 FOR SHARE` encountering SQLSTATE `57014` (`query_canceled` via `statement_timeout = 15000ms`).
- **API Spans (API43)**: Successfully captured compiled CJS `RoomServiceClient` native RPCs within real PostgreSQL transactions and identified transaction backend PIDs.
- **The Gap**: In Native46, the canonical observer-free fixture was used. As a result, gateway SQL queries, backend PIDs, SQLSTATEs, and API transaction lock holds were **not observed simultaneously in the same run**.

Without same-run synchronized telemetry, it is impossible to distinguish four fundamentally different failure modes:
1. **DB Fail-Closed (Lock Contention / Statement Timeout)**:
   - The gateway's `lockedLease` transaction (PID `P_gw`) requests `FOR SHARE` locks on `rooms`/`call_groups` while an API transaction (PID `P_api`) holds an exclusive lock (e.g., during `reconcileGroup`, `withControlGroup`, or member leave).
   - If `P_gw` blocks until `statement_timeout` (15,000 ms), PostgreSQL cancels the query (`57014`).
   - The gateway error handler triggers `closeBinding()`, closes the WebSocket (producing client `1006`), and calls `native.removeParticipant()`.
2. **Policy Denied**:
   - `lockedLease` succeeds promptly, but `liveLeaseWithPolicy` returns no valid screen slot or `LIMIT_EXCEEDED` is sent to the client.
3. **Native Network / Queue Pressure**:
   - Database locks succeed promptly, but upstream LiveKit SFU RPC or WebRTC signaling stalls, causing gateway buffer queues to exceed bounds (`queueBytes > 1048576`).
4. **Teardown 502 Artifact**:
   - The primary failure is the initial WebSocket closure at `12:33:31Z`. Subsequent `502` errors are merely secondary symptoms of downstream teardown / process exit. **A cause must never be inferred from later teardown 502s**.

---

## 3. Exact Hash Compatibility

All source, compiled, and reviewed artifacts have been verified with exact SHA-256 hashes:

| Component | Path | SHA-256 Hash |
|---|---|---|
| **Gateway Source** | `apps/api/src/modules/calls/gateway-main.ts` | `AC4B80EDA655FDF291A757D6CC9EC5F57E3184B987FE6F0FC7FDC8C040825ECF` |
| **Gateway Logic Source** | `apps/api/src/modules/calls/signaling-gateway.ts` | `A51FDE9F7BF3A632AC06ECF510449404451FA44A77A5500C27FE6759EDF58D41` |
| **Compiled Gateway** | `apps/api/dist/modules/calls/gateway-main.js` | `E0A44649044B3CFE3D040B3D74A409BBC3EB877E7ADC96195E91637AA114A4AD` |
| **Compiled Logic** | `apps/api/dist/modules/calls/signaling-gateway.js` | `FFB898AFE1826A1D79344E7A44DF990AC55DFB7ED335E1B9253097ADD522548E` |
| **Canonical Fixture** | `quality/evidence/T30/private-gateway-shaped-fixture.mjs` | `A3439CC574A01D800C5A5A1B36D78B7357BC29C7962765D43F99239B07808A39` |
| **Reviewed Gateway Observer** | `quality/evidence/T30/private-gateway-observer-reviewed2.mjs` | `26D6312881B65A66D7FBD87B3AA4C7D6B0B1D4833320957DC002AE876AC12151` |
| **Reviewed Gateway Preload** | `quality/evidence/T30/gateway-observer-preload-reviewed2.cjs` | `3DAFAB5F83009E77DF88B7AE6DD4229E6BCE657CA2A243CF7A3AE1EC23AB3729` |
| **Reviewed API43 Fixture** | `quality/evidence/T30/fixture-server-api43-reviewed1.mjs` | `8071D86A9DCF55FEBAEABD305685E02FC680D1F78A11339626B79B86FE4B695C` |
| **Reviewed API43 Observer** | `quality/evidence/T30/api43-observer-reviewed1.mjs` | `12AC554570CC268D1BE885CCBE1CB193A2C08333C9E6BBACE649141B4D2C9EAD` |
| **Reviewed PG Wait Observer** | `quality/evidence/T30/pg-wait-observation-reviewed2.mjs` | `EDE28371C103B7F9EC3996D35151CF56266CA0A9C9256BB827DC66D752C699A6` |

---

## 4. Analysis of Existing Helpers & Identified Gaps

### 4.1 Gateway Observer Preload (`gateway-observer-preload-reviewed2.cjs`)
- Already validated via `probe-native40-gateway-observer-child2.cjs`:
  - `pg.Pool` patched via subclass `PatchedPool extends OrigPool` using `super(...args)` and `on('connect')` WeakMap mapping (no `connect()` override).
  - Exact callback/submittable passthrough on `pg.Client.prototype.query`.
  - Non-intrusive side Promise `.then(..., ...)` handlers returning `undefined` (never throw).
  - Whitelisted safe metadata: ISO start/complete, monotonic `durationMs`, `poolIndex`, `backendPid`, 5-char `sqlState`.
  - Zero raw SQL, query parameters, row contents, or authentication tokens emitted.

### 4.2 Identified Honest Gap in `private-gateway-observer-reviewed2.mjs`
- While `stopGatewayObservation()` successfully sent SIGUSR2 and checked `[FG_GATEWAY_HEALTH]`, it did **not** extract and persist the raw `[FG_GATEWAY_OBSERVER]` log lines to disk before container removal.
- **Minimal Correction**:
  - `private-gateway-observer-combined-reviewed1.mjs` accepts an optional `targetEvidenceDir`.
  - On SIGUSR2 completion, it parses and filters `[FG_GATEWAY_OBSERVER]` lines, verifies that all records conform to the safe metadata whitelist, and writes:
    - `gateway-lock-spans.jsonl`
    - `gateway-observer-stop-status.json` with `{ flag: 'wx' }`.

### 4.3 Identified Honest Gap in `fixture-server-api43-reviewed1.mjs`
- `fixture-server-api43-reviewed1.mjs` imported `private-gateway-shaped-fixture.mjs` (uninstrumented) instead of the gateway observer fixture, leaving the gateway container unobserved.
- **Minimal Correction**:
  - `fixture-server-combined-reviewed1.mjs` imports `private-gateway-observer-combined-reviewed1.mjs`.
  - In `cleanup()`, it calls `fixture.stopGatewayObservation(evidence)` to record gateway health and spans prior to `fixture.close()`.
  - Preserves all API43 hooks byte-exact: `instrumentOwnedApiPools`, `instrumentRoomServiceClient` (with dual CJS/ESM constructor binding), `startApiLockSpansObserver`, and `startOwnedPgWaitObservation`.

---

## 5. Delivered Diagnostic Artifacts

All files are delivered strictly under [`quality/evidence/T30/antigravity-native46-combined-correlation-1/`](file:///E:/FGweb/code/quality/evidence/T30/antigravity-native46-combined-correlation-1/):

1. [`private-gateway-observer-combined-reviewed1.mjs`](file:///E:/FGweb/code/quality/evidence/T30/antigravity-native46-combined-correlation-1/private-gateway-observer-combined-reviewed1.mjs): Enhanced gateway observer fixture that extracts sanitized gateway query, RPC, WS, and metric spans and writes `gateway-lock-spans.jsonl` and `gateway-observer-stop-status.json`.
2. [`fixture-server-combined-reviewed1.mjs`](file:///E:/FGweb/code/quality/evidence/T30/antigravity-native46-combined-correlation-1/fixture-server-combined-reviewed1.mjs): Combined fixture server integrating API lock spans, PG wait observation, and gateway observer telemetry with coordinated shutdown across all 5 independent resources.
3. [`probe-combined-fixture1-normal.mjs`](file:///E:/FGweb/code/quality/evidence/T30/antigravity-native46-combined-correlation-1/probe-combined-fixture1-normal.mjs): Regression probe executing normal startup and API operations, asserting that compiled CJS lifecycle RPCs bind to successful PG transactions, and verifying that gateway observer telemetry is fully persisted.
4. [`probe-combined-fixture1-fault.mjs`](file:///E:/FGweb/code/quality/evidence/T30/antigravity-native46-combined-correlation-1/probe-combined-fixture1-fault.mjs): Fault probe verifying that observation failures are properly surfaced (exit 1) and all resources are completely torn down.
5. [`run-combined-controls1.mjs`](file:///E:/FGweb/code/quality/evidence/T30/antigravity-native46-combined-correlation-1/run-combined-controls1.mjs): Control runner prepared for review (not executed).

---

## 6. Strict Scope Boundaries & Invariants

1. **No Code/App Mutations**: Zero changes to application source code (`apps/api/src/modules/calls/*`).
2. **No Unsafe Diagnostic Workarounds**:
   - Native LiveKit calls are **NOT** moved outside database transactions.
   - No permission or lease caching is introduced.
   - No database soft-fails or ignored errors.
   - No alterations to timeouts (statement timeout remains 15,000 ms, startup deadline remains 110s, request timeout 15s).
3. **No Execution of Native Runs**: Neither Docker containers nor test suites are executed in this turn.
4. **Diagnostic Goal**: Provide Codex with the verified, minimal combination of existing reviewed helpers to definitively determine whether the second screenshare stop-share timeout is caused by DB lock contention (`57014`), permission denial, or network pressure.
