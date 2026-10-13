# T30 CallLifecycleService Ordinary Reconcile Coalescing — Correction 1 Plan

## 1. Overview & Constraints

- **Task**: T30
- **Model**: Fixed Gemini 3.6 Flash (High), Sequential proposals only, NO Anti2.
- **Agent Scope**: Proposal-only under `quality/evidence/T30/antigravity-lifecycle-coalescing-correction-1/**`.
- **Prohibitions**:
  - ZERO executions of `run_command`, Docker, or browser.
  - ZERO mutations to application source (`apps/api/src`), build outputs (`apps/api/dist`), tests, fixtures, ledger (`quality/tasks.json`), or `.doc/history.md`.
  - Strictly maintain `nativeAcceptance: false`. Root reviews and runs all validations.

---

## 2. Review Findings & Corrections

This proposal resolves all seven findings identified by root review of the previous submission:

| Review Finding | Root Finding Details | Implementation Correction in Correction 1 |
|---|---|---|
| **C1: Shutdown Drain** | `while(!this.closing && ...)` in `runGroup` cancelled already accepted ordinary/ended jobs upon `onModuleDestroy`. | Removed `!this.closing` from the `runGroup` worker loop. Workers now drain all accepted jobs to completion. New incoming requests are rejected with `HttpException(503)` if `this.closing === true`. `onModuleDestroy` awaits `this.running` (active sweep) AND all worker jobs in `this.inFlight` before closing `this.pool.end()`. Distinct ended events all execute canonical `reconcilePass` once each with no lost ack. |
| **C2: Settled Promise Cleanup** | `job.finally(() => cleanup)` created an unhandled rejection derivative error when callers awaited their deferred promises. | Track in-flight promises with settled handlers: `job.then(() => this.inFlight.delete(job), () => this.inFlight.delete(job))`. Callers awaiting `deferred.promise` receive the exact error, while internal state cleans up without triggering unhandled rejection warnings. |
| **C3: Private Visibility** | `reconcileGroup` was previously widened to public or package-private. | `reconcileGroup` strictly retains `private` visibility matching the canonical source interface. |
| **C4: Byte-Exact Body** | `reconcilePass` must preserve original `reconcileGroup` lines 74–104 body byte-for-byte. | The body of `reconcilePass` is byte-for-byte identical to original lines 74–104. Verified programmatically by `prepare-coalescing-proposal.mjs` against canonical source pin. Exactly three counted insertion points are used. |
| **C5: Comments & CRLF** | Original comments must be preserved and CRLF/LF line endings respected. | All existing comments and docstrings in `call-lifecycle.service.ts` are preserved. `prepare-coalescing-proposal.mjs` dynamically detects and handles line endings. |
| **C6: Deterministic Barriers** | Heuristic `sleep` delays in the test harness failed to reliably synchronize burst arrivals and trailing transitions. | Replaced all heuristic sleeps in `lifecycle-coalescing-support-reviewed1.mjs` with deterministic promise-based gates (`enteredPromise` / `gatePromise` and `trailingEnteredPromise` / `trailingGatePromise`). Triggers are held inside `listRooms` while burst callers queue up. |
| **C7: ALS, Fault Identity, Safe Drain** | Test harness lacked ALS call isolation, error identity matching, and safe pool drain verification. | Used `AsyncLocalStorage` to isolate test-driven calls from unrelated background sweeps or webhooks. Injected synthetic faults assert caller rejection with the exact same error object instance (`assert.equal(err, syntheticFault)`). Intercepted `pool.end` safely during shutdown tests so the database connection remains open for test cleanup and state inspection. |

---

## 3. Source Pins & Anchors

### Source Pins
- **Original TypeScript**: `apps/api/src/modules/calls/call-lifecycle.service.ts`  
  - SHA256: `425de19a1f3c14f9da6c17e2fd6781f8d5bca310a80566d6311e370d8682a865`
- **Compiled JavaScript**: `apps/api/dist/modules/calls/call-lifecycle.service.js`  
  - SHA256: `7440b21cf469f64fbc188525d6deda2401b74e7a3f5942e082a3971b69972260`

### Counted Insertion Anchors
1. **Anchor 1: Types & State (Lines 11–32 & 43–44)**:
   - Added `Deferred<T>`, `GroupRunner`, `coalescers` map, and `inFlight` promise set.
2. **Anchor 2: Coalescing Dispatcher & Drain Worker (Lines 57–134)**:
   - `reconcileGroup(id: string, ended?: ...)`: Queues incoming requests; rejects with 503 if closing.
   - `runGroup(id: string, runner: GroupRunner)`: Drains all accepted ended jobs individually and coalesces pending ordinary requests into trailing passes.
   - `reconcilePass(id: string, ended?: ...)`: Contains the byte-exact original body of `reconcileGroup` (lines 74–104).
3. **Anchor 3: Shutdown Drain (`onModuleDestroy`, Lines 51–56)**:
   - Sets `closing = true`, clears interval, unbinds callback, awaits `this.running` and `Promise.all(Array.from(this.inFlight))`, then calls `this.pool.end()`.

---

## 4. Regression Controls Specification

The standalone test harness `lifecycle-coalescing-support-reviewed1.mjs` implements seven deterministic controls:

1. **Control 1: Ordinary Burst Bounded**:
   - Four concurrent `reconcileGroup` calls for the same `callGroupId1`.
   - Pass 1 held at deterministic gate; triggers 2–4 arrive while pass 1 is in-flight.
   - **Assertion**: Native `listRooms` calls $\le 2$ (Pass 1 + Trailing Pass 2).
2. **Control 2: Different Groups Independent**:
   - Calls for `callGroupId1` and `callGroupId2` execute in parallel.
   - **Assertion**: Native `listRooms` calls $\ge 2$ (no cross-group suppression).
3. **Control 3: Trigger During Trailing Pass (No Lost Wakeup)**:
   - Trigger 1 enters Pass 1. Trigger 2 queues up. Pass 1 finishes.
   - Trailing Pass 2 starts and hits deterministic trailing gate.
   - Trigger 3 arrives while Trailing Pass 2 is held.
   - Trailing Pass 2 released. Trailing Pass 3 runs.
   - **Assertion**: Native `listRooms` calls $\ge 3$. All three callers resolve.
4. **Control 4: Distinct Ended Events Processed Individually**:
   - Two concurrent calls with distinct `{identity, at}` payloads.
   - **Assertion**: Native `listRooms` calls $\ge 2$. Each ended event executes its own canonical pass without batching or lost acks.
5. **Control 5: Exact Injected Native Error Object Preserved & Recovery**:
   - Native `listRooms` throws `syntheticFault = new Error(...)`.
   - **Assertion**: All callers reject with `err === syntheticFault`. Next non-faulted call succeeds cleanly.
6. **Control 6: Shutdown Drain & 503 Rejection**:
   - Job 1 enters Pass 1 and is held at barrier.
   - Job 2 (ordinary) and Job 3 (ended) arrive.
   - `service.onModuleDestroy()` invoked.
   - New incoming request rejected with `HttpException(503)`.
   - Barrier released: Job 1, Job 2, Job 3 all complete successfully before `pool.end()`.
7. **Control 7: Signed Duplicate Webhook Idempotency**:
   - Duplicate raw webhook payloads sent to `service.receive(...)`.
   - **Assertion**: First succeeds; second returns `duplicate: true`.

---

## 5. Root Execution & Application Instructions

When root reviews this proposal:
1. Verify source pin and exact body match using:
   ```bash
   node quality/evidence/T30/antigravity-lifecycle-coalescing-correction-1/prepare-coalescing-proposal.mjs
   ```
2. Copy `call-lifecycle.service.ts` to `apps/api/src/modules/calls/call-lifecycle.service.ts`.
3. Build the backend:
   ```bash
   npm run build --workspace=@fg/api
   ```
4. Copy `lifecycle-coalescing-support-reviewed1.mjs` to root fixture location and execute the regression runner under the existing root IPC harness.
5. Zero modifications have been applied to product source or history during this proposal.
