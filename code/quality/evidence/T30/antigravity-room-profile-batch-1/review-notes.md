# FG T30 — Room Profile Batch Consolidation Review Notes

**Directory**: `quality/evidence/T30/antigravity-room-profile-batch-1`  
**Agent**: Antigravity (Gemini 3.6 Flash High)  
**Policy**: T30 only, NO Anti2 (`NO-ANTI2-01`), sequential proposals only.  
**Execution Boundary**: No application, test, ledger, history, or git edits outside this evidence directory. Zero builds/tests executed by this agent.

---

## 1. Diagnostic Findings & Rationale

- **Native21 Telemetry Analysis**:
  - `native21-photo-review.json` & `gateway-api-timing-summary-10.json` confirmed that the first capture passed (6484ms), but subsequent signaling timed out (`room57014` at 3135/3087ms).
  - Diagnostic tracking revealed that `RoomsService` held the shared room lock (`FOR SHARE`) for **4182ms**, which directly exceeded the 3000ms native signaling timer and caused lifecycle writers to wait for **5133ms**.
  - Review of `RoomsService.listRoomMembers` confirmed that while the code already used `Promise.all(...)`, it issued 6 separate calls to `this.profilesService.getPublicProfile(row.user_id)`.
  - Because `ProfilesService` connects to PostgreSQL with an unexpanded connection pool (`max: 5` in default configuration), executing 6 concurrent multi-join profile queries saturated pool checkouts, queuing profile queries while holding the shared room lock.

- **Consolidation Solution**:
  - Added `ProfilesService.getPublicProfiles(userIds: string[]): Promise<ProfileDTO[]>` executing **1 single parameterized Drizzle query** via `inArray(schema.user.id, uniqueIds)` joining `user`, `profiles`, `gameProfiles`, and `games`.
  - In-memory aggregation preserves exact contract mapping (`PublicProfileSchema.parse`), input order, duplicate preservation, avatar fallback rules, and caller-order first-missing 404 enforcement.
  - Updated `RoomsService.listRoomMembers` to execute `const userProfiles = await this.profilesService.getPublicProfiles(userIds)` once and map synchronously by index to `RoomMemberDTO[]`.
  - Eliminates connection starvation and reduces profile query latency from ~4182ms to a single query execution.

---

## 2. File Artifacts & SHA-256 Hashes

| File | SHA-256 Hash |
| :--- | :--- |
| `profiles.service.ts` | `e0b7f0c7efcaf209613da8cdb468c94c2840302223a57650e26f21e6e5cc33eb` |
| `rooms.service.ts` | `5324f1437362ffb6cf9a13d24715800360eb9d041c360c9c99c893b26f119383` |
| `t30-room-profile-batch.integration.spec.ts` | `4b2266fda61b8ab3c683880d085f594277b0b76089384f7ae87ddec424c229d4` |

---

## 3. Schema & Implementation Alignment

- **ProfilesService**:
  - Adds internal batch helper `getPublicProfiles(userIds: string[]): Promise<ProfileDTO[]>`.
  - Early-return on `userIds.length === 0` returning `[]` with 0 queries.
  - `uniqueIds = [...new Set(userIds)]` bounds the SQL parameter count.
  - Iterates `for (const id of userIds)` to guarantee throwing `NotFoundException` with `code: ErrorCode.NOT_FOUND` and `message: User profile not found: ${id}` for the FIRST missing ID in caller order.
  - Re-maps using `userIds.map(id => profileById.get(id)!)`, preserving duplicate entries and input ordering.
  - Existing `getPublicProfile(userId)` delegates directly to `getPublicProfiles([userId])`.
  - All other methods and imports remain AST byte-identical.

- **RoomsService**:
  - Only `listRoomMembers` modified:
    - Gathers `userIds = membersRes.rows.map(row => row.user_id)`.
    - Single call: `const userProfiles = await this.profilesService.getPublicProfiles(userIds)`.
    - Synchronous map by index into `RoomMemberDTO`.
  - All existing lock clauses (`SELECT 1 FROM rooms WHERE id = $1 FOR SHARE`, `SELECT 1 FROM room_members ... FOR SHARE`), `checkActorSessionAndBan`, helper permissions aggregation, transaction boundaries, and error rollbacks remain intact.
  - All other methods remain AST byte-identical.

- **Integration Test (`t30-room-profile-batch.integration.spec.ts`)**:
  - Schema isolation: dynamic schema `t30_room_profile_${uuid}` with Drizzle migrations.
  - Circular FK handling: `rooms_owner_membership_fk` is `DEFERRABLE INITIALLY DEFERRED`, seeded inside a transaction with `SET CONSTRAINTS ALL DEFERRED`.
  - Accurate schema columns:
    - `rooms`: `id`, `name`, `description`, `game_id`, `owner_id`, `owner_role: 'OWNER'`, `visibility: 'PUBLIC'`, `invite_policy: 'OWNER_APPROVAL'`, `player_capacity`, `conversation_id`, `conversation_kind: 'ROOM'`, `created_at`, `updated_at`.
    - `room_members`: `id`, `room_id`, `user_id`, `role`, `joined_at` (no non-existent columns).
    - `conversations`: `id`, `kind: 'ROOM'`.
    - `permission_grants`: `id`, `room_id`, `user_id`, `grantee_role: 'HELPER'`, `permission: 'MANAGE_MEMBERS'`, `granted_by`, `granted_at`.
  - Test suites:
    1. Query consolidation: Exactly 1 SQL query targeting `"user"` table during `listRoomMembers(6 members)` instead of 6; `spyBatch` called 1 time, `spySingle` not called.
    2. Direct `getPublicProfiles`: exact ordering, duplicates preservation, empty array returning `[]` with 0 queries, first-missing 404 enforcement in caller order, avatar fallbacks, and `PublicProfileSchema.parse`.
    3. Functionality: role ordering (`OWNER`, `HELPER`, `MEMBER`), helper permissions, ISO string validation.
    4. Authority negatives: 401 expired/non-existent session, 403 ban, 403 outsider non-member, 404 non-existent room with exact error messages.
    5. Writer exclusion on held room lock: verified via `pg_blocking_pids` matching reader client backend PID (`client.processID`) with a bounded deferred barrier.
    6. Teardown safety: schema drop with `CASCADE`, pool end, and `AggregateError` propagation.

---

## 4. Diagnostic Disclaimer

This proposal implements the single-query batch optimization as an architectural performance hypothesis to alleviate connection pool saturation and lock-holding duration. It is not claimed to be the sole root cause of all signaling failures, nor is any task PASS claimed. Execution of gates, builds, unit/integration runs, and headed browser validation will be performed by Codex.
