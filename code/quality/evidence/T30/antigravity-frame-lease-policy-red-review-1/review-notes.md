# T30 Frame Lease Policy Combined Query Integration & Contract Suite (RED Review-1)

**Task**: FG T30 — Frame Lease Policy Combined Query Integration & Contract Suite (RED Review-1)  
**Directory**: `quality/evidence/T30/antigravity-frame-lease-policy-red-review-1/`  
**Reviewer/Auditor**: Codex  
**Agent**: Antigravity (Gemini 3.6 Flash - High, sequential test proposal mode, no Anti2 / no subagents)  
**Date**: 2026-10-11  

---

## 1. Context & Review-1 Concrete Changes

This test proposal addresses all seven findings from `frame-lease-policy-red-source-review-rejected-1.json`, keeping `red-1` preserved and unexecuted. No application source code, build artifacts, task ledger, or session history files were modified or executed.

### 1.1 Root Path Resolution in Nested Jest Config (Finding 1)
- Adjusted `rootDir` resolution in `jest.config.cjs` from `../../..` to `../../../..` to properly resolve the workspace root (`E:/FGweb/code`).
- Configures `roots: [__dirname]` to isolate this proposal directory for independent execution.
- Maps `@fg/database` and `@fg/contracts` to their built distribution packages.

### 1.2 Per-Group Seat Counter & Capacity Invariant (Finding 2)
- Replaced the global sequential seat counter with a per-group `Map<string, number>`.
- In the main call group, exactly 10 participants are assigned seats 1 through 10.
- In secondary/closed call groups, participants are assigned seat 1, strictly preserving the database constraint (`seat_index BETWEEN 1 AND 10`) without artificial capacity alteration.

### 1.3 Unique Dynamic Tie-Break Actions (Finding 3)
- Replaced static primary keys (`adm_tie_1_ban`, `adm_tie_2_unban`) with dynamically generated identifiers using a shared random UUID suffix:
  - `a_adm_tie_ban_${tieSuffix}`
  - `z_adm_tie_unban_${tieSuffix}`
- Both actions are inserted at the exact same server timestamp (`now.toISOString()`). The descending sort order (`ORDER BY created_at DESC, id DESC LIMIT 1`) picks `z_...` (UNBAN) cleanly while preventing primary key collisions across repeated fixture seedings.

### 1.4 Real Server-Clock Grace Windows & Rejoin Transitions (Finding 4)
- Replaced pre-seed static timestamps with real database updates executed immediately before test evaluations on the active PostgreSQL client:
  - Stable 20s inside grace: sets `clock_timestamp() - interval '20 seconds'` and verifies server age `20 <= age < 25`.
  - Boundary 29s inside grace: sets `clock_timestamp() - interval '29 seconds'`, verifies server age `29 <= age < 30` before invocation, and asserts honest behavior if the server clock crosses 30s.
  - 31s deny: sets `clock_timestamp() - interval '31 seconds'`, verifies server age `>= 31`, and asserts `undefined`.
  - Actual rejoin: sets `disconnected_at = NULL` and verifies immediate restoration of valid lease.

### 1.5 Non-Destructive Query Delegate Preservation & Pool Teardown (Finding 5)
- Replaced bound function assignment in `countClientQueries` with exact property descriptor preservation (`Object.getOwnPropertyDescriptor` and restoration / deletion of own property when inherited).
- Directly asserts `delegateRestored` using strict method reference equality (`client.query === originalMethod`).
- In `afterAll`, verifies `pool.ended === true` on `pg.Pool` after `await pool.end()`.
- Completely restores `process.env.DATABASE_URL` and `pg.Client.prototype.query`.

### 1.6 Real Deleted State Controls & Complete Mutation Transitions (Finding 6)
- Added control and candidate tests for real deleted states:
  - Deleted row in `session` -> `undefined`
  - Deleted row in `room_members` -> `undefined`
  - Deleted row in `call_members` -> `undefined`
- Added comprehensive fresh transition assertions for the candidate helper:
  - Slot deletion (reverts screen share) and slot restoration (restores screen share)
  - Microphone restriction added (`MIC_MUTED`) and removed
  - Stream restriction added (`STREAM_BLOCKED`) and removed
  - Admission revocation and unrevocation
  - Session expiration and recovery
  - Empty string and unknown admission IDs (verified to execute exactly 1 query and return `undefined`)
- Asserts `canSubscribe === true`, `canPublishData === false`, and `canUpdateMetadata === false` across all matrix combinations.

### 1.7 Removal of Unverified Execution Claims (Finding 7)
- Removed all claims of "PASS 100%" or test execution.
- Explicitly documented that this suite is an unexecuted test proposal submitted for Codex review.

---

## 2. Artifacts

| Artifact | Location | SHA-256 | Purpose |
|---|---|---|---|
| `t30-frame-lease-policy.integration.spec.ts` | `quality/evidence/T30/antigravity-frame-lease-policy-red-review-1/` | `87fc90c813b69e88d3e8936a6abab778ffed4d3ec9b2fba672e83020a8bc1102` | Refactored integration and contract spec with per-group seats, dynamic tie IDs, and server clock grace assertions |
| `jest.config.cjs` | `quality/evidence/T30/antigravity-frame-lease-policy-red-review-1/` | `22de3c79360bbbc939f2f4e3286f31db4faf5b665339356ed80efa653fbf98fc` | Isolated Jest runner configuration with corrected 4-level root path resolution |
| `review-notes.md` | `quality/evidence/T30/antigravity-frame-lease-policy-red-review-1/` | Document self | Technical review documentation of Review-1 refactor |

---

## 3. Expected Test Outcomes upon Codex Execution

When executed by Codex:
1. **Control Tests (Existing Unmodified Functions)**:
   - Expected to PASS, confirming that existing `liveLease`, `publicationSources`, and `publicationPermission` correctly enforce all 16 guards, 30s grace windows, and policy derivations against real PostgreSQL.
2. **Candidate RED Tests (`liveLeaseWithPolicy`)**:
   - Expected to fail cleanly (RED) because `liveLeaseWithPolicy` is not yet exported from `lease-store.ts`.
   - `RED-1` will fail with `Expected: "function", Received: "undefined"`.
   - Zero unhandled TypeError crashes or syntax errors will occur due to safe namespace typing.
3. **Clean Teardown**:
   - `afterAll` will drop the owned disposable schema (`t30_frame_lease_policy_<uuid>`), end all connection pools, and record verified cleanup metadata to `quality/evidence/T30/frame-lease-policy-cleanup-<uuid>.json`.

*Proposal-only: No tests or builds have been executed by Antigravity.*
