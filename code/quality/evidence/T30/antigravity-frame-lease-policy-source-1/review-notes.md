# T30 Frame Lease Policy Combined Query Source Implementation Proposal

**Task**: FG T30 — Frame Lease Policy Combined Query Source Implementation Proposal  
**Directory**: `quality/evidence/T30/antigravity-frame-lease-policy-source-1/`  
**Reviewer/Auditor**: Codex  
**Agent**: Antigravity (Gemini 3.6 Flash - High, sequential source proposal mode, no Anti2 / no subagents)  
**Date**: 2026-10-11  

---

## 1. Context & Scope

This proposal implements the candidate `liveLeaseWithPolicy` helper in `lease-store.ts` and its single-call consumption within `processBatch` in `signaling-gateway.ts` following clean RED verification by Codex in `codex-t30-frame-lease-policy-red-4.json` (4 control tests PASS, 7 candidate tests failing solely due to the absent helper).

- **Strict Proposal Only**: Zero modifications have been applied to live application files (`apps/`), packages, task ledger (`quality/tasks.json`), or session history (`.doc/history.md`).
- **No Predictive Claims**: This is a narrow query-consolidation proposal; no claims of timing guarantees, latency fixes, or test PASS are made.

---

## 2. Guard & Policy Parity Review

### 2.1 `lease-store.ts` Implementation
- **Byte-for-Byte Prefix Preservation**: Lines 1–51 of `apps/api/src/modules/calls/lease-store.ts` (`liveLease`, `publicationSources`, `publicationPermission`, `liveLeases`) remain completely untouched.
- **Single Fresh Real SQL Query**: `liveLeaseWithPolicy(db, id)` executes exactly one parameterized PostgreSQL query per invocation, including empty or unknown IDs.
- **Verbatim Lease SELECT Fields & Guards**:
  - Exact projected lease fields: `a.id`, `m.user_id`, `a.session_id`, `m.call_group_id`, `m.room_id`, `'fg-call_'||m.call_group_id AS room_name`, `s.expires_at AT TIME ZONE 'UTC' AS session_expires_at`.
  - Verbatim JOINs: `call_admissions a JOIN call_members m ON m.id=a.call_member_id JOIN call_groups c ON c.id=m.call_group_id AND c.room_id=m.room_id JOIN room_members rm ON rm.room_id=m.room_id AND rm.user_id=m.user_id JOIN session s ON s.id=a.session_id AND s.user_id=m.user_id JOIN profiles p ON p.user_id=m.user_id`.
  - Verbatim WHERE predicates & server-clock checks: `a.id=$1`, `a.revoked_at IS NULL`, `a.expires_at>clock_timestamp()`, `m.left_at IS NULL`, `c.state='OPEN'`, `s.expires_at>clock_timestamp() AT TIME ZONE 'UTC'`, `(a.disconnected_at IS NULL OR a.disconnected_at>clock_timestamp()-interval '30 seconds')`, `EXISTS(SELECT 1 FROM game_interests g WHERE g.user_id=m.user_id)`, and `COALESCE((SELECT action FROM admin_actions ... ORDER BY created_at DESC,id DESC LIMIT 1),'UNBAN')<>'BAN'`.
- **Correlated Policy Subqueries**:
  - `mic_blocked`: `EXISTS(SELECT 1 FROM call_restrictions cr WHERE cr.call_group_id=m.call_group_id AND cr.target_user_id=m.user_id AND cr.restriction_type='MIC_MUTED')`
  - `screen_blocked`: `EXISTS(SELECT 1 FROM call_restrictions cr WHERE cr.call_group_id=m.call_group_id AND cr.target_user_id=m.user_id AND cr.restriction_type='STREAM_BLOCKED')`
  - `reserved`: `EXISTS(SELECT 1 FROM call_publish_slots ps WHERE ps.call_group_id=m.call_group_id AND ps.user_id=m.user_id)`
- **Unique Prepared Statement**: Named `'fg_live_call_admission_policy_v1'`.
- **Source Derivation & Ordering**:
  - `if (!row.mic_blocked) sources.push(TrackSource.MICROPHONE);`
  - `if (row.reserved && !row.screen_blocked) { sources.push(TrackSource.SCREEN_SHARE); if (!row.mic_blocked) sources.push(TrackSource.SCREEN_SHARE_AUDIO); }`
  - Strict exclusion of screen share audio while microphone is restricted.
- **Output Encapsulation**: Returns `{ lease: LiveLease, permission: { canSubscribe: true, canPublish: boolean, canPublishSources: TrackSource[], canPublishData: false, canUpdateMetadata: false } } | undefined`. Leaks zero policy boolean columns into `lease`.

### 2.2 `signaling-gateway.ts` Implementation
- **Import Addition**: Added `liveLeaseWithPolicy` to existing import line 8 without changing other imported symbols.
- **Smallest Replacement inside `processBatch`**:
  - For EVERY frame in the batch (including frame 0), replaces the sequential calls to `liveLease` and `publicationPermission` with a single call to `await liveLeaseWithPolicy(db, binding.lease.id)`.
  - Enforces `if (!check || check.lease.room_name !== binding.lease.room_name) throw new AdmissionDenied(403);`.
  - Assigns `binding.lease = current` where `current = check.lease`.
  - Sets fresh `permission = check.permission`.
- **Invariants Preserved**:
  - All initial/current `lockedLease` guards, room/group locks (`SELECT id FROM rooms ... FOR SHARE`, `SELECT id FROM call_groups ... FOR SHARE`), `BEGIN`/`SET LOCAL TIME ZONE 'UTC'`/`COMMIT` transactions remain untouched.
  - Zero modifications to any methods outside `processBatch` and line 8 import.
  - Zero modifications to deadlines, connection pool settings (`16/16`, `statement_timeout: 3000`), or native SFU communication boundaries.

---

## 3. Exact Source Diffs

### 3.1 Diff for `apps/api/src/modules/calls/lease-store.ts`
```diff
--- a/apps/api/src/modules/calls/lease-store.ts
+++ b/apps/api/src/modules/calls/lease-store.ts
@@ -51,0 +52,65 @@
+
+/** Single fresh SQL query combining lease verification with current publication policy. */
+export async function liveLeaseWithPolicy(
+  db: Pool | PoolClient,
+  id: string
+): Promise<
+  | {
+      lease: LiveLease;
+      permission: {
+        canSubscribe: boolean;
+        canPublish: boolean;
+        canPublishSources: TrackSource[];
+        canPublishData: boolean;
+        canUpdateMetadata: boolean;
+      };
+    }
+  | undefined
+> {
+  const row = (
+    await db.query<{
+      id: string;
+      user_id: string;
+      session_id: string;
+      call_group_id: string;
+      room_id: string;
+      room_name: string;
+      session_expires_at: Date;
+      mic_blocked: boolean;
+      screen_blocked: boolean;
+      reserved: boolean;
+    }>({
+      name: 'fg_live_call_admission_policy_v1',
+      text: `SELECT a.id,m.user_id,a.session_id,m.call_group_id,m.room_id,
+  'fg-call_'||m.call_group_id AS room_name,s.expires_at AT TIME ZONE 'UTC' AS session_expires_at,
+  EXISTS(SELECT 1 FROM call_restrictions cr WHERE cr.call_group_id=m.call_group_id AND cr.target_user_id=m.user_id AND cr.restriction_type='MIC_MUTED') AS mic_blocked,
+  EXISTS(SELECT 1 FROM call_restrictions cr WHERE cr.call_group_id=m.call_group_id AND cr.target_user_id=m.user_id AND cr.restriction_type='STREAM_BLOCKED') AS screen_blocked,
+  EXISTS(SELECT 1 FROM call_publish_slots ps WHERE ps.call_group_id=m.call_group_id AND ps.user_id=m.user_id) AS reserved
+  FROM call_admissions a JOIN call_members m ON m.id=a.call_member_id
+  JOIN call_groups c ON c.id=m.call_group_id AND c.room_id=m.room_id
+  JOIN room_members rm ON rm.room_id=m.room_id AND rm.user_id=m.user_id
+  JOIN session s ON s.id=a.session_id AND s.user_id=m.user_id
+  JOIN profiles p ON p.user_id=m.user_id
+  WHERE a.id=$1 AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp()
+  AND m.left_at IS NULL AND c.state='OPEN' AND s.expires_at>clock_timestamp() AT TIME ZONE 'UTC'
+  AND (a.disconnected_at IS NULL OR a.disconnected_at>clock_timestamp()-interval '30 seconds')
+  AND EXISTS(SELECT 1 FROM game_interests g WHERE g.user_id=m.user_id)
+  AND COALESCE((SELECT action FROM admin_actions WHERE target_user_id=m.user_id AND action IN('BAN','UNBAN') ORDER BY created_at DESC,id DESC LIMIT 1),'UNBAN')<>'BAN'`,
+      values: [id],
+    })
+  ).rows[0];
+  if (!row) return undefined;
+  const sources: TrackSource[] = [];
+  if (!row.mic_blocked) sources.push(TrackSource.MICROPHONE);
+  if (row.reserved && !row.screen_blocked) {
+    sources.push(TrackSource.SCREEN_SHARE);
+    if (!row.mic_blocked) sources.push(TrackSource.SCREEN_SHARE_AUDIO);
+  }
+  return {
+    lease: {
+      id: row.id,
+      user_id: row.user_id,
+      session_id: row.session_id,
+      call_group_id: row.call_group_id,
+      room_id: row.room_id,
+      room_name: row.room_name,
+      session_expires_at: row.session_expires_at,
+    },
+    permission: {
+      canSubscribe: true,
+      canPublish: sources.length > 0,
+      canPublishSources: sources,
+      canPublishData: false,
+      canUpdateMetadata: false,
+    },
+  };
+}
```

### 3.2 Diff for `apps/api/src/modules/calls/signaling-gateway.ts`
```diff
--- a/apps/api/src/modules/calls/signaling-gateway.ts
+++ b/apps/api/src/modules/calls/signaling-gateway.ts
@@ -8,1 +8,1 @@
-import {liveLease,publicationSources,publicationPermission,type LiveLease} from './lease-store.js';
+import {liveLease,publicationSources,publicationPermission,liveLeaseWithPolicy,type LiveLease} from './lease-store.js';
@@ -364,9 +364,6 @@
-        // Fresh liveLease check before EVERY frame under shared canonical room/group transaction
-        const current = await liveLease(db, binding.lease.id);
-        if (!current || current.room_name !== binding.lease.room_name) {
+        // Fresh liveLeaseWithPolicy check before EVERY frame under shared canonical room/group transaction
+        const check = await liveLeaseWithPolicy(db, binding.lease.id);
+        if (!check || check.lease.room_name !== binding.lease.room_name) {
           throw new AdmissionDenied(403);
         }
+        const current = check.lease;
         binding.lease = current;
-
-        // Fresh publicationPermission check before EVERY frame under transaction
-        const permission = await publicationPermission(db, current);
+        const permission = check.permission;
```

---

## 4. Artifacts & Hashes

| Artifact | Location | SHA-256 | Purpose |
|---|---|---|---|
| `lease-store.ts` | `quality/evidence/T30/antigravity-frame-lease-policy-source-1/` | `4e3cc01601e36d8e3def6726fec49d7da9c52c690476971c246b4b2bc01605a5` | Full candidate `lease-store.ts` with appended `liveLeaseWithPolicy` |
| `signaling-gateway.ts` | `quality/evidence/T30/antigravity-frame-lease-policy-source-1/` | `a51fde9f7bf3a632ac06ecf510449404451fa44a77a5500c27fe6759edf58d41` | Full candidate `signaling-gateway.ts` with `liveLeaseWithPolicy` in `processBatch` |
| `review-notes.md` | `quality/evidence/T30/antigravity-frame-lease-policy-source-1/` | Document self | Technical documentation and exact source diffs |

---

## 5. Next Steps for Codex Review
1. Review the proposed source implementations and exact diffs against baseline.
2. Adopt the changes into `apps/api/src/modules/calls/{lease-store.ts, signaling-gateway.ts}` via the strict scope checker gate.
3. Rerun `frame-lease-policy-tests3/t30-frame-lease-policy.integration.spec.ts` to verify that all 11 tests transition from RED (4 pass, 7 fail) to GREEN (11 pass).
4. Execute subsequent build and headed acceptance verification.
