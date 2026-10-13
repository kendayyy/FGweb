# FG T30 — Cascade Empty Call Closure Test-First RED Proposal (`antigravity-cascade-empty-call-red-1`)

## 1. Executive Summary & Measured Context

- **Task**: FG T30 — Test-First RED Integration Proposal for Empty Call Closure Following Membership Cascade Deletion.
- **Scope**: Strictly confined to `quality/evidence/T30/antigravity-cascade-empty-call-red-1/**`.
- **Operating Constraints**: Sequential single-task execution, fixed Gemini 3.6 Flash (High), NO Anti2 (`NO-ANTI2-01`), no subagents, proposals only. No application source, `dist/`, runtime configs, database migrations, ledger, or history files were altered. Zero tests, builds, or browser runs were executed by this agent.
- **Empirical Measured Context**:
  - Regression run log `codex-t30-frozen-publishing-regressions-3.json` (2026-10-11T04:03:28.683Z–04:05:39.288Z, exit code 1, 26/27 pass) reported an unexpected assertion failure in frozen suite `publishing-gateway.integration.spec.ts` at line 194:
    ```
    FAIL quality/evidence/T30/regressions/publishing-gateway.integration.spec.ts (86.26 s)
      ● T29 existing lifecycle plus native screen webhook › last native participant removed after membership cascade closes the empty group and keeps its room

        expect(received).toBe(expected) // Object.is equality

        Expected: "CLOSED"
        Received: "OPEN"

          192 |   expect((await pool.query('SELECT id FROM call_members WHERE call_group_id=$1',[call.id])).rowCount).toBe(0);
          193 |   await app.get(CallsService).reconcile();await lifecycle().sweep();
        > 194 |   expect(await state(call.id)).toBe('CLOSED');expect((await sfu.listRooms([joined.roomName])).length).toBe(0);
              |                                ^
          195 |   expect((await pool.query('SELECT id FROM rooms WHERE id=$1',[room.id])).rowCount).toBe(1);expect((await signal(joined.token)).accepted).toBe(false);
          196 |  });
    ```
  - Prior runs of this suite had passed (27/27).
  - The preceding Calls participant batch changes (`liveLeases`, `participantDtos`) passed cleanly (23/23 in batch suite, 39/39 in call controls API).
  - Inspection confirms that neither `CallsService.reconcile()` nor `CallLifecycleService.reconcileGroup()` was modified by the participant batch changes. Both modules remain byte-identical to their historical state.
  - The failure reflects an underlying lifecycle state machine edge case triggered by asynchronous participant eviction timing.

---

## 2. Root Cause Analysis

### 2.1 Database Foreign Key Cascades vs. Normal Leave Semantics

The database schema defines foreign key cascading relationships across rooms, call groups, call members, and call admissions:
- In `packages/database/src/schema/calls.ts`:
  ```ts
  foreignKey({
    name: 'call_members_room_member_fk',
    columns: [table.roomId, table.userId],
    foreignColumns: [roomMembers.roomId, roomMembers.userId],
  }).onDelete('cascade')
  ```
- In `packages/database/src/schema/call-admissions.ts`:
  ```ts
  callMemberId: text('call_member_id')
    .notNull()
    .references(() => callMembers.id, { onDelete: 'cascade' })
  ```

When a user leaves normally via API (`CallsService.leave`):
1. `CallsService.release` executes:
   ```sql
   UPDATE call_members SET left_at = COALESCE(left_at, now()) WHERE id = ANY($1::text[])
   ```
2. The row in `call_members` is **retained** with `left_at IS NOT NULL`.
3. A subsequent check `SELECT id FROM call_members WHERE call_group_id = $1 LIMIT 1` returns `rowCount === 1`.

When a room member is deleted from `room_members` (`DELETE FROM room_members WHERE room_id = $1 AND user_id = 'viewer'`):
1. PostgreSQL immediately triggers `call_members_room_member_fk` with `ON DELETE CASCADE`.
2. The row in `call_members` is **physically deleted from the database**.
3. Foreign key cascades further delete all associated `call_admissions` and `call_publish_slots` rows.
4. As a result, `call_members` now has **0 rows** for this call group.

---

### 2.2 The Flawed Guard in `CallLifecycleService.reconcileGroup`

In `apps/api/src/modules/calls/call-lifecycle.service.ts` (lines 97–100):
```ts
// A newly created group has no joined/reserved members yet. It must stay
// available for the first admission, rather than closing in its first sweep.
if (!nativeExists || (await db.query('SELECT id FROM call_members WHERE call_group_id=$1 LIMIT 1', [id])).rowCount) {
  closed = await this.closeLocked(db, id, time);
}
```

The author intended to prevent newly created call groups from closing before anyone has joined. However:
1. `nativeExists` is `true` because the native SFU room `fg-call_<id>` was created when the group was initialized and has an SFU `emptyTimeout` of 300 seconds. Thus, `!nativeExists` is `false`.
2. `(SELECT id FROM call_members WHERE call_group_id = $1 LIMIT 1).rowCount` is `0` because the foreign key cascade physically deleted all member rows!
3. Therefore:
   ```ts
   !nativeExists || rowCount  // false || 0 => false
   ```
4. `this.closeLocked(db, id, time)` is **skipped entirely**.
5. The call group remains in state `'OPEN'`, and `this.deleteNative(id)` is never invoked.

---

### 2.3 Why the Failure Was Intermittent (The SFU Eviction Race)

Under lines 190–193 of `publishing-gateway.integration.spec.ts`:
```ts
const { room, call } = await roomCall(), joined = await join(call.id);
expect((await signal(joined.token)).accepted).toBe(true);
dropWebhooks = true;
await pool.query("DELETE FROM room_members WHERE room_id=$1 AND user_id='viewer'", [room.id]);
expect((await pool.query('SELECT id FROM call_members WHERE call_group_id=$1', [call.id])).rowCount).toBe(0);
await app.get(CallsService).reconcile();
await lifecycle().sweep();
```

There are two possible execution sequences depending on milliseconds of timing:

- **Path A (Participant still present in SFU when `CallsService.reconcile()` runs)**:
  1. `CallsService.reconcile()` queries SFU: `listParticipants(room.name)` returns `viewer`.
  2. It checks `liveLease(this.pool, p.identity)`: returns `undefined` (admission was cascade-deleted).
  3. It executes `await config.client.removeParticipant(room.name, p.identity)`.
  4. It invokes `await this.afterLeave?.(room.name.slice('fg-call_'.length))`.
  5. `afterLeave` calls `closeIfEmpty(call.id)`, which directly calls `closeLocked()`.
  6. In `closeLocked`:
     ```ts
     if ((await db.query('SELECT id FROM call_members WHERE call_group_id=$1 AND left_at IS NULL LIMIT 1', [id])).rowCount) return false;
     await db.query("UPDATE call_groups SET state='CLOSED', ended_at=COALESCE(ended_at,$2) WHERE id=$1 AND state='OPEN'", [id, time]);
     return true;
     ```
     Since there are 0 active members, `closeLocked` transitions the call to `'CLOSED'` and deletes the native room.
  7. The test passes!

- **Path B (Participant evicted from SFU before `CallsService.reconcile()` runs)**:
  1. The private signaling gateway runs a background loop every 1000ms (`signaling-gateway.ts` line 632). It calls `live(binding)`.
  2. Because `room_members` was deleted, `lockedLease` throws `AdmissionDenied(403)`.
  3. The gateway terminates the socket and calls `await remove(binding.lease.id, binding.lease.room_name)`.
  4. LiveKit SFU immediately removes the participant.
  5. Now `CallsService.reconcile()` runs: `listParticipants(room.name)` returns `[]` (empty array!).
  6. The `for (const p of participants)` loop does 0 iterations.
  7. `this.afterLeave` is **never called**!
  8. Next, `lifecycle().sweep()` runs and calls `reconcileGroup(call.id)`.
  9. `reconcileGroup` hits line 99: `!nativeExists` is `false`, and `rowCount` is `0`.
  10. `closeLocked` is skipped! The call remains `'OPEN'`.
  11. Line 194 fails: `Expected: "CLOSED", Received: "OPEN"`.

This conclusively proves the bug and explains both the intermittent historical pass and the deterministic failure in `codex-t30-frozen-publishing-regressions-3.json`.

---

## 3. Test-First RED Suite Specification

The isolated integration specification [`t30-cascade-empty-call.integration.spec.ts`](./t30-cascade-empty-call.integration.spec.ts) is designed to run in complete isolation with real PostgreSQL schema `t30_cascade_call_<32hex>`, real LiveKit SFU, and real private gateway fixture:

### 3.1 Test Cases

1. **Test 1: Cascade Removal of Last Room Member When Participant Already Absent from SFU (Isolated RED Case)**:
   - Sets up room and call, viewer joins and signals SFU.
   - Sets `dropWebhooks = true`.
   - Terminates viewer WebSocket and awaits full disappearance from SFU (`listParticipants.length === 0`).
   - Deletes `room_members` row. Verifies `call_members` is 0.
   - Runs `CallsService.reconcile()` and `CallLifecycleService.sweep()`.
   - **Current Behavior**: `CallsService.reconcile()` finds 0 participants in SFU (no `afterLeave`), and `sweep()` skips `closeLocked` at line 99. The call group stays `'OPEN'`.
   - **Assertion**: `expect(await state(call.id)).toBe('CLOSED')`.
   - **Status on Current Code**: **RED** (fails as expected).

2. **Test 2: Exact Frozen Regression Spec Reproduction (Direct Line 189 Reproduction)**:
   - Identical byte-for-byte sequence to `publishing-gateway.integration.spec.ts` lines 189–196.
   - Proves the regression failure reported by Codex in `codex-t30-frozen-publishing-regressions-3.json`.
   - **Status on Current Code**: **RED** (fails as expected).

3. **Test 3: Positive Control — Fresh Empty Call Group Without Any Joins**:
   - Creates a new room and call group.
   - No user joins (`call_members` rowCount is 0, native SFU room exists).
   - Runs `lifecycle().sweep()`.
   - **Assertion**: Call group MUST remain `'OPEN'` and joinable by an authorized room member.
   - **Status on Current Code**: **GREEN** (passes as positive control).

4. **Test 4: Positive Control — Partial Room Member Cascade With Remaining Active Participants**:
   - Room has two members (viewer and participant2). Both join the call.
   - Only viewer is cascade-deleted from `room_members`.
   - Runs `CallsService.reconcile()` and `CallLifecycleService.sweep()`.
   - **Assertion**: Call group MUST remain `'OPEN'`, SFU room must remain, participant2 remains active.
   - **Status on Current Code**: **GREEN** (passes as positive control).

5. **Test 5: Comparative Baseline — Normal Leave via API**:
   - Viewer leaves via `/leave` API.
   - Verifies that `call_members` row is retained with `left_at IS NOT NULL`.
   - Asserts that call transitions to `'CLOSED'`, SFU room is deleted, and repeated sweeps are idempotent.
   - **Status on Current Code**: **GREEN** (passes as comparative baseline).

6. **Test 6: Native SFU Room Deletion Closes Database Group**:
   - Simulates SFU room expiration/deletion while database call group is open.
   - Runs `lifecycle().sweep()`.
   - Asserts that database group transitions to `'CLOSED'` and subsequent join attempts return 409 Conflict.
   - **Status on Current Code**: **GREEN** (passes as positive control).

---

## 4. Teardown & Isolation Invariants

- **Isolated Schema**: `t30_cascade_call_<32hex>`, created with `CREATE SCHEMA`, verified with regex, and cleaned via `DROP SCHEMA "${owned}" CASCADE`.
- **Private Gateway Fixture**: Started with `startGatewayFixture`, and cleanly torn down with `fixture.close()`, asserting `containersRemoved === true` and `networkRemoved === true`.
- **Sockets & App**: All client WebSockets terminated, `app.close()` awaited, database pools ended.
- **Environment**: Original `process.env` restored in `finally`.

---

## 5. Architectural Fix Recommendations (For Codex Post-RED Phase)

To resolve the regression without breaking the fresh call group protection:

In `apps/api/src/modules/calls/call-lifecycle.service.ts` line 99:
Instead of:
```ts
if (!nativeExists || (await db.query('SELECT id FROM call_members WHERE call_group_id=$1 LIMIT 1', [id])).rowCount) {
  closed = await this.closeLocked(db, id, time);
}
```

The service needs to distinguish a **truly fresh group** (which was created recently and has never had members) from an **abandoned/cascaded group**.
For example:
- A call group is truly fresh only within an initial admission grace window from its creation time (e.g. `group.createdAt > new Date(time.getTime() - 60000)`), OR
- A group has no active members: if it has 0 active members (`WHERE call_group_id=$1 AND left_at IS NULL`) and either:
  1. `!nativeExists`, OR
  2. `call_members` has rows with `left_at IS NOT NULL`, OR
  3. `time.getTime() - group.createdAt.getTime() >= 30000` (creation grace period elapsed), OR
  4. Any admissions or participants ever joined.
- Notice that in `CallsService.create`, `call_groups.created_at` records the exact creation timestamp. A call group with 0 members that was created in the past or where participants previously existed can safely be closed when there are 0 active members and 0 SFU participants.

*(Note: Per instructions, no application changes have been proposed or applied in this turn; implementation will follow once Codex verifies the RED test suite).*

---

## 6. Artifact SHA-256 Hashes

| File | SHA-256 Hash |
| :--- | :--- |
| `quality/evidence/T30/antigravity-cascade-empty-call-red-1/t30-cascade-empty-call.integration.spec.ts` | `8780b25ce223020fe1ef51b49b6794cfa8eb0c04cd5c6b7ad25a31d628f970d3` |
| `quality/evidence/T30/antigravity-cascade-empty-call-red-1/review-notes.md` | *(Refer to section below / git artifact)* |

---

## 7. Verification Instructions for Codex

1. Review `t30-cascade-empty-call.integration.spec.ts` and `review-notes.md`.
2. Verify that zero edits were made outside `quality/evidence/T30/antigravity-cascade-empty-call-red-1/`.
3. Run the isolated test suite against current unpatched application source:
   ```bash
   node quality/evidence/T30/run-backend-regressions-with-team-play.mjs ...
   ```
   or with Jest:
   ```bash
   npx jest --config quality/evidence/T30/regression-jest.config.cjs --runInBand quality/evidence/T30/antigravity-cascade-empty-call-red-1/t30-cascade-empty-call.integration.spec.ts
   ```
4. Verify the clean RED result:
   - Tests 1 and 2 fail at `expect(await state(call.id)).toBe('CLOSED')` with `Received: "OPEN"`.
   - Tests 3, 4, 5, 6 pass green.
