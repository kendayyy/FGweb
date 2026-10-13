# FG T30 - TeamsService & PlaySessionsService Read-Lock Final Proposal Review Notes (`antigravity-team-read-lock-final-1`)

## 1. Diagnostic Context & Architecture Summary

- **Pool 15 Attribution & Lock Contention**:
  - Traces and gateway timing summary 8 positively attribute Pool 15 to `TeamsService` database operations executed inside `PlaySessionsService` transactions.
  - Native 18 recorded room-lock wait times up to 6004ms and hold durations up to 968ms.
  - Native 19 canonical failure recorded 13 GET `snapshot` calls and 5 GET `requests` calls during initial room load before RTP due to 10s UI periodic refetch cycles.
  - Previously, read-only queries `TeamsService.snapshot` and `PlaySessionsService.requests` executed exclusive `FOR UPDATE` locks on `rooms`, `play_sessions`, and sorted `user` rows, causing heavy writer contention against fresh signaling readers attempting to acquire `FOR SHARE` locks during WebSocket room join/lease.
- **Tightened Literal Clause Guards**:
  - In both services, literal clause interpolation is strictly bound:
    `const lockClause = mode === 'FOR SHARE' ? 'FOR SHARE' : 'FOR UPDATE';`
  - Only literal canonical SQL clauses `'FOR SHARE'` or `'FOR UPDATE'` can ever be interpolated.
  - All public signatures, transaction bounds, timeout deadlines, and permission guards remain 100% AST unchanged.
  - Mutating operations (`apply`, `admit`, `respond`, `cancel`, `mine`, `join`, `start`, `leave`, `end`) strictly retain default exclusive `'FOR UPDATE'` locking.

---

## 2. Codex Review Adjustments Adopted (`team-read-lock-final-patch1`)

The final review patch addresses round 2 review findings in the integration test suite:

1. **Reader PID Filtering**:
   - Fresh reader PID is captured exclusively on actual room SQL excluding the blocker client connection.
   - Blocker commits revocation within its own transaction.
2. **Immediate Rejection Handling**:
   - Immediate rejection handlers retain the original API rejection without creating unhandled promise warnings.
3. **Bounded Barrier Waits**:
   - Reader barrier release is bounded at 3000ms.
   - Failed seed rollback errors properly propagate.
4. **Query Wrapper Timing**:
   - Query wrapper is installed only after the writer client has been acquired.
5. **Requests Play-Row Writer Exclusion**:
   - Added requests play-row writer exclusion verifying the exact original reader backend PID.
6. **Explicit Deleted-Session Proof**:
   - Explicitly deletes existing sessions after expiry assertion to ensure distinct negative test paths.
7. **Schema Conformance Verified**:
   - `team_members` has NO `room_id`.
   - `active_play_slots` has `slot_index`.
   - `recruitments` `current_players` is an actual writable column.
   - Circular `rooms_owner_membership_fk` handled via `SET CONSTRAINTS ALL DEFERRED` in a single client transaction.

---

## 3. Verified File SHA-256 Hashes

All three files are exact byte-for-byte copies of Codex reviewed snapshot `quality/evidence/T30/team-read-lock-final-patch1/`:

| File | SHA-256 | Status |
| :--- | :--- | :--- |
| `teams.service.ts` | `b16d6ba271d33e9531f25169c019a52f779a8ae615ae9f441b3270567965cf0a` | Exact byte copy |
| `play-sessions.service.ts` | `ecf1fb8c51afe2d9b1d20f95a8b48aeb8ee71d865899314a45164e0311f96f93` | Exact byte copy |
| `t30-team-read-lock.integration.spec.ts` | `ca496e28108742d309e817b5071647d023569c0b9f456b042864ba9dacb2fdab` | Exact byte copy |

---

## 4. Execution Discipline

- No actual application files (`apps/`), compiled distributions (`dist/`), git ledger, or history files were modified.
- No build, test, or lint commands were executed by this agent.
- Awaiting Codex gates, lint, realPG RED/GREEN test runs, frozen 42 test suite verification, API build, and headed native validation.
