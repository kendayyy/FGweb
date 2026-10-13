# T30 Frame Lease Policy Combined Query Integration & Contract Suite (RED-1)

**Task**: FG T30 — Frame Lease Policy Combined Query Integration & Contract Suite (RED-1)  
**Directory**: `quality/evidence/T30/antigravity-frame-lease-policy-red-1/`  
**Reviewer/Auditor**: Codex  
**Agent**: Antigravity (Gemini 3.6 Flash - High, sequential test proposal mode, no Anti2 / no subagents)  
**Date**: 2026-10-11  

---

## 1. Context & Codex Review Alignment

This test proposal strictly follows the review decisions recorded in `native35-signal-analysis-codex-review-1.json`:
- **Unchanged Invariants**:
  - The frame 0 fresh check in `processBatch` is preserved untouched.
  - Readonly member checks and profile resolutions in `rooms.service.ts` remain unchanged.
  - Lifecycle sweep and webhook reconciliation authority in `call-lifecycle.service.ts` remain unchanged.
  - Connection pool configuration (`max: 16`) and statement timeouts (`3000ms`) are strictly untouched.
  - Zero application source, build artifacts, task ledger, or session history files were modified or executed.
- **Narrow Approved Candidate Scope**:
  - The single candidate optimization under evaluation is appending `liveLeaseWithPolicy(db, id)` to `lease-store.ts` to combine fresh admission lease verification and publication policy checks into **1 fresh SQL query per invocation** (cutting per-frame queries in `processBatch` from 2 to 1).
  - This suite establishes the exact real PostgreSQL contract and behavioral parity required before any source adoption.

---

## 2. Test Suite Architecture

### 2.1 Isolated Disposable Real PostgreSQL Environment
- Evaluates against real PostgreSQL (never SQLite, mocks, or synthetic drivers).
- Bootstraps an isolated schema per run (`t30_frame_lease_policy_<uuid>`) via Drizzle migrations and seeds game catalogs.
- Complete teardown in `afterAll`:
  - Drops the owned schema with `CASCADE`.
  - Ends connection pools.
  - Restores `process.env.DATABASE_URL` and `pg.Client.prototype.query`.
  - Emits a unique cleanup record to `quality/evidence/T30/frame-lease-policy-cleanup-<uuid>.json` with `{ flag: 'wx' }`.
  - Zero sensitive database credentials, passwords, or connection URLs are logged.

### 2.2 Namespace Access & Clean Deterministic RED
- The test file imports `* as leaseStore from '../../../../apps/api/src/modules/calls/lease-store.js'`.
- Accesses the proposed helper via namespace casting:
  `const liveLeaseWithPolicyFn = (leaseStore as { liveLeaseWithPolicy?: LiveLeaseWithPolicyFunction }).liveLeaseWithPolicy;`
- In the unadopted codebase where `liveLeaseWithPolicy` is not exported, `liveLeaseWithPolicyFn` evaluates to `undefined`.
- Tests assert `expect(typeof liveLeaseWithPolicyFn).toBe('function')`, failing cleanly and deterministically with:
  `Expected: "function", Received: "undefined"`
  without unhandled syntax errors, ReferenceErrors, or runtime TypeError crashes.

---

## 3. Test Cases Summary

### 3.1 Control Tests (Baseline Parity on Existing Unmodified Functions)
*These tests run against existing `liveLease`, `publicationSources`, and `publicationPermission` and PASS 100%:*
1. **Active Caller Lease Verification**: Confirms `liveLease` resolves valid `LiveLease` with all fields and Date timestamps.
2. **Baseline Publication Permission**: Confirms `publicationPermission` returns expected flags and sources.
3. **Guard Invalidation**: Confirms `liveLease` returns `undefined` for expired admission, revoked admission, expired session, left member, disconnected > 30s, no game interests, banned user, and closed call.
4. **Grace Window & Tie-Breaker**: Confirms `liveLease` returns valid lease for disconnected within 29s and UNBAN tie-breaker.

### 3.2 RED Tests (Candidate `liveLeaseWithPolicy` Contract Assertions)
*These tests assert the candidate helper contract and will fail cleanly (RED) until source implementation is provided:*
1. **RED-1 (Export Availability)**: Asserts `typeof liveLeaseWithPolicyFn === 'function'`.
2. **RED-2 (Active Caller Parity)**: Asserts `{ lease, permission }` returned by candidate helper identically matches sequential `liveLease` + `publicationPermission`.
3. **RED-3 (Guard Invalidation Parity)**: Asserts candidate helper returns `undefined` across all invalidation conditions (expired admission, revoked admission, expired session, left member, disconnected 35s, missing game interests, banned user, closed group, unknown/empty admission ID).
4. **RED-4 (Grace Window & Tie-Breaker Parity)**: Asserts candidate helper returns valid lease for disconnected within 29s and UNBAN tie-breaker.
5. **RED-5 (Six Real Policy Permutations)**: Verifies exact boolean flags and source arrays for:
   - `freeMIC`: `[MICROPHONE]` (canPublish: true)
   - `noSlot`: `[MICROPHONE]` (canPublish: true)
   - `MICmuted`: `[SCREEN_SHARE]` (canPublish: true)
   - `screenblocked`: `[MICROPHONE]` (canPublish: true)
   - `slotreserved`: `[MICROPHONE, SCREEN_SHARE, SCREEN_SHARE_AUDIO]` (canPublish: true)
   - `bothblocked`: `[]` (canPublish: false)
   with `canSubscribe: true`, `canPublishData: false`, `canUpdateMetadata: false` across all permutations.
6. **RED-6 (No-Cache Live Mutation Assertion)**: Demonstrates that mutating database state between consecutive calls (adding restrictions, revoking admission) is immediately reflected on subsequent calls without in-memory caching.
7. **RED-7 (Single Real SQL Query Count Assertion)**: Intercepts client query execution to verify that sequential original operations execute **2 queries**, while the candidate helper executes **exactly 1 query**.

---

## 4. Artifacts

| Artifact | Location | SHA-256 | Purpose |
|---|---|---|---|
| `t30-frame-lease-policy.integration.spec.ts` | `quality/evidence/T30/antigravity-frame-lease-policy-red-1/` | `6569e1ac6fa9ab22e71aa4208a0a544ccba42494eb73fcca32a65ec9518b4543` | Integration and contract spec with control tests and deterministic RED assertions |
| `jest.config.cjs` | `quality/evidence/T30/antigravity-frame-lease-policy-red-1/` | `548d5e86ef15b5c418dc18998f2b6181d13b3ba6ccbeb41bc127915a5f06ea06` | Isolated Jest runner configuration mapping packages and ESM ts-jest transforms |
| `review-notes.md` | `quality/evidence/T30/antigravity-frame-lease-policy-red-1/` | Document self | Technical review and documentation of RED test proposal |

---

## 5. Next Steps for Codex Review
1. Review the proposed integration test spec and Jest configuration.
2. Execute the test suite via the isolated Jest config to confirm the expected clean RED result (4 control tests PASS, 7 candidate tests FAIL with `Expected: "function", Received: "undefined"`, owned cleanup succeeds).
3. Authorize minimal source proposal appending `liveLeaseWithPolicy` to `apps/api/src/modules/calls/lease-store.ts` and consuming it in `processBatch`.
