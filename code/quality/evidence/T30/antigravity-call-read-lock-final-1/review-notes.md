# FG T30 - CallsService Shared Read-Lock Final Proposal Review Notes (`antigravity-call-read-lock-final-1`)

## 1. Context, Diagnostics & Hypothesis

In Native14 (`quality/evidence/T30/gateway-api-timing-summary-6.json`), both native screen captures published successfully (10492ms / 15733ms). However, the test reported 1 viewer tab vs expected 2 after a ticker room-lock timeout `57014` at 3068ms.

Numeric pool owner tracing identified contention on `poolIndex: 16` (`CallsService` in `calls.service.js`), where queries on `lock-room:pool16` had high hold times (p95 2464ms, max 4267ms). Read-only endpoints `CallsService.list` and `CallsService.participants` were acquiring exclusive `FOR UPDATE` locks on `rooms`, `"user"`, and `call_groups`.

### Note on Attribution & Hypothesis
The inferred root cause (API lock timing plus source lock conflict) is an architectural **hypothesis**; definitive native success is pending verification by the Codex native test suite. **No claim of measured endpoint attribution from pool-only trace** is made.

---

## 2. CallsService Minimal Typed Lock Mode Policy

- **Lock Mode**: `type LockMode = 'FOR UPDATE' | 'FOR SHARE';`.
- **Strict Exclusivity Default**: All mutation operations (`create`, `join`, `leave`, `selfMic`, `withControlGroup`, `sessionDeleted`) exclusively use **`'FOR UPDATE'`** locks across `rooms`, `"user"`, and `call_groups`.
- **Shared Read-Only Mode**: Only `list(user, session, roomId)` and `participants(user, session, id)` pass **`'FOR SHARE'`** to internal helpers `room` and `controlsGroup`.
- **Canonical Lock Ordering Preserved**: Sorted rooms (`ORDER BY id`), then `"user"`, then actor checks (`session`, `admin_actions` ban, onboarding), then `room_members`, and finally `call_groups`.
- **Invariants Unchanged**: All auth checks, onboarding predicates, ban policies, and DTO parsing logic remain identical.
- **No Client Influence / Upgrades**: Lock mode is an internal private server decision; no lock upgrades within transactions, `KEY SHARE`, or `SKIP LOCKED` are used.

---

## 3. Codex Final Review Cleanups & Lint Typed Fixes

The integration test suite in `t30-signaling-throughput.integration.spec.ts` incorporates the final Codex review corrections:
1. **Environment Capture & Teardown**:
   - `const originalDbUrl = process.env.DATABASE_URL;` is captured immediately at module evaluation before any setup can fail.
   - Schema drop (`DROP SCHEMA ... CASCADE`) is placed in an inner `finally` block in `afterAll`, guaranteeing schema teardown is always attempted even if `callsService.onModuleDestroy()` rejects.
   - Outer `finally` restores `process.env.DATABASE_URL`.
2. **ESLint & Strict Type Cleanups (0 Errors)**:
   - Eliminated all loose `any` casts.
   - Service constructor dependencies use typed doubles (`ConstructorParameters<typeof CallsService>`).
   - `readResult` and `originalApiPromise` use contract DTO unions (`CallGroupDTO[] | CallParticipantDTO[]`).
   - Caught authorization errors use typed `unknown` with narrowing `instanceof HttpException` guards and `toMatchObject({code: expectedCode, message: expectedMessage})`.
   - Verified clean under ESLint (0 errors, exitCode 0 in `codex-t30-call-read-lock-final-patch-lint-2.json`).

---

## 4. Test Suite Structure (22 Expected Real-PG Callbacks)

- **15 Original Callbacks Verbatim**: Preserves 32 PING/PONG, mid-batch revoke/ban/expire, screen quota denials, queue bounds, warm prepared statements, and runtime reader/writer isolation.
- **2 Concurrent Reader Callbacks**:
  - `CallsService.list` and `participants` execute within a strict 1500ms `Promise.race` deadline while gateway runtime holds `FOR SHARE` at the SFU barrier.
  - Verifies exact contract DTO structures.
  - Asserts both client sockets remain open and barrier unreleased after read and after writer probe.
  - Releases barrier before 3s deadline; verifies screen track forwards and writer commits.
  - Cleanup settles `originalApiPromise` after releasing barrier and closing clients, before schema teardown.
- **5 Negative Principal Authorization Callbacks**:
  - Real database authority tests covering `outsider`, `expired_session`, `deleted_session` (explicit SQL delete), `banned`, and `no_onboarding`.
  - Asserts `HttpException` with exact `getStatus()` (401 / 403) and `getResponse()` code/message.

---

## 5. File Verification & Exact SHA-256 Hashes

All four files were copied byte-identical from `quality/evidence/T30/call-read-lock-final-patch2/`:

| File | SHA-256 | Description |
| :--- | :--- | :--- |
| `calls.service.ts` | `eabe88b1597df4c85f9fc76e871f00213107e87b3a942ad546e0578846c410ea` | CallsService typed FOR SHARE for list/participants |
| `t30-signaling-throughput.integration.spec.ts` | `8ce8a76cbbf089857c4508f49fb6a3cd0046b5beb689d10e2e51549b365ba67b` | 22 executed integration test callbacks with lint fixes |
| `fixture-server-shaped.mjs` | `bfd4c5fe5131ea69b4240858e1249bdfe9663e7142b65ede609ee9951f06b3a2` | Restored canonical fixture server |
| `private-gateway-shaped-fixture.mjs` | `d891dbd9f976a5ea39de29dc842ae9826f782a57efa10a656bf1822d28d3696f` | Restored canonical gateway mount fixture |
| `review-notes.md` | *(This file)* | Review documentation |

*No production source, dist, tests, git ledger, or history files were altered. No build or test commands were run. No claim of task PASS or native acceptance.*
