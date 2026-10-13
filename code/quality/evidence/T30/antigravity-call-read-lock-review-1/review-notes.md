# FG T30 - CallsService Shared Read-Lock Proposal Review Notes (antigravity-call-read-lock-review-1)

## 1. Problem Context, Diagnostic Evidence & Hypothesis

In Native14 (`quality/evidence/T30/gateway-api-timing-summary-6.json`), both native screen captures published successfully (10492ms / 15733ms). However, the test reported 1 viewer tab vs expected 2 after a ticker room-lock timeout `57014` at 3068ms.

Numeric pool owner tracing identified:
- `poolIndex: 16` belongs to `CallsService` (`calls.service.js`).
- `CallsService` queries `lock-room:pool16` had count 86, p50 280ms, p95 2464ms, max 4267ms, and `roomHeldMs: 1036ms`.
- Read-only endpoints `CallsService.list` and `CallsService.participants` (invoked repeatedly by client tickers / UI poll loops) were acquiring exclusive `FOR UPDATE` locks on `rooms`, `"user"`, and `call_groups`.
- These exclusive locks conflicted with concurrent signaling gateway runtime reads (`FOR SHARE`), causing signaling ticks to exceed statement timeouts and close client connections.

### Note on Attribution & Hypothesis
The inferred root cause (API lock timing plus source lock conflict) is a **hypothesis**; definitive native success is pending verification by the Codex review and native test run. Furthermore, **no claim of measured endpoint attribution from pool-only trace** is made: while the pool tracing demonstrated elevated lock hold times and contention on pool 16, exact per-endpoint attribution between `list`/`participants` and other background queries remains an inferred hypothesis to be confirmed by end-to-end execution.

---

## 2. CallsService Minimal Typed Private Lock Mode

1. **Lock Mode Definition**:
   Introduces `type LockMode = 'FOR UPDATE' | 'FOR SHARE';`.
2. **Strict Exclusivity Default**:
   All mutation paths (`create`, `join`, `leave`, `selfMic`, `withControlGroup`, `sessionDeleted`) strictly retain default **`'FOR UPDATE'`** locks across rooms, users, and call groups.
3. **Read-Only Shared Mode**:
   Only `list(user, session, roomId)` and `participants(user, session, id)` pass **`'FOR SHARE'`** to internal helpers `room` and `controlsGroup`.
4. **Canonical Ordering Preserved**:
   Retains sorted room locks (`ORDER BY id`), then `"user"`, then actor checks (`session`, `admin_actions` ban, onboarding profiles), then `room_members`, and finally `call_groups`.
5. **Byte-Identical Predicates**:
   All session validity, ban enforcement, game-interest onboarding, profile queries, room membership, `OPEN` state, `liveLease`, and DTO conversions remain 100% byte-identical.
6. **No Client Influence**:
   Lock mode is an internal private server decision; it is never exposed to or controlled by client input.
7. **No Lock Upgrades / KEY SHARE**:
   Does not use lock upgrades within transactions, `KEY SHARE`, or `SKIP LOCKED`.

---

## 3. Exact Changed Helper Call Sites in `calls.service.ts`

- **Line 40 (`room` helper signature & query lock clause)**:
  `private async room(db: PoolClient, id: string, user: string, session: string, extra: string[] = [], mode: LockMode = 'FOR UPDATE')`
  Uses `const lockClause = mode === 'FOR SHARE' ? 'FOR SHARE' : 'FOR UPDATE';` for both `rooms` and `"user"`.
- **Line 64-65 (`list` method)**:
  Calls `await this.room(db, roomId, user, session, [], 'FOR SHARE');`
- **Line 68-72 (`controlsGroup` helper signature & query lock clause)**:
  `private async controlsGroup(db: PoolClient, id: string, user: string, session: string, mode: LockMode = 'FOR UPDATE')`
  Passes `mode` to `this.room(...)`, and locks `call_groups` with `const lockClause = mode === 'FOR SHARE' ? 'FOR SHARE' : 'FOR UPDATE';`.
- **Line 86 (`participants` method)**:
  Calls `await this.controlsGroup(db, id, user, session, 'FOR SHARE');`

---

## 4. Test Suite Additions & Refinements (`t30-signaling-throughput.integration.spec.ts`)

- **Preserves All 15 Existing Executed Tests Verbatim**:
  Includes 32 PING/PONG, mid-batch revoke/ban/expire, screen quota denials, queue limits, warm prepared statement tests, and runtime reader/writer isolation.
- **Round 2 Refinements**:
  1. **1500ms Concurrent Read Deadline & Promise Settle**:
     - Uses a 1500ms timer with `Promise.race` that rejects if `CallsService.list` or `participants` exceeds the deadline while the gateway runtime holds `FOR SHARE` at the SFU barrier.
     - Immediately attaches rejection handler `void originalApiPromise.catch(() => {})`.
     - Clears timer in `finally`.
     - In test cleanup `finally`, original pending API promise is settled (`await originalApiPromise.catch(() => {})`) AFTER releasing the RPC barrier and closing client sockets, and BEFORE schema drop in `afterAll`.
  2. **Exact DTO Field Assertions**:
     - `list`: verifies exact `callId`, `roomId`, `participantCount: 2`, and `publisherCount: 1`.
     - `participants`: verifies exactly 2 distinct user IDs (`user1.userId`, `user2.userId`), 2 distinct `mediaIdentity` admission IDs, matching `callId`, `user1.isPublishing === true`, and `user2.isPublishing === false`.
     - Asserts both client sockets remain open and barrier unreleased after read and after writer probe.
     - Releases barrier before 3s deadline; verifies screen `addTrack` forwards to upstream SFU, writer unblocks and commits.
  3. **Negative Principal Authorization (5 Cases)**:
     - Real database authority tests covering:
       1. `outsider`: not in `room_members` -> 403 `ErrorCode.FORBIDDEN` (`'Current room membership required'`).
       2. `expired_session`: `session.expires_at` in past -> 401 `ErrorCode.LOGIN_REQUIRED` (`'Session expired or revoked'`).
       3. `deleted_session`: session row explicitly deleted from DB -> 401 `ErrorCode.LOGIN_REQUIRED` (`'Session expired or revoked'`).
       4. `banned`: row in `admin_actions` with `BAN` -> 403 `ErrorCode.FORBIDDEN` (`'Account is banned'`).
       5. `no_onboarding`: no row in `game_interests` -> 403 `ErrorCode.FORBIDDEN` (`'Onboarding required'`).
     - Asserts both `list` and `participants` throw `HttpException` with exact `getStatus()` and `getResponse()` code and message.
     - Unique synthetic IDs per case; no raw errors or private environment logged.
  4. **Robust Database Lifecycle**:
     - Preserves `originalDbUrl = process.env.DATABASE_URL` in `beforeAll` and restores it in `afterAll` `finally`.
     - Wraps `callsService?.onModuleDestroy()` in a `try/catch` inside `afterAll`, ensuring schema drop (`DROP SCHEMA ... CASCADE`) is always executed even if service teardown fails.
- **Total Executed Test Callbacks**: **22 callbacks** (15 original + 2 concurrent reader + 5 principal security).

---

## 5. Fixtures Canonical Restoration

1. **`private-gateway-shaped-fixture.mjs`**:
   Byte-identical canonical restoration from Round 1 mounting `apps/api/dist/modules/calls`.
2. **`fixture-server-shaped.mjs`**:
   Byte-identical canonical restoration from Round 1 with observation interception removed.

---

## 6. Proposed Files & SHA-256 Hashes

| Path | SHA-256 | Notes |
| :--- | :--- | :--- |
| `quality/evidence/T30/antigravity-call-read-lock-review-1/calls.service.ts` | `eabe88b1597df4c85f9fc76e871f00213107e87b3a942ad546e0578846c410ea` | Byte-identical to Round 1 source proposal |
| `quality/evidence/T30/antigravity-call-read-lock-review-1/t30-signaling-throughput.integration.spec.ts` | `6a5a51adaee6e50bb6aceec42ed39880668182842942503b3625206716ede002` | 22 executed integration test callbacks with refined assertions |
| `quality/evidence/T30/antigravity-call-read-lock-review-1/fixture-server-shaped.mjs` | `bfd4c5fe5131ea69b4240858e1249bdfe9663e7142b65ede609ee9951f06b3a2` | Byte-identical canonical fixture server |
| `quality/evidence/T30/antigravity-call-read-lock-review-1/private-gateway-shaped-fixture.mjs` | `d891dbd9f976a5ea39de29dc842ae9826f782a57efa10a656bf1822d28d3696f` | Byte-identical canonical gateway mount fixture |
| `quality/evidence/T30/antigravity-call-read-lock-review-1/review-notes.md` | *(Computed below)* | Round 2 review documentation |

*No production source, dist, tests, git ledger, or history files were altered. No build or test commands were run. No claim of task PASS or native acceptance.*
