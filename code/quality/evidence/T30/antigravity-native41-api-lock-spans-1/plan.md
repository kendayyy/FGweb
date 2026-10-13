# FG T30 — API Lock Spans & Native Awaited RPC Correlation Plan

## 1. Executive Summary & Diagnostic Context

In canonical headed run Native41, Linh's initial call region timed out after 5,000 ms at `screen-share.spec.ts:63:14` before completing her join or screen share capture. The final browser screenshot showed the call and play-session lists in an unresolved loading state, even though room membership was already rendered. Concurrently, the room owner's join required 6,686 ms.

While controlled tests demonstrated that `CallLifecycleService.reconcileGroup` holds canonical `FOR UPDATE` locks on `rooms` and `call_groups` while awaiting native LiveKit SDK calls (producing `SQLSTATE 57014` when concurrent `FOR SHARE` queries contend), this demonstrates structural lock behavior rather than an empirical proof of the exact bottleneck during live browser runs.

This proposal provides an isolated diagnostic observation layer within the API child process to correlate:
1. Service execution contexts (`CallLifecycleService.reconcileGroup`, `CallsService.list`, `CallsService.participants`, `CallsService.withControlGroup`).
2. Exact PostgreSQL backend PIDs and in-transaction lock acquisitions (`lock-room`, `lock-group`, `lock-member`).
3. Native LiveKit SDK awaited RPC spans (`listRooms`, `listParticipants`, `getParticipant`, `updateParticipant`, `removeParticipant`, `deleteRoom`).

---

## 2. Architecture of API-Child AsyncLocalStorage Correlation

### Context Propagation via `AsyncLocalStorage`
- **Context Creation:** Wraps service methods using:
  ```javascript
  als.run(ctx, () => Reflect.apply(origMethod, this, args))
  ```
  This returns the **exact** original promise, value, or synchronous error without an `async` function wrapper or replacement promise.
- **Monotonic Span Indices:** Every method execution receives an incrementing `spanIndex`. Nested service contexts capture `parentSpanIndex` without leaking domain metadata (no user, room, token, or admission IDs).
- **Backend PID Association:** When a PostgreSQL query runs under an active ALS context, `ctx.backendPid` is populated from `client.processID`, establishing a direct link between service logic and the PostgreSQL server connection.

### PostgreSQL Client & Pool Telemetry
- **Subclassing:** `PatchedPool extends OriginalPool` using `super(...args)`, preserving static properties and prototype chains.
- **Connection Event Tracking:** Uses the pool's `'connect'` event to track client instances via a `WeakMap`, avoiding any override of the `connect` method.
- **Promise & Callback Passthrough:**
  - Callback queries are passed directly to `origQuery.apply(this, args)`.
  - Promise queries attach side handlers via `result.then(() => {}, () => {})` that return `undefined` and never throw, returning the original `result` promise unmodified to callers.
- **Lock Classification & Hold Duration:**
  - Detects `begin`, `commit`, `rollback`, `lock-room` (FOR UPDATE/SHARE on `rooms`), `lock-group` (FOR UPDATE/SHARE on `call_groups`), and `lock-member` (FOR UPDATE/SHARE on `call_members`).
  - Measures lock hold duration from successful lock acquisition through `COMMIT` or `ROLLBACK`.
  - Never logs raw SQL, query parameters, row values, or database secrets. Only logs technical metadata (safe kinds, monotonic duration, backend PID, and safe 5-character SQLSTATE).

### LiveKit SDK RPC Instrumentation
- **Methods Observed:** `listRooms`, `listParticipants`, `getParticipant`, `updateParticipant`, `removeParticipant`, `deleteRoom`.
- **Identity Preservation:** Wrapped methods attach side handlers that return `undefined` without re-wrapping promises. Synchronous errors are caught, recorded, and re-thrown with identical error identity.
- **Safe Error Enum:** Captures standard Twirp error codes (e.g., `not_found`, `deadline_exceeded`), HTTP status codes (100–599), or `'other'`.

---

## 3. Buffer Management & Teardown Safety

- **Bounded Buffers:** Telemetry is buffered in memory up to 5,000 records or 1 MiB. Overflows increment `droppedCount` to signal incomplete observation rather than degrading API performance.
- **Explicit Stop:** The observer provides a synchronous/async `stop()` function that:
  - Cancels the 1 Hz metrics timer (`timerStopped = true`).
  - Disables the event loop histogram (`histogramDisabled = true`).
  - Flushes buffered records synchronously to disk (`api-lock-spans.jsonl`).
  - Emits a health summary (`api-lock-spans-health.json`).
- **Clean Teardown:** The instrumented fixture server incorporates `stop()` into its established `cleanup()` sequence alongside the reserved inspector client and Redis teardown.

---

## 4. Diagnostic Limitations & Scope Bounds

1. **API Child Process Context Only:**
   The metrics and ALS contexts capture behavior inside the API Node.js process. They do not monitor external Docker daemon CPU scheduling or LiveKit SFU internal thread state.
2. **Periodic Sampling Limits:**
   1 Hz process metrics provide directional insights into event loop lag and connection pool saturation, but cannot prove the absence of sub-millisecond transient contention.
3. **Observation Only:**
   This proposal adds telemetry to diagnose lock hold timing and RPC latency under real load. It does not alter service logic, move RPCs outside locks, change connection pools, or extend timeouts.
4. **No Acceptance Claim:**
   Diagnostic execution alone cannot be used to declare native acceptance or claim that the underlying UI timeout is resolved.

---

## 5. Artifacts Delivered

- [`api-lock-spans-observer.mjs`](file:///E:/FGweb/code/quality/evidence/T30/antigravity-native41-api-lock-spans-1/api-lock-spans-observer.mjs): ALS observer helper.
- [`fixture-server-native41-api-spans.mjs`](file:///E:/FGweb/code/quality/evidence/T30/antigravity-native41-api-lock-spans-1/fixture-server-native41-api-spans.mjs): Instrumented fixture server copy.
- [`probe-api-lock-spans-child.mjs`](file:///E:/FGweb/code/quality/evidence/T30/antigravity-native41-api-lock-spans-1/probe-api-lock-spans-child.mjs): Identity and safety probe script.
- [`run-api-lock-spans-controls.mjs`](file:///E:/FGweb/code/quality/evidence/T30/antigravity-native41-api-lock-spans-1/run-api-lock-spans-controls.mjs): Control runner for healthy and write-io verification.
- [`smoke-fixture-api-spans.mjs`](file:///E:/FGweb/code/quality/evidence/T30/antigravity-native41-api-lock-spans-1/smoke-fixture-api-spans.mjs): Proposed fixture server smoke test.
- [`plan.md`](file:///E:/FGweb/code/quality/evidence/T30/antigravity-native41-api-lock-spans-1/plan.md): Architectural specification and diagnostic bounds.

*Proposal ready for Codex review. No tests or builds have been executed in this turn.*
