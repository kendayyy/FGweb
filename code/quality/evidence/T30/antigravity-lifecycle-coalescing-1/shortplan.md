# CallLifecycleService Coalescing Implementation & Regression Plan (antigravity-lifecycle-coalescing-1)

## 1. Executive Summary & Context

Root reviewed and executed the intended TDD RED probe (`lifecycle-red-probe-result-review1.json` exited with code 1, `expectedRed=true`, 10 normal plus probe checks, 4 requested / 4 completed reconcile calls, 4 listRooms + 4 listParticipants native reads, real PostgreSQL blocking samples observed, all cleanup and FG resources verified clean).

This proposal delivers:
1. **Minimal proposed `CallLifecycleService` implementation** (`call-lifecycle.service.ts`):
   - Preserves the original `reconcileGroup` body as an **unchanged `reconcilePass` helper** (byte reversal proves original body is 100% byte-identical except for function name).
   - Implements per-group ordinary reconcile coalescing for fixed bursts (current in-flight pass + fresh trailing pass).
   - Guarantees each distinct screen-ended `{identity, at}` event executes its own canonical reconciliation (never batched into existing `PublishingService.reconcileWithin` API which accepts one).
   - Cleanly drains all in-flight passes and queued ended events on `onModuleDestroy` before `pool.end()`.
2. **Byte-reversal and invariant verification script** (`prepare-coalescing-proposal.mjs`).
3. **Additive regression test harness** (`test-lifecycle-coalescing.mjs`) covering all 7 required regression controls.
4. **Strict Safety Boundary**: Zero changes have been applied to `apps/`, `tests/`, builds, or ledger. All proposals reside exclusively within `quality/evidence/T30/antigravity-lifecycle-coalescing-1/**`. `nativeAcceptance: false` is maintained.

---

## 2. Exact Source Pins

- **Original Source**:
  - Path: `apps/api/src/modules/calls/call-lifecycle.service.ts`
  - SHA256: `425de19a1f3c14f9da6c17e2fd6781f8d5bca310a80566d6311e370d8682a865`
- **Compiled Source**:
  - Path: `apps/api/dist/modules/calls/call-lifecycle.service.js`
  - SHA256: `7440b21cf469f64fbc188525d6deda2401b74e7a3f5942e082a3971b69972260`
- **Proposed Backend Replacement**:
  - Path: `quality/evidence/T30/antigravity-lifecycle-coalescing-1/call-lifecycle.service.ts`
- **Proposed Future Regression Test Target**:
  - Target Path: `apps/api/test/call-lifecycle.coalescing.spec.ts` (to be applied by root through stockgate after review)
  - Proposal Harness: `quality/evidence/T30/antigravity-lifecycle-coalescing-1/test-lifecycle-coalescing.mjs`

---

## 3. Byte Reversal Proof: Original Body as `reconcilePass`

The proposed `CallLifecycleService` retains the entire original `reconcileGroup` body as `reconcilePass`:
```typescript
 private async reconcilePass(id:string,ended?:{identity:string;at:number}){
  const time=new Date(this.clock()),native=this.native();let closed=false;
  await this.transaction(async db=>{
   const group=await this.lock(db,id);if(!group)return;
   if(group.state==='CLOSED'){this.publishing.forget(id);closed=true;return;}
   const name=`fg-call_${id}`,nativeExists=Boolean((await native.listRooms([name])).length);
   let participants:ParticipantInfo[]=[];if(nativeExists)try{participants=await native.listParticipants(name);}catch(error){if(!gone(error))throw error;}
   const present=new Set(participants.filter(p=>p.state!==ParticipantInfo_State.DISCONNECTED).map(p=>p.identity));
   const members=(await db.query(`SELECT m.id,m.user_id,a.id AS lease_id,a.connected_at,a.disconnected_at,a.expires_at,a.revoked_at
    FROM call_members m LEFT JOIN call_admissions a ON a.call_member_id=m.id AND a.revoked_at IS NULL WHERE m.call_group_id=$1 AND m.left_at IS NULL FOR UPDATE OF m`,[id])).rows;
   const released:string[]=[];
   for(const member of members){
    if(!member.lease_id||!await liveLease(db,member.lease_id)){released.push(member.id);continue;}
    if(present.has(member.lease_id)){
     await db.query('UPDATE call_admissions SET connected_at=COALESCE(connected_at,$2),disconnected_at=NULL WHERE id=$1 AND revoked_at IS NULL AND (connected_at IS NULL OR disconnected_at IS NOT NULL)',[member.lease_id,time]);continue;
    }
    if(member.connected_at){
     if(!member.disconnected_at)await db.query('UPDATE call_admissions SET disconnected_at=$2 WHERE id=$1 AND disconnected_at IS NULL AND revoked_at IS NULL',[member.lease_id,time]);
     else if(time.getTime()-member.disconnected_at.getTime()>=30000)released.push(member.id);
    }else if(member.expires_at.getTime()<=time.getTime())released.push(member.id);
   }
   await this.release(db,released,time);
   await this.publishing.reconcileWithin(db,id,participants,time,ended);
   if(!nativeExists||(await db.query('SELECT id FROM call_members WHERE call_group_id=$1 LIMIT 1',[id])).rowCount||(await db.query("SELECT id FROM webhook_events WHERE event_id=$1 AND event_type='FG_ADMISSION_COMMITTED' LIMIT 1",[`fg:admission-committed:${id}`])).rowCount)closed=await this.closeLocked(db,id,time);
  });
  if(closed)await this.deleteNative(id);
 }
```
- **Reversal Proof**: Substituting `reconcilePass` back to `reconcileGroup` yields the exact original characters of lines 74–104 of `apps/api/src/modules/calls/call-lifecycle.service.ts`.
- **Zero Drift**: Transaction boundaries, SQL row locks (`rooms FOR UPDATE`, `call_groups FOR UPDATE`, `FOR UPDATE OF m`), `liveLease` checks, `clock()` usage, 30s grace period, and native media RPCs inside the transaction remain 100% intact.

---

## 4. Coalescing Mechanism & Edge Case Analysis

### 1. Per-Group Ordinary Trigger Coalescing
- Managed via `private readonly coalescers = new Map<string, GroupRunner>()`.
- When an ordinary trigger (`ended === undefined`) arrives for group `id`:
  - Enqueues a `Deferred` into `runner.pendingOrdinary`.
  - If `runner.running` is false, marks `runner.running = true` and launches `this.runGroup(id, runner)`.
  - If `runner.running` is true, the trigger returns its promise and joins the queue.
- In `runGroup`:
  - Snapshots `batch = runner.pendingOrdinary; runner.pendingOrdinary = [];`.
  - Executes `await this.reconcilePass(id)`.
  - Upon completion: resolves all callers in `batch`.
  - Checks if new triggers arrived in `runner.pendingOrdinary` while the pass was running:
    - If YES: continues the loop and executes a **fresh trailing pass**.
    - If NO: finishes the loop and deletes the map entry.
- **Fixed Burst Guarantee**: For a fixed burst of $N$ triggers arriving during an active pass, work is strictly bounded to at most **2 passes** (the in-flight pass + 1 fresh trailing pass).
- **No Lost Wakeups**: If triggers continue to arrive during the trailing pass, subsequent passes run fresh. The queue snapshotting before pass execution guarantees no trigger is overlooked.

### 2. Screen-Ended Event Preservation
- `ended` events contain `{ identity: string; at: number }` from `track_unpublished` of `SCREEN_SHARE`.
- Existing `PublishingService.reconcileWithin` accepts only a single optional `ended` object.
- **Rule**: Distinct ended events are enqueued in `runner.pendingEnded` and popped individually. Each executes its own canonical `await this.reconcilePass(id, ended)`.
- No ended event is batched, dropped, or deduplicated away.

### 3. Error Identity & Resilience
- If `reconcilePass` rejects with `err`:
  - All callers in `batch` reject with the exact same error (`d.reject(err)`).
  - Error identity is fully preserved.
  - Failures do not permanently corrupt or pin the map. If queues empty, the map entry is removed so subsequent sweeps or retried signed webhooks run fresh.

### 4. Shutdown & Drain (`onModuleDestroy`)
- Sets `this.closing = true`.
- Clears periodic timer (`clearInterval(this.timer)`).
- Awaits background sweep (`await this.running`).
- Drains all active in-flight runners and queued ended-event jobs (`while (this.inFlight.size > 0) await Promise.allSettled(...)`).
- Requests arriving after `closing === true` are rejected immediately with 503 (`HttpException: Service shutting down`), preventing fresh work from starting against a closed pool.
- Closes the PostgreSQL pool (`await this.pool?.end()`).

---

## 5. Strict Invariants Preserved

1. **Lock Modes**: `SELECT id FROM rooms WHERE id=$1 FOR UPDATE` and `SELECT id, room_id, state FROM call_groups WHERE id=$1 FOR UPDATE` remain strictly exclusive (no `SHARE` relaxation).
2. **Transaction Boundaries**: Remote LiveKit SFU RPCs (`listRooms`, `listParticipants`) remain strictly inside the transaction as originally designed.
3. **Validations & Policies**: `actor()`, `liveLease()`, 30s grace period, 3s request timeout, 1000ms sweep interval, and pool settings (max 8, 5s timeout, 15s statement timeout) remain completely unchanged.
4. **Authority & Deadlines**: 45000ms test deadline and 5s assertion deadlines remain immutable.

---

## 6. Additive Regression Controls Summary (`test-lifecycle-coalescing.mjs`)

The test-only regression harness validates 7 deterministic controls against the actual service class:

| Control | Description | Validation Criteria |
|---|---|---|
| **CTL-01** | Fixed Ordinary Burst Bounded | 4 concurrent ordinary triggers result in $\le 2$ `listRooms` calls; all 4 callers resolve. |
| **CTL-02** | Multi-Group Independence | Concurrent triggers on group 1 and group 2 execute independent passes without cross-suppression ($\ge 2$ total reads). |
| **CTL-03** | No Lost Wakeup During Trailing | Trigger arriving during trailing pass triggers a third fresh pass; all callers resolve. |
| **CTL-04** | Distinct Ended Event Runs | Two distinct screen-ended events each execute their own canonical reconciliation pass ($\ge 2$ passes). |
| **CTL-05** | Error Identity & Recovery | Native SDK failure rejects all concurrent callers with exact error; subsequent call recovers cleanly. |
| **CTL-06** | Signed Duplicate Webhooks | Duplicate signed webhooks both trigger reconciliation cleanly (`receive()` durable insert pipeline intact). |
| **CTL-07** | Shutdown Drain Integrity | `onModuleDestroy` drains in-flight and queued passes cleanly; requests during shutdown rejected without pool errors. |

---

## 7. Root Review & Stockgate Instructions

Root can review and verify the proposed implementation using:
```powershell
# 1. Verify exact source pins, invariant preservation, and byte reversal
node quality/evidence/T30/antigravity-lifecycle-coalescing-1/prepare-coalescing-proposal.mjs

# 2. Run the 7 regression controls against the actual service class
node quality/evidence/T30/antigravity-lifecycle-coalescing-1/test-lifecycle-coalescing.mjs
```

Following root scope rebaseline and review:
- Proposed backend file to be copied: `apps/api/src/modules/calls/call-lifecycle.service.ts`.
- Proposed regression test target: `apps/api/test/call-lifecycle.coalescing.spec.ts`.
