# FG T30 - CallsService Concurrency Fixture Patch Review Notes (`antigravity-call-read-lock-fixture-1`)

## 1. Problem Context & Fixture Defect Diagnosis

During the first GREEN test run of the adopted `CallsService` shared read-lock implementation (where 21 of 22 callbacks passed), the newly added `participants` concurrency case failed with a Zod schema validation error:
- `CallsService.participantDtos` parses participants against `CallParticipantSchema`, which requires `mediaIdentity` to conform to the canonical format (`admission_<uuid>`).
- The legacy integration test helper `seedCallAdmission` generates raw UUIDs without the `admission_` prefix.
- In production, admissions are created with `admission_${randomUUID()}`.
- This was an integration test fixture defect, not an application code, contract, or database defect.

---

## 2. Minimal Fixture Patch Applied

A minimal, targeted patch was applied to `t30-signaling-throughput.integration.spec.ts` copied from `apps/api/test/t30-signaling-throughput.integration.spec.ts`:
1. **Added Helper**:
   ```ts
   async function canonicalDtoAdmission<T extends { admissionId: string }>(seed: T) {
     const admissionId = `admission_${randomUUID()}`;
     const changed = await pool.query('UPDATE call_admissions SET id=$1 WHERE id=$2', [admissionId, seed.admissionId]);
     expect(changed.rowCount).toBe(1);
     return { ...seed, admissionId };
   }
   ```
2. **Updated Call Site in New Concurrency Test Only**:
   - Wrapped `user1` and `user2` seeding in `canonicalDtoAdmission`:
     ```ts
     const user1 = await canonicalDtoAdmission(await seedCallAdmission(pool, `calls-shared-${method}-user-1`, game.id));
     const user2 = await canonicalDtoAdmission(await seedSecondMemberInCall(pool, user1, `calls-shared-${method}-user-2`, game.id));
     ```
   - Both PostgreSQL rows are updated to the canonical ID format before client tokens are minted and WebSocket connections are opened.
3. **Preservation Guarantees**:
   - All 15 original callbacks and existing fixture helpers (`seedCallAdmission`, `seedSecondMemberInCall`, etc.) remain completely untouched.
   - Real PostgreSQL authority is preserved (actual database row updated, no DTO mocking).
   - All assertions, deadlines (1500ms race), writer blocking checks, and negative security tests remain identical.

---

## 3. Scope & State Summary

- **Source State**: `CallsService` in `apps/api/src/modules/calls/calls.service.ts` has already been adopted with the typed `LockMode`:
  - Read-only queries `list` and `participants` use `'FOR SHARE'`.
  - All mutation paths (`create`, `join`, `leave`, `selfMic`, `withControlGroup`, `sessionDeleted`) strictly retain exclusive default `'FOR UPDATE'`.
- **Expected Tests**: **22 total real-PG test callbacks** (15 original + 2 concurrent reader + 5 negative principal authorization).
- **Native14 Status**: Both screen captures succeeded (10492ms / 15733ms), but 1 viewer tab vs expected 2; no native acceptance claimed.
- **Rules Adherence**: No test or build executions run. No production source, dist, ledger, or history files modified. Ready for Codex verification and adoption.

---

## 4. File Verification & SHA-256 Hashes

| Path | SHA-256 | Notes |
| :--- | :--- | :--- |
| `quality/evidence/T30/antigravity-call-read-lock-fixture-1/t30-signaling-throughput.integration.spec.ts` | `7a381e5aeb20fbaf093a7257aa1055ca1862e4d231235b550d180f6586aa9eda` | Minimal fixture canonical admission patch |
| `quality/evidence/T30/antigravity-call-read-lock-fixture-1/review-notes.md` | *(This file)* | Review documentation |
