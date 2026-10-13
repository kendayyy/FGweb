# FG T30 — Cascade Empty Call Closure Source Proposal (`antigravity-cascade-empty-call-source-1`)

## 1. Executive Summary & Verification Context

- **Task**: FG T30 — Minimal Durable Server Lifecycle Fact to Resolve Cascade Empty Call Closure.
- **Scope**: Strictly confined to `quality/evidence/T30/antigravity-cascade-empty-call-source-1/{calls.service.ts, call-lifecycle.service.ts, review-notes.md}`.
- **Operating Constraints**: Sequential single-task execution, fixed Gemini 3.6 Flash (High), NO Anti2 (`NO-ANTI2-01`), no subagents. Proposal-only mode. Zero application source, `dist/`, runtime configs, migrations, ledger, or history files were modified. Zero tests, builds, or browser runs were executed by this agent.
- **Preceding Clean RED Verified**:
  - `cascade-empty-call-red-review-1.json` confirmed actual clean RED execution by Codex (`run-cascade-empty-call1.mjs`, exit code 1, `startedAt: 2026-10-11T04:16:30.061Z`, `completedAt: 2026-10-11T04:17:32.246Z`).
  - Result: 5 positive controls passed cleanly, 1 expected failure occurred:
    `callState: "OPEN", memberRows: 0, nativeRooms: 1, nativeParticipants: 0`.
  - Cleanup confirmed: `socketsTerminated: true, appClosed: true, containersRemoved: true, networkRemoved: true, schemaRemoved: true, poolEnded: true, environmentRestored: true, errorCount: 0`.
  - Participant batch optimizations (`liveLeases`, `participantDtos`) remain intact and GREEN (23/23 batch suite, 39/39 call controls API).

---

## 2. File Artifact Hashes & Exact Diffs

### 2.1 SHA-256 Hash Table

| File | Live Baseline SHA-256 | Proposed Proposal SHA-256 |
| :--- | :--- | :--- |
| `apps/api/src/modules/calls/calls.service.ts` | `13b05bbd3e8eed3384ef10aceb141817bd13267c7ba7ab8c40993c18ca69b531` | `71a9d1bf615b6b0bc213967b96a365f5d02ca0f49f0031138b2fc786149af227` |
| `apps/api/src/modules/calls/call-lifecycle.service.ts` | `a973561c611e35a8fd4e5cfb575923ceb5ad880a74ce0540afa3bfcb355c90fa` | `831a86a7efa2e226f1011e978fe8631391e9e5563681ee3c312e6ad4e2f0df7e` |

---

### 2.2 Exact Diff: `calls.service.ts`

```diff
--- apps/api/src/modules/calls/calls.service.ts
+++ quality/evidence/T30/antigravity-cascade-empty-call-source-1/calls.service.ts
@@ -126,6 +126,7 @@
    identity=`admission_${randomUUID()}`;
    await db.query("INSERT INTO call_admissions(id,call_member_id,session_id,expires_at) VALUES($1,$2,$3,clock_timestamp()+interval '60 seconds')",[identity,memberId,session]);
   }
+  await db.query('INSERT INTO webhook_events(id,event_id,event_type,payload) VALUES($1,$2,$3,$4) ON CONFLICT(event_id) DO NOTHING',[randomUUID(),`fg:admission-committed:${id}`,'FG_ADMISSION_COMMITTED',JSON.stringify({callId:id})]);
   await config.client.createRoom({name:`fg-call_${id}`,maxParticipants:10,emptyTimeout:300,departureTimeout:30});
   const token=new AccessToken(config.key,config.secret,{identity,ttl:60});
   const sources=await publicationSources(db,{call_group_id:id,user_id:user});token.addGrant({roomJoin:true,room:`fg-call_${id}`,canSubscribe:true,canPublish:sources.length>0,canPublishSources:sources,canPublishData:false,canUpdateOwnMetadata:false});
```

- Exactly **1 line added** inside the canonical `Calls.join` transaction, immediately after successful admission checks and allocations.
- All other methods (`onModuleInit`, `onModuleDestroy`, `config`, `transaction`, `actor`, `room`, `dto`, `create`, `list`, `controlsGroup`, `participantDtos`, `participants`, `selfMic`, `release`, `leave`, `revokeSession`, `sessionDeleted`, `reconcile`, `withControlGroup`, `requireAdmission`, `grantForAdmission`, `syncNativePermissions`, `muteNativeTrack`, `revokeMemberWithin`, `finishModeration`) are 100% byte-preserved.

---

### 2.3 Exact Diff: `call-lifecycle.service.ts`

```diff
--- apps/api/src/modules/calls/call-lifecycle.service.ts
+++ quality/evidence/T30/antigravity-cascade-empty-call-source-1/call-lifecycle.service.ts
@@ -96,7 +96,9 @@
    await this.publishing.reconcileWithin(db,id,participants,time,ended);
    // A newly created group has no joined/reserved members yet. It must stay
    // available for the first admission, rather than closing in its first sweep.
-   if(!nativeExists||(await db.query('SELECT id FROM call_members WHERE call_group_id=$1 LIMIT 1',[id])).rowCount)closed=await this.closeLocked(db,id,time);
+   // An empty group with native presence is eligible to close if historical members
+   // were retained or a matching internal committed-admission marker is present.
+   if(!nativeExists||(await db.query('SELECT id FROM call_members WHERE call_group_id=$1 LIMIT 1',[id])).rowCount||(await db.query("SELECT id FROM webhook_events WHERE event_id=$1 AND event_type='FG_ADMISSION_COMMITTED' LIMIT 1",[`fg:admission-committed:${id}`])).rowCount)closed=await this.closeLocked(db,id,time);
   });
   if(closed)await this.deleteNative(id);
  }
```

- Exactly **1 code line amended** in `CallLifecycleService.reconcileGroup`, updating the final closure eligibility guard.
- All other methods (`setClock`, `onModuleInit`, `onModuleDestroy`, `configured`, `native`, `transaction`, `lock`, `release`, `closeLocked`, `deleteNative`, `closeIfEmpty`, `receive`, `sweep`) are 100% byte-preserved.

---

## 3. Why the Source Proposal Resolves the RED Failure

### 3.1 The Failure Sequence (RED Mechanism)
1. When a user joins a call group, rows are allocated in `call_members` and `call_admissions`.
2. When the user's room membership is revoked or deleted (`DELETE FROM room_members WHERE room_id = $1 AND user_id = $2`), PostgreSQL triggers foreign key constraint `call_members_room_member_fk` with `ON DELETE CASCADE`.
3. The row in `call_members` is **physically removed** from the database (resulting in `0` total rows).
4. If the native SFU participant was evicted prior to `CallsService.reconcile()` (via signaling gateway periodic eviction or network disconnection), `CallsService.reconcile()` finds 0 participants in SFU and never invokes `this.afterLeave?.(id)` (`closeIfEmpty`).
5. Execution proceeds to `CallLifecycleService.sweep()`, which executes `reconcileGroup(id)`.
6. In `reconcileGroup`:
   - `nativeExists` is `true` (SFU room `fg-call_<id>` remains alive).
   - `(SELECT id FROM call_members WHERE call_group_id = $1 LIMIT 1).rowCount` is `0` (cascaded away).
   - The original guard `if (!nativeExists || rowCount)` evaluated to `false || 0 === false`.
   - `closeLocked` was skipped because the code erroneously treated the group as a "fresh newly created group that has never had any joins".
   - The empty call remained in state `'OPEN'` indefinitely.

### 3.2 How the Proposal Resolves It
1. During `Calls.join`, immediately upon completing admission checks, the transaction inserts a durable lifecycle marker into the existing `webhook_events` table:
   - `event_id`: `'fg:admission-committed:' + id`
   - `event_type`: `'FG_ADMISSION_COMMITTED'`
   - `payload`: `JSON.stringify({callId: id})`
   - `ON CONFLICT(event_id) DO NOTHING`
2. When all room members are cascade-deleted:
   - `call_members` has 0 rows.
   - `nativeExists` is `true`.
   - `reconcileGroup` evaluates:
     `!nativeExists || rowCount || (SELECT id FROM webhook_events WHERE event_id = $1 AND event_type = 'FG_ADMISSION_COMMITTED' LIMIT 1).rowCount`
     Evaluating: `false || 0 || 1 === true`.
3. Because the marker is present, `reconcileGroup` recognizes that this call group had a committed admission in its history and is **not** a fresh never-joined call.
4. It calls `this.closeLocked(db, id, time)`.
5. `closeLocked` verifies `SELECT id FROM call_members WHERE call_group_id=$1 AND left_at IS NULL LIMIT 1` returns 0 rows (no active members).
6. It transitions `call_groups.state` to `'CLOSED'`, records `ended_at = time`, and invokes `this.deleteNative(id)`.
7. The call group closes cleanly and the SFU room is deleted, exactly satisfying the assertion that failed under RED.

---

## 4. Preservation of Invariants & Positive Controls

1. **Truly Fresh Call Groups (Positive Control 3)**:
   - A newly created call group (`CallsService.create`) has `call_members` rowCount = 0.
   - It has no `fg:admission-committed:<group>` marker in `webhook_events`.
   - `nativeExists` is `true`.
   - In `reconcileGroup`:
     `!nativeExists (false) || call_members (0) || marker (0)` evaluates to `false`.
   - `closeLocked` is skipped. The freshly created group **remains `OPEN` and joinable** across all sweeps.
2. **Active Multi-Participant Groups with Partial Cascade (Positive Control 4)**:
   - If participant A is cascade-deleted but participant B remains active:
     In `closeLocked`: `SELECT id FROM call_members WHERE call_group_id=$1 AND left_at IS NULL LIMIT 1` returns 1 (participant B).
     `closeLocked` returns `false`.
     The call group **remains `OPEN`**.
3. **Disconnected Grace Period (30-second window)**:
   - When a participant disconnects, `left_at` is NOT set until 30 seconds elapse.
   - In `closeLocked`: `left_at IS NULL` returns 1 during the grace window.
   - `closeLocked` returns `false`. The call group **remains `OPEN`** during the disconnect grace period.
4. **Normal Leave via API (Positive Control 5)**:
   - Normal leave sets `left_at = now()`. The row is preserved.
   - `(call_members query).rowCount` is 1.
   - In `closeLocked`: `left_at IS NULL` returns 0.
   - The group closes cleanly as before.
5. **Native Room Outage / Absence (Positive Control 6)**:
   - If the native room is deleted or expires on SFU, `!nativeExists` is `true`.
   - The group closes cleanly as before.

---

## 5. Storage Semantics & Separation Analysis

### 5.1 Using the Existing `webhook_events` Table
- The `webhook_events` table schema:
  - `id`: `text` primary key
  - `event_id`: `text` unique index (`webhook_events_event_id_unique`)
  - `event_type`: `text`
  - `payload`: `text`
  - `processed_at`: `timestamp with time zone` default `now()`
- **Namespacing & Zero Collision**:
  - LiveKit native webhook events use UUID format strings for `event_id` (e.g. `randomUUID()`) and lowercase snake_case strings for `event_type` (`participant_joined`, `participant_left`, `track_published`).
  - Our internal marker uses:
    - `event_id`: `'fg:admission-committed:' + id` (explicit prefix with call group UUID).
    - `event_type`: `'FG_ADMISSION_COMMITTED'` (explicit uppercase prefix).
  - The deterministic prefix guarantees zero collision with any LiveKit native event ID.
- **Transactional Atomicity & Rollback**:
  - The marker is written using the same `db: PoolClient` within the `Calls.join` transaction.
  - If anything fails downstream (e.g. `createRoom`, `publicationSources`, `this.actor` session verification, or `CallJoinSchema.parse`), the entire transaction executes `ROLLBACK`.
  - The marker is rolled back alongside all other mutations. No orphan marker is ever persisted on a failed join.
- **Idempotency**:
  - `ON CONFLICT(event_id) DO NOTHING` ensures that multiple admissions or re-joins to the same call group do not duplicate rows or throw unique constraint violations.
- **Privacy & Least Privilege**:
  - `payload`: `JSON.stringify({callId: id})`.
  - Zero tokens, session tokens, user IDs, or cookies are stored.
  - The marker confers no join grants, no subscribe/publish permissions, and no native access. It is exclusively an internal lifecycle fact.

### 5.2 Legacy Native Signed Webhook Receipts Consideration
- In systems where calls were created and joined prior to this code change (where `fg:admission-committed:*` was not inserted during `join`), native signed `participant_joined` webhooks (if processed and stored in `webhook_events`) also contain `payload: JSON.stringify({callId: id})` with `event_type = 'participant_joined'`.
- A query such as:
  `EXISTS (SELECT 1 FROM webhook_events WHERE event_type = 'participant_joined' AND payload->>'callId' = $1)`
  could theoretically serve as historical evidence.
- **Why it was omitted from the code proposal**:
  As instructed, we do not silently widen the code condition. Native webhooks may be dropped (e.g. `dropWebhooks = true` during outages or network faults), whereas the transactional `FG_ADMISSION_COMMITTED` marker is synchronous, deterministic, and completely immune to external network delivery faults.

---

## 6. Retention & Operational Limitations (Honest Disclosure)

1. **Table Retention / Pruning Policies**:
   - If a background job or maintenance script prunes `webhook_events` based on `processed_at` age (e.g. deleting events older than 7 days), it must **not** delete rows with `event_type = 'FG_ADMISSION_COMMITTED'` while their corresponding `call_groups.state` is `'OPEN'`.
   - Pruning queries should restrict deletion to:
     `DELETE FROM webhook_events WHERE processed_at < now() - interval '7 days' AND (event_type != 'FG_ADMISSION_COMMITTED' OR event_id IN (SELECT 'fg:admission-committed:' || id FROM call_groups WHERE state = 'CLOSED'))`
2. **No Backdating or Overloading**:
   - This proposal does not touch or backdate `call_groups.created_at`.
   - It does not overload `call_groups.ended_at` or `state`.
   - It does not rely on transient in-memory sets or server process uptime.

---

## 7. Verification Tests for Codex Prior to Adoption

Before adopting these proposed files, Codex must add and execute the following unit and integration assertions:

1. **Transaction Rollback Test**:
   - Initiate a join that fails validation (e.g. un-onboarded user, full capacity, or simulated error after admission check).
   - Assert `SELECT 1 FROM webhook_events WHERE event_id = 'fg:admission-committed:' || $1` returns **0 rows**.
2. **Idempotent Multi-Join Test**:
   - Two users join the same call group sequentially.
   - Assert `SELECT count(*) FROM webhook_events WHERE event_id = 'fg:admission-committed:' || $1` returns **exactly 1**.
3. **Clean Cascade Closure (Resolves RED)**:
   - Run the isolated suite `t30-cascade-empty-call.integration.spec.ts` against the patched code.
   - Verify that all 6 tests pass (6/6 GREEN).
4. **Frozen Publishing Regressions Suite Verification**:
   - Run `quality/evidence/T30/run-backend-regressions-with-team-play.mjs publishing publishing-gateway`.
   - Verify that all 27 tests in `publishing-gateway.integration.spec.ts` pass (27/27 GREEN), specifically resolving line 194.
5. **Calls Participant Batch Suite Regression**:
   - Verify that the 23 participant lease batch tests remain 23/23 GREEN.

---

> [!NOTE]
> This proposal does NOT claim six GREEN, frozen 27 pass, or native build success at this time. Adoption, full test execution, headed UI/E2E verification, and Telegram bridge dispatch are reserved for Codex gate review.
