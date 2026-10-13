# FG T30 — Diagnostic Proposal: PostgreSQL Client Connection Phase Observation

## 1. Executive Summary & Diagnostic Gap

In native run 55 (`native55-photo-timing-review1.json`), `RoomsService.listRoomMembers` (pool 3), `TeamsService.transaction` (pool 16), and `RoomsService.getRoomDetail` (pool 3) failed with `CONNECTION_TIMEOUT` (~5000ms) with `backendPid: null`, precipitating HTTP 500 responses and failing actor 3's initial locator.

While the attributed observer successfully mapped these failures to the responsible service owners, a critical telemetry blindspot remains: **did the 5000ms timeout occur during OS/TCP socket establishment, or after TCP connection succeeded while awaiting PostgreSQL server authentication and `readyForQuery`?**

## 2. Minimal Hook Architecture (`pg.Client.prototype.connect`)

To resolve this without rewriting the observer or altering caller semantics:

### A. Strict Identity Preservation
`pg.Client.prototype.connect` is wrapped to intercept the connection lifecycle:
- **Callbacks**: When called with a callback (as internal `pg-pool` always does in `pg-pool/index.js:266`), `args[0]` is **never wrapped or modified**. The invocation passes straight through to `Reflect.apply(origClientConnect, this, args)` and returns `undefined`.
- **Promises**: When called without a callback, the exact original Promise identity returned by node-pg is returned to the caller.
- **Sync Errors**: Any synchronous throw is caught to emit a `sync-error` phase record before being immediately rethrown.
- **No Error Listeners**: Under no circumstances is an `'error'` event listener added to the socket or client, ensuring zero risk of suppressing unhandled errors.

### B. Event Sequence & Public Phase Milestones
The hook listens solely to node-pg's established public events:
1. **Invocation**: Records monotonic `startedAt` and increments `clientConnectionIndex`.
2. **TCP Establishment (`socket.once('connect')`)**:
   - Records `tcpConnectedAt` and `tcpDurationMs`.
   - Transitions `finalPhase` to `'tcp-connected'`.
3. **PostgreSQL Ready (`client.once('connect')`)**:
   - Emitted by node-pg only upon receiving backend `readyForQuery` (`pg/lib/client.js:386`).
   - Records `pgConnectedAt`, `pgDurationMs`, and extracts `backendPid` if positive integer.
   - Transitions `finalPhase` to `'pg-ready'` and emits the telemetry span.
4. **Socket Termination (`socket.once('close')`)**:
   - Records `socketClosedAt` and `socketCloseDurationMs`.
   - If `pg-ready` was not reached, transitions `finalPhase` to `'socket-closed'` and emits the telemetry span.

### C. Safe Telemetry Payload Schema
Telemetry spans omit all payload data, SQL queries, connection configs, hostnames, IP addresses, credentials, and error stacks. Only safe primitive attributes are collected:
- `type: 'client-connection-phase'`
- `clientConnectionIndex`, `spanIndex`, `parentSpanIndex`, `owner`
- `startedAt`, `tcpConnectedAt`, `tcpDurationMs`, `pgConnectedAt`, `pgDurationMs`, `socketClosedAt`, `socketCloseDurationMs`
- `finalPhase` (`starting` | `tcp-connected` | `pg-ready` | `socket-closed`)
- `closeReason` (`pg-ready` | `socket-closed` | `sync-error` | `stopped`)
- `backendPid`: positive integer or null
- `socketReadyState`: enum (`opening` | `open` | `readOnly` | `writeOnly` | `closed` | `other`)
- `socketDestroyed`: boolean
- `bytesRead`, `bytesWritten`: safe non-negative integers

### D. Listener Bounding & Clean Settlement
- Active listener removal functions are registered in `activeConnectionCleanups: Set<Function>`.
- Upon event completion or socket close, listeners are immediately removed.
- Upon `stopApiLockSpansObserver()`, all remaining listeners in `activeConnectionCleanups` are detached.
- If `isStopped === true`, no records are buffered.

## 3. Strict Safety Invariants & Scope Boundaries

1. **Zero App Source Changes**: [`apps/api/src`](file:///E:/FGweb/code/apps/api/src) remains completely untouched.
2. **No Timeout Alterations**: `connectionTimeoutMillis: 5000` is preserved.
3. **No Lock or Authority Weakening**: PostgreSQL transactions, row-level locks, and security guards remain unaltered.
4. **No Docker/Database Configuration Changes**: Supabase, Redis, and local database settings remain untouched.
5. **No Speculative Hardware Claims**: Records phase milestones objectively without inferring unique host, VPN, or hardware causes.

## 4. Deliverables Manifest

- `client-connection-phase.patch`: Clean unified diff with exact line anchors against `quality/evidence/T30/api55-observer-reviewed1.mjs`.
- `schema.json`: Formal JSON Schema defining allowed enums, numeric bounds, and forbidden properties.
- `test-controls-plan.mjs`: Test matrix and mock socket helpers covering normal callback/promise identities, TCP-accept-without-PG-ready timeouts, connection refused errors, and listener cleanup.
- `proposal.json`: Machine-readable proposal metadata.

## 5. Next Steps for Codex Review & Adoption

1. Root Codex reviews `client-connection-phase.patch` against `api55-observer-reviewed1.mjs`.
2. Codex executes the verification controls in `test-controls-plan.mjs`.
3. Codex applies the patch to the API observer and verifies Phase milestones during native diagnostic execution.
