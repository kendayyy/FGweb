# FG T30 — Native and Gateway Signaling Path Analysis

## 1. Executive Summary & Scope

This analysis evaluates native screen share execution under FG T30. In Diagnostic38 (`t30-native-ec3334bbee4d4af8910e0abe2eb1d4fa`), three joins, two display captures, and initial relay video (22,812 bytes delta, `videoCount: 1`) succeeded; execution failed only at post-switch `receiveOne` (line 64:338) where `videoCount` was 0. In Canonical39 (`t30-native-89988dfad0c44f08a482935f4e1dcf73`), executed on the pristine fixture without observers, three joins and the first display share succeeded at 13,289 ms, but the second share failed at line 63:140 after 45,000 ms with the sender disconnected.

Actual logs reveal that the sender's signaling WebSocket terminated abruptly with code 1006, followed by gateway HTTP 503, 502, and 403 errors during reconnect. Prior diagnostic telemetry sampled CPU and PG pool metrics solely in the API child process. Consequently, gateway internal queues, PG pool contention, upstream SFU RPC latency, and frame processing durations remain unmeasured. This document establishes an empirical timeline, evaluates contention paths in existing source, separates facts from inferences, and outlines a non-intrusive preload wrapper to isolate the root cause before considering code changes.

---

## 2. Bounded Native & Gateway Timeline

The following timeline is derived strictly from validated logs across Native38 and Native39 (`native38-safe-metrics-summary1.json`, `native39-photo-review1.json`, `browser-errors.jsonl`, `media-diagnostics.txt`, `api-statuses.jsonl`). All event types, timestamps, and status codes follow whitelisted schemas:

| Timestamp (UTC) | Actor / System | Whitelisted Event Kind | Diagnostic Detail |
| :--- | :--- | :--- | :--- |
| `08:25:18.270Z` | Upstream SFU | `SERVICE_START` | LiveKit server 1.9.12 bound on ports 7880, 7881, 7882 |
| `08:25:18.286Z` | Upstream TURN | `SERVICE_START` | Embedded TURN relay bound on port 5349 |
| `08:25:38.293Z` | API Server | `HTTP_REST` | `GET /api/v1/me` -> 200 OK |
| `08:25:40.151Z` | API Server | `HTTP_REST` | `POST /api/v1/rooms/.../calls` -> 201 Created |
| `08:25:45.925Z` | Participant 1 | `CALL_JOIN` | Join completed (duration: 6,116 ms) |
| `08:25:45.756Z` | WebRTC Data | `WEBRTC_DATA` | Lossy data channel closed |
| `08:26:02.487Z` | Participant 2 | `CALL_JOIN` | Join completed (duration: 5,743 ms) |
| `08:26:17.343Z` | Participant 3 | `CALL_JOIN` | Join completed (duration: 6,128 ms) |
| `08:26:30.632Z` | Linh (Publisher) | `TRACK_PUBLISH` | Display capture 1 succeeded (duration: 13,289 ms) |
| `08:26:48.648Z` | Sender (Signal) | `WS_ABRUPT_CLOSE` | Stream terminated: WS code 1006 |
| `08:26:48.653Z` | Sender (WebRTC) | `WEBRTC_DATA` | Lossy publisher channel closed |
| `08:26:48.665Z` | Sender (WebRTC) | `WEBRTC_DATA` | Reliable publisher channel closed |
| `08:26:52.922Z` | Gateway / Sender | `WS_RECONNECT_FAIL` | Handshake rejected with HTTP 503 (`AdmissionDenied`) |
| `08:26:55.087Z` | Gateway / Sender | `WS_RECONNECT_FAIL` | Handshake rejected with HTTP 503 (`AdmissionDenied`) |
| `08:27:03.019Z` | Gateway / Sender | `WS_RECONNECT_FAIL` | Handshake rejected with HTTP 502 (`AdmissionDenied`) |
| `08:27:14.284Z` | Gateway / Sender | `WS_RECONNECT_FAIL` | Handshake rejected with HTTP 502 (`AdmissionDenied`) |
| `08:27:20.049Z` | Gateway / Sender | `WS_RECONNECT_FAIL` | Handshake rejected with HTTP 403 (`AdmissionDenied`) |
| `08:27:20.447Z` | Browser Client | `CLIENT_ERROR` | "Media admission denied" |
| `08:27:34.821Z` | Upstream SFU | `ICE_RECONNECT` | Participant ICE transport pair switch |
| `08:27:56.278Z` | Test Runner | `STEP_TIMEOUT` | Share button not visible after 45,000 ms |

---

## 3. Source Review: Gateway Contention and Failure Propagation

Analysis of `signaling-gateway.ts`, `lease-store.ts`, `gateway-main.ts`, and `media.ts` highlights the core lifecycle and error dynamics:

1. **Queueing and Batching** (`signaling-gateway.ts` lines 357–425):
   Signaling frames are queued in a per-binding buffer (`queueBytes <= 1 MB`, `queue.length <= 256`). Frames drain in FIFO batches of up to 8 items in `processBatch(binding, batch)`.
2. **Per-Frame Locking and Verification** (`signaling-gateway.ts` lines 360–393):
   Each batch executes inside a database transaction via `lockedLease(..., 'FOR SHARE')`. For **every frame** in the batch, `liveLeaseWithPolicy(db, binding.lease.id)` runs `fg_live_call_admission_policy_v1`. This verifies active membership, absence of revocation, 30s disconnection grace, session validity, game interests, and exclusion of ban actions.
3. **Abrupt Termination on Unhandled Error** (`signaling-gateway.ts` lines 408–418):
   If `processBatch` encounters an uncaught error (e.g. pool acquisition timeout, statement timeout at 3,000 ms, or transaction abort), `scheduleDrain.catch` invokes `closeBinding(binding)`:
   ```typescript
   binding.peer.terminate();
   binding.upstream.terminate();
   ```
   Invoking `terminate()` abruptly destroys TCP sockets without sending a WebSocket close frame (`1000 Normal`). The browser client observes this as `ConnectionError: WS closed unexpectedly with code 1006`.
4. **Cascading Reconnection Failures**:
   Upon `closeBinding`, `call_admissions.disconnected_at` is updated to `clock_timestamp()`. If the failure was `AdmissionDenied(403)`, `invalidate` marks `revoked_at`. Subsequent reconnect attempts fail predictably:
   - If the gateway PG pool is saturated, the upgrade handler returns **HTTP 503**.
   - If upstream SFU WebSocket handshake fails or exceeds 5,000 ms, the gateway returns **HTTP 502**.
   - Once the 30s grace window expires or `revoked_at` is set, `liveLease` returns undefined, returning **HTTP 403**.

---

## 4. Empirical Facts vs. Analytical Inferences

Maintaining diagnostic rigor requires strictly separating observed facts from hypotheses:

### Empirical Facts
- **Fact 1**: In Diagnostic38, display capture and first relay video succeeded (22,812 bytes delta, `videoCount: 1`). Failure occurred only post-switch at `receiveOne` line 64:338 (`videoCount: 0`).
- **Fact 2**: In Canonical39, the first display share completed at 13,289 ms. At `08:26:48.648Z`, the sender WebSocket closed unexpectedly with code 1006 during setup of the second display share.
- **Fact 3**: Reconnection attempts produced HTTP 503 (twice), HTTP 502 (twice), and HTTP 403 (once).
- **Fact 4**: The gateway uses `.terminate()` on any unhandled queue processing failure or policy rejection, directly generating client code 1006 errors.
- **Fact 5**: Telemetry in Diagnostic38 instrumented only the API child process. The gateway ran without queue depth, query duration, or RPC latency tracking.

### Analytical Inferences
- **Inference 1**: The code 1006 disconnect may stem from PG pool exhaustion (`Pool` size 16, timeout 2,000 ms) or statement timeout (3,000 ms) in `lockedLease` during burst signaling when the second track is announced.
- **Inference 2**: Upstream SFU signaling latency or backpressure may have delayed `native.updateParticipant`, filling the gateway queue (`queueBytes > 1 MB`).
- **Inference 3**: In Diagnostic38, `videoCount: 0` post-switch may have resulted from delayed client track attachment in `media.ts` or SFU subscription delay rather than complete packet loss.

Neither Inference 1 nor 2 is confirmed by existing logs. Source changes prior to collecting empirical gateway telemetry would be premature and unverified.

---

## 5. Architectural Invariants & Explicit Prohibitions

Any subsequent diagnostic implementation or eventual causal fix must strictly preserve all architectural and security invariants:

1. **Per-Frame Fresh Checks**: Every signaling frame must validate `liveLeaseWithPolicy` under shared canonical transaction locks (`FOR SHARE` on `rooms` and `call_groups`). Caching admission state across frames is forbidden.
2. **Security Semantics**: Preserves 30-second disconnection grace, immediate revocation handling, session boundaries, active membership constraints, and real-time ban enforcement.
3. **No Shadow Infrastructure**: Prohibits mounting SQL shadow gateways, altering PostgreSQL pool capacities (min: 16, max: 16), or lengthening connection/statement timeouts.
4. **Timing Claims Boundary**: Request interceptors cannot observe guard start latency (guards execute before interceptors). Timestamp subtraction between disparate network layers shall not be presented as proven execution delay.

---

## 6. Smallest Next Evidence Proposal: Gateway Entry-Point Preload Wrapper

Rather than modifying production application source, the smallest next evidence step is introducing an entry-point preload wrapper (`preload.cjs`) mounted into the gateway container at runtime.

### Minimal Hook Architecture
The fixture mounts `preload.cjs` and launches Node using `-r`:
```bash
node -r /gateway/preload.cjs /gateway/app/gateway-main.js /gateway/input.json
```
The wrapper injects lightweight, non-intrusive instrumentation around compiled modules:
1. **PG Pool Metrics**: Wraps `pg.Pool.prototype.connect` and `pg.Client.prototype.query` to capture:
   - Connection acquisition time (`acquireMs`), active clients, and waiting requests.
   - Query duration (`queryMs`) and safe classification (`liveLease`, `policy`, `lock`, `other`).
   - Zero query strings, parameters, values, or credentials recorded.
2. **Signaling Frame Queue Metrics**: Wraps WebSocket prototype `send` and message dispatch:
   - Records direction (`inbound`/`outbound`), protobuf message case name (e.g., `addTrack`, `join`), byte count, and queue residence duration.
3. **Upstream SFU RPC Latency**: Wraps `RoomServiceClient.prototype` methods (`updateParticipant`, `getParticipant`, `removeParticipant`) to measure duration and status code.
4. **Process Resource Metrics**: Emits 1 Hz snapshots of `process.cpuUsage()` and `monitorEventLoopDelay({ resolution: 20 })`.

---

## 7. Health, Cleanup, and Failure Verification Requirements

The proposed preload wrapper must satisfy rigorous operational safety gates:
- **Asynchronous Safe Writes**: Telemetry is buffered in memory and flushed via non-blocking streams. Write errors increment a failure counter and disable logging without disrupting gateway signaling.
- **Independent Teardown**: The wrapper registers exit hooks that flush remaining buffers within 500 ms upon `SIGTERM` or `SIGINT`, guaranteeing no lingering handles or container shutdown delays.
- **Fail-Safe Operation**: If the evidence directory is missing or read-only, the wrapper falls back to a no-op state without throwing exceptions.
- **Verification Gate**: The diagnostic suite must execute an isolated syntax and mock verification test confirming that simulated database timeouts or upstream errors are recorded without leaking sensitive payload data.
