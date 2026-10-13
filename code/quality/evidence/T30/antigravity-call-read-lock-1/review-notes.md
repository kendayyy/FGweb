# FG T30 — CallsService Shared Read-Lock Proposal Review Notes (antigravity-call-read-lock-1)

## 1. Problem Context & Diagnostic Evidence

In Native14 (`quality/evidence/T30/gateway-api-timing-summary-6.json`), both native screen captures published successfully (10492ms / 15733ms). However, the test reported 1 viewer tab vs expected 2 after a ticker room-lock timeout `57014` at 3068ms.

Numeric pool owner tracing identified:
- `poolIndex: 16` belongs to `CallsService` (`calls.service.js`).
- `CallsService` queries `lock-room:pool16` had count 86, p50 280ms, p95 2464ms, max 4267ms, and `roomHeldMs: 1036ms`.
- Read-only endpoints `CallsService.list` and `CallsService.participants` (invoked repeatedly by client tickers / UI poll loops) were acquiring exclusive `FOR UPDATE` locks on `rooms`, `"user"`, and `call_groups`.
- These exclusive locks directly conflicted with and starved concurrent signaling gateway runtime reads (`FOR SHARE`), causing signaling ticks to exceed statement timeouts and close client connections.

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

---

## 3. Exact Changed Helper Call Sites in `calls.service.ts`

- **Line 40 (`room` method signature & locks)**:
  `private async room(db: PoolClient, id: string, user: string, session: string, extra: string[] = [], mode: LockMode = 'FOR UPDATE')`
  Uses `const lockClause = mode === 'FOR SHARE' ? 'FOR SHARE' : 'FOR UPDATE';` for both `rooms` and `"user"`.
- **Line 62 (`list` method)**:
  Calls `await this.room(db, roomId, user, session, [], 'FOR SHARE');`
- **Line 66 (`controlsGroup` method signature & locks)**:
  `private async controlsGroup(db: PoolClient, id: string, user: string, session: string, mode: LockMode = 'FOR UPDATE')`
  Passes `mode` to `this.room(...)`, and locks `call_groups` with `const lockClause = mode === 'FOR SHARE' ? 'FOR SHARE' : 'FOR UPDATE';`.
- **Line 83 (`participants` method)**:
  Calls `await this.controlsGroup(db, id, user, session, 'FOR SHARE');`

---

## 4. Test Suite Additions & Preserved Regressions

In `quality/evidence/T30/antigravity-call-read-lock-1/t30-signaling-throughput.integration.spec.ts`:
- **Preserves All 15 Existing Executed Tests Verbatim**:
  Includes 32 PING/PONG, mid-batch revoke/ban/expire, screen quota denials, queue limits, warm prepared statement tests, and runtime reader/writer isolation.
- **Concurrent `CallsService.list` / `participants` Execution (2 Cases)**:
  - Seeds 2 joined admissions in a single call.
  - Client 1 sends screen `addTrack`, holding room/group `FOR SHARE` at the fake SFU `GetParticipant` barrier.
  - While barrier is unreleased, `CallsService.list` / `participants` completes within <= 1500ms, returning exact DTO participant counts.
  - An independent canonical `FOR UPDATE` writer is verified blocked via `pg_blocking_pids`.
  - RPC barrier is released before 3s deadline; first track forwards, writer finishes, and sockets stay open.
  - Robust `finally` block releases barrier first, terminates clients, and settles pending writer promise before rollback/release.
- **Negative Principal Authorization on Read Methods (4 Cases)**:
  - Real database negative tests for `CallsService.list` and `CallsService.participants`:
    1. Outsider not in `room_members` -> `FORBIDDEN` (403).
    2. Expired session in `session` -> `LOGIN_REQUIRED` (401).
    3. Account banned in `admin_actions` -> `FORBIDDEN` (403).
    4. Incomplete onboarding (no `game_interests`) -> `FORBIDDEN` (403).
- **Total Executed Tests**: **21 test cases** (15 existing + 2 concurrency + 4 principal security).

---

## 5. Fixture Canonical Restorations

1. **`private-gateway-shaped-fixture.mjs`**:
   Mount source updated from temporary diagnostic copy `quality/evidence/T30/gateway-timing-observation-6` to canonical `apps/api/dist/modules/calls`.
2. **`fixture-server-shaped.mjs`**:
   Removed observation import `import {instrumentOwnedApiPools} from './api-lock-observation-6.mjs';` and call `instrumentOwnedApiPools(pg,evidence);`. Both fixtures match original clean canonical state.

---

## 6. Proposed Files & SHA-256 Hashes

| Path | SHA-256 | Notes |
| :--- | :--- | :--- |
| `quality/evidence/T30/antigravity-call-read-lock-1/calls.service.ts` | `eabe88b1597df4c85f9fc76e871f00213107e87b3a942ad546e0578846c410ea` | CallsService typed FOR SHARE for list/participants |
| `quality/evidence/T30/antigravity-call-read-lock-1/t30-signaling-throughput.integration.spec.ts` | `68d3c2fd68c0a4f1178d2a4c84263f0f3394931f31ccddf4f0f925d8a2018233` | 21 executed integration tests |
| `quality/evidence/T30/antigravity-call-read-lock-1/fixture-server-shaped.mjs` | `bfd4c5fe5131ea69b4240858e1249bdfe9663e7142b65ede609ee9951f06b3a2` | Restored canonical fixture server |
| `quality/evidence/T30/antigravity-call-read-lock-1/private-gateway-shaped-fixture.mjs` | `d891dbd9f976a5ea39de29dc842ae9826f782a57efa10a656bf1822d28d3696f` | Restored canonical gateway mount |
| `quality/evidence/T30/antigravity-call-read-lock-1/review-notes.md` | *(This file)* | Review documentation |

*No production source, dist, tests, git ledger, or history files were altered. No build or test commands were run. No claim of task PASS.*
