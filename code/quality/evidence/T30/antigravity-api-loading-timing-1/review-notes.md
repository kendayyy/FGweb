# FG T30 — API Loading Timing Observation Review Notes

**Directory**: `quality/evidence/T30/antigravity-api-loading-timing-1`  
**Agent**: Antigravity (Gemini 3.6 Flash High)  
**Policy**: T30 only, NO Anti2 (`NO-ANTI2-01`), no subagents. Observational proposal only.  
**Execution Boundary**: Zero tests, builds, or browser runs executed. No edits outside `quality/evidence/T30/antigravity-api-loading-timing-1/`. No claim of task PASS.

---

## 1. Diagnostic Context & Native22 Telemetry

- **Native22 Observation**:
  - In canonical build8 (`native22-photo-review.json`), real two-capture and single-video TURN RTP transmission succeeded, and the native unsubscribe-switch checkpoint passed.
  - Test failure occurred at the original 5000ms initial third actor room loading region (`Minh Anh` room/sidebar loading).
  - Inspecting responses showed HTTP 200 responses arriving around the failure timestamp, but status codes alone provide no request duration metrics or visibility into whether queries queued behind held database locks.
- **Objective**:
  - Implement non-invasive, purely observational instrumentation to log exact HTTP elapsed durations and correlate them with pg pool lock acquisitions during initial room loading, without changing runtime behavior, guards, deadlines, or application source.

---

## 2. Implemented Observation Modules

### A. `api-loading-observation.mjs`
- **Database Lock Observation (`instrumentOwnedApiPools`)**:
  - Preserves exact wrapper code, semantics, and pool owner whitelist from `api-lock-observation-9-reviewed.mjs`.
  - Added current UTC ISO string `at` and numeric `backendPid` (`client.processID`) to emitted lock records in `api-lock-diagnostics.jsonl`.
  - Zero SQL text, query parameters, stack traces, DSN strings, IDs, headers, cookies, or error messages logged.
  - Original query callback and Promise semantics remain completely untouched.
- **HTTP Timing Middleware (`instrumentOwnedHttpTiming`)**:
  - Attaches standard Express-compatible middleware to the Nest app before `await app.listen`. Calls `next()` exactly once.
  - Filters strictly for `GET` requests on whitelisted endpoints using strict regular expressions mapped to constant labels:
    1. `me`: `^/api/v1/me$`
    2. `games`: `^/api/v1/games$`
    3. `rooms-own`: `^/api/v1/rooms(?:/own)?$`
    4. `rooms-detail`: `^/api/v1/rooms/[^/]+$`
    5. `rooms-members`: `^/api/v1/rooms/[^/]+/members$`
    6. `rooms-calls`: `^/api/v1/rooms/[^/]+/calls$`
    7. `room-play-sessions`: `^/api/v1/rooms/[^/]+/play-sessions$`
    8. `play-detail`: `^/api/v1/play-sessions/[^/]+$`
    9. `play-requests`: `^/api/v1/play-sessions/[^/]+/requests$`
    10. `call-participants`: `^/api/v1/calls/[^/]+/participants$`
  - Emits records strictly with:
    - `sequence`: request sequence integer
    - `route`: constant route label from the whitelist
    - `method`: `'GET'`
    - `startedAt`: UTC ISO string
    - `completedAt`: UTC ISO string
    - `durationMs`: elapsed milliseconds (`completedMs - startedMs`)
    - `status`: numeric HTTP status code
    - `finished`: boolean (`true` on `finish`, `false` on premature `close`)
  - Uses `res.once('finish')` and `res.once('close')` with a single-emission guard (`emitted` flag).
  - Strictly zero mutation of request, response, headers, options, or payloads. No request bodies, identities, or raw URLs logged.

### B. `fixture-server-shaped.mjs`
- Starts from exact `antigravity-gateway-db-ready-1/fixture-server-shaped.mjs`.
- Imports `instrumentOwnedApiPools` and `instrumentOwnedHttpTiming` from `./antigravity-api-loading-timing-1/api-loading-observation.mjs` (matching T30 top-level destination layout).
- Invokes `instrumentOwnedApiPools(pg, evidence)` immediately after `evidence` directory creation, before any Pool creation.
- Invokes `instrumentOwnedHttpTiming(app, evidence)` after `NestFactory.create`, before webhook middleware and `app.listen`.
- Every other byte is identical to the canonical fixture. Canonical gateway import is preserved; gateway observer is NOT installed.

---

## 3. Explicit Review of Synchronous Logging & Failure Tradeoffs

- **Synchronous vs Asynchronous Logging**:
  - `fs.appendFileSync` is used to match the synchronous logging style of the existing observer. This prevents in-flight buffer loss or event-loop queuing delays during actor transitions or process exit.
- **Error Decoupling & Non-Interference**:
  - All file append operations are enclosed in `try { ... } catch {}`.
  - A file system write error (e.g. disk write failure) will never throw or interrupt normal HTTP routing, response streaming, or application exception handling.
- **Privacy & Secret Protection**:
  - Emitted JSON records contain only bounded numeric values, ISO timestamps, and constant route labels.
  - No authorization tokens, session cookies, user credentials, database connection strings, or full request paths are captured or emitted.

---

## 4. Pinned SHA-256 Hashes

| Component | Path | SHA-256 Hash |
| :--- | :--- | :--- |
| **Base Observer 9** | `quality/evidence/T30/api-lock-observation-9-reviewed.mjs` | `b1578d90fb8d8917002aef6d30529c368bc7a5c2ceb972f6674de1c21a074edb` |
| **Base Canonical Fixture** | `quality/evidence/T30/antigravity-gateway-db-ready-1/fixture-server-shaped.mjs` | `bfd4c5fe5131ea69b4240858e1249bdfe9663e7142b65ede609ee9951f06b3a2` |
| **Proposal Observer** | `quality/evidence/T30/antigravity-api-loading-timing-1/api-loading-observation.mjs` | `2cc01bfeffef362d2ddd641b999e778597b757449e80fd8fb991ba0e5d7146ad` |
| **Proposal Fixture** | `quality/evidence/T30/antigravity-api-loading-timing-1/fixture-server-shaped.mjs` | `4211e6aecfa3d7455b822108a9f92242fd21c5ce8e13fcb9879054a36a0fcf5b` |

---

## 5. Diagnostic Disclaimer

This is an observational proposal for T30 diagnosis only. It does not modify application sources, timeouts, deadlines, or test assertions. No build, test, or browser execution was performed. Codex will review, gate, and adopt before any headed native run.
