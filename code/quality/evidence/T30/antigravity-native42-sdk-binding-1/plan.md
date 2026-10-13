# FG T30 — Diagnostic Plan: Observer3 ESM + CJS SDK Binding & Coverage Gap Resolution

## 1. Actual42 Execution Findings & Context

The Native42 automated headed run (`codex-headed-t30-native-42.txt`) completed 3 joins, 2 screen-share captures, and RTP track switching. However, the third publisher ("Minh Anh") failed the initial 5,000ms locator timeout waiting for the viewer room region.

Key telemetry and timeline observations from `native42-photo-timing-review2.json`:
- **Bootstrap Timing**: Initial authentication `/api/v1/me` took 3,859.26ms, followed by `/games` (3,239.93ms), `/rooms/:id` detail (3,934.14ms), and `/rooms/own` (4,135.29ms). Room detail finished after the failure image had already been taken.
- **Database Lock Contention**: PostgreSQL sampling during the bootstrap window recorded scoped lock chains (`Lock:transactionid: 17`, `Lock:tuple: 21`, `LWLock:WALWrite: 8`).
- **Event Loop Spike**: The maximum recorded event loop delay (6,215.96ms) occurred during initial server bootstrap at 11:25:23Z, NOT during the bootstrap failure window at 11:26:56Z+. The failure cannot be attributed to observer sync I/O.
- **Zero In-Transaction RPCs (`rpcUnderTransactionCount: 0`)**: The observer recorded 0 RPC operations under active database transactions despite intensive admission and group reconciliation activity.

---

## 2. Root Cause Analysis: The ESM vs. CJS Loader Divergence

The diagnostic probe documented in `api43-sdk-loader-result1.json` confirmed:
- `esmSameAsCompiledCalls: false`
- `compiledCallsSameAsLifecycle: true`
- `esmPrototypeSameAsCompiledCalls: false`

### Mechanism
1. `fixture-server-api42-reviewed2.mjs` imported LiveKit using ES module syntax:
   ```javascript
   import { RoomServiceClient } from 'livekit-server-sdk';
   ...
   instrumentRoomServiceClient(RoomServiceClient, evidence);
   ```
   This wrapped only the prototype of the ESM constructor.
2. The compiled Nest application services (`CallsService` and `CallLifecycleService` in `apps/api/dist/modules/calls/`) are CommonJS modules. They execute:
   ```javascript
   const livekit_server_sdk_1 = require("livekit-server-sdk");
   ...
   new livekit_server_sdk_1.RoomServiceClient(...)
   ```
3. In Node.js, `import 'livekit-server-sdk'` and `require('livekit-server-sdk')` resolve to separate module instances with distinct prototype objects.
4. Because the CJS `RoomServiceClient.prototype` remained un-instrumented, all RPC calls initiated by `CallsService` under database transactions bypassed the observer entirely.
5. Consequently, `rpcUnderTransactionCount: 0` was an **instrumentation coverage gap**, NOT an absence of RPC calls under transaction.

---

## 3. Minimal Observer3 Design

To close this coverage gap without mutating application source files or breaking existing controls, `api-lock-spans-observer3.mjs` introduces:

1. **Flexible Constructor Ingestion**:
   `instrumentRoomServiceClient(targets, evidence)` accepts either a single constructor (retaining 100% backward compatibility with core controls) or an array/iterable of constructors (`[EsmRoomServiceClient, CjsRoomServiceClient]`).
2. **Pre-Validation and Identity Deduplication**:
   - Iterates through candidate constructors before mutating any prototype.
   - Validates that each candidate is a valid function, possesses an object prototype, and defines all 6 expected RPC methods (`listRooms`, `listParticipants`, `getParticipant`, `updateParticipant`, `removeParticipant`, `deleteRoom`).
   - Deduplicates constructors by reference and prototype identity using `Set`.
   - If validation fails or if `instrumentRoomServiceClient` is called more than once, throws an error immediately without touching any prototypes.
3. **Byte-Exact Method Wrapping**:
   - Wraps each unique prototype with the byte-exact wrapper logic from `api42-observer-reviewed2.mjs`.
   - Accurately binds `backendPid` and `transactionIndex` when `ctx.activeTransactions.size === 1`.
   - Clears binding (`null`) after successful `COMMIT` or `ROLLBACK`.
   - Maintains separate contexts for concurrent queries without fabricating PIDs.
   - Preserves original arguments, `this` binding, returned promises/values, and Twirp/HTTP error codes.

---

## 4. Fixture Server Minimal Hook Instructions

As documented in `fixture-server-patch.md` and implemented in `fixture-server-api42-reviewed3.mjs`, the fixture server requires only a 6-line patch:
1. Import `createRequire` from `'node:module'`.
2. Resolve `requireFromCalls = createRequire(new URL('../../../apps/api/dist/modules/calls/calls.service.js', import.meta.url))`.
3. Extract `{ RoomServiceClient: CjsRoomServiceClient } = requireFromCalls('livekit-server-sdk')`.
4. Call `instrumentRoomServiceClient([RoomServiceClient, CjsRoomServiceClient], evidence)`.
5. Keep all other aspects of the fixture server byte-exact (ports, PostgreSQL sampler, cleanup handler, stop status verification).

---

## 5. Proof Control Methodology & Results

The test suite in `probe-sdk-binding-child.mjs` and `run-sdk-binding-controls.mjs`:
- Spies on both constructors before instrumentation to verify that original promise, argument, `this`, and error identities are preserved across all 6 methods.
- Sets up an isolated PostgreSQL schema with real `SELECT ... FOR UPDATE` locks.
- Executes loopback RPC calls during and after transactions, as well as across concurrent contexts.
- **Demonstration**:
  - Running against `api42-observer-reviewed2.mjs` confirms the **RED** state: exactly 0 CJS RPC records are captured.
  - Running against `api-lock-spans-observer3.mjs` confirms the **GREEN** state: both ESM and CJS RPC calls are captured with exact transaction PIDs and indices, cleared post-commit, and isolated across concurrent contexts.

---

## 6. Honest Remaining Coverage Limits

1. **Control Scope vs. Application Acceptance**:
   The proof control child exercises mock services with real PostgreSQL transactions and real loopback HTTP to verify instrumentation fidelity. It does not claim native feature acceptance.
2. **Nest Runtime Verification**:
   Full verification requires running the patched fixture server with the real compiled Nest API so that actual endpoints (`/recruitments`, `/rooms/:id/calls`, `/calls/:id/join`) exercise the newly instrumented CJS constructor in live execution.
3. **Observation-Only**:
   This proposal fixes telemetry coverage only. It does not alter application database queries, lock durations, or the 5,000ms locator threshold.
