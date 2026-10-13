# FG T30 — Private Gateway Observer Preload Proposal

## 1. Overview & Architectural Boundaries

This proposal establishes non-intrusive diagnostic observability for the private media admission signaling gateway without altering compiled application code, schema constraints, or timing invariants. In previous runs, telemetry instrumented only the API child process; gateway process CPU, internal frame queues, PostgreSQL pool contention, and upstream SFU RPC latency remained unmeasured.

The proposed helper (`gateway-observer-preload.cjs`) is mounted directly into the private gateway container and activated via Node's `-r` preload flag:
```bash
node -r /gateway/preload.cjs /gateway/app/gateway-main.js /gateway/input.json
```
The mount targets the eventual reviewed path (`quality/evidence/T30/gateway-observer-preload-reviewed1.cjs`). The compiled `@fg/api` modules, `node_modules`, and configuration mounts remain byte-for-byte identical.

---

## 2. Observer Preload Implementation (`gateway-observer-preload.cjs`)

The observer strictly adheres to safe, redacted instrumentation:

1. **PostgreSQL Instrumentation (No `pool.connect` Override)**:
   - Tracks `pg.Pool` constructor instances to snapshot pool metrics (`totalCount`, `idleCount`, `waitingCount`, `max`, `ended`).
   - Wraps `pg.Client.prototype.query` for both Promise and callback forms, preserving `this`, arguments, return types, and synchronous throw identity.
   - Categorizes queries into safe string enums: `begin`, `commit`, `rollback`, `room-lock`, `group-lock`, `live-lease`, `policy`, `other`.
   - Records execution duration, backend PID, boolean success, and 5-character SQLSTATE (`/^[0-9A-Z]{5}$/`). Zero SQL text, arguments, row data, or credentials are captured.
2. **WebSocket Pass-Through & Frame Classification**:
   - Intercepts `WebSocket.prototype.send` and `emit('message')`.
   - Associates metadata (`socketIndex`, role: `'server-peer'` vs `'native-upstream'`, sequence) via a `WeakMap`. No raw frames or payload bodies are retained.
   - Decodes protobuf cases (`SignalRequest` / `SignalResponse`) to capture message enum names (e.g. `addTrack`, `trackPublished`, `join`) and payload byte lengths. Protocol decode failures are diagnostic only and never interrupt frame delivery.
3. **RoomServiceClient RPC Passthrough**:
   - Instruments `updateParticipant`, `getParticipant`, and `removeParticipant` on `RoomServiceClient.prototype`.
   - Measures duration and records boolean outcome alongside sanitized error codes (`/^[0-9A-Z_]{1,32}$/`). Preserves exact Promise and error identity.
4. **Process Resource Sampling (1 Hz)**:
   - Samples delta CPU usage via `process.cpuUsage()` and event loop delay via `monitorEventLoopDelay({ resolution: 20 })`.
5. **Bounded Buffer & Synchronous Flushes**:
   - Buffers records up to 5,000 items or 1 MB. Overflow increments `droppedCount`, marking observation incomplete.
   - Flushes once per second synchronously to stdout (fd 1) prefixed with `[FG_GATEWAY_OBSERVER]`.

---

## 3. Explicit `SIGUSR2` Lifecycle & Health Contract

- The gateway process registers a dedicated `SIGUSR2` listener without modifying `SIGTERM` or `SIGINT` handling.
- On `SIGUSR2`:
  - Stops the sampling timer (`timerStopped: true`).
  - Disables the event loop histogram (`histogramDisabled: true`).
  - Flushes remaining buffered telemetry.
  - Emits a final health line:
    ```
    [FG_GATEWAY_HEALTH] {"sampleCount":N,"failureCount":0,"droppedCount":0,"timerStopped":true,"histogramDisabled":true,"observationComplete":true}
    ```
- `observationComplete` is strictly `true` only if `sampleCount > 0`, `failureCount === 0`, and `droppedCount === 0`. Duplicate starts are blocked.

---

## 4. Fixture Integration & Independent Teardown

1. **`private-gateway-shaped-fixture.mjs`**:
   - Mounts the reviewed preload helper at `/gateway/preload.cjs` and adds `-r /gateway/preload.cjs` to container launch args.
   - Exposes `stopGatewayObservation()`: sends `docker kill --signal SIGUSR2` to the gateway container, reads logs, extracts `[FG_GATEWAY_HEALTH]`, and asserts complete observation (`failureCount === 0`, `droppedCount === 0`).
2. **`fixture-server-shaped.mjs`**:
   - In `cleanup()`, calls `stopGatewayObservation()` BEFORE `mediaDiagnostics` and container teardown.
   - Writes `gateway-observation-health.json` using immutable creation (`{ flag: 'wx' }`).
   - If stop fails, records safe failure and propagates the error, while still executing all subsequent cleanups (`mediaDiagnostics`, `mediaContainers`, `redisQuit`, `inspectorRelease`, `dropSchema`, `poolEnd`, `cleanupReport`).

---

## 5. Codex Review & Verification Gates

Before adoption, Codex will conduct:
1. Syntax checks across all proposal files.
2. Controlled unit verification of PG query passthrough, WS frame emission, and RPC timing.
3. Smoke verification of clean container shutdown and independent cleanup on observer failure.
4. No source changes, test runs, or native PASS claims are made in this proposal.
