# FG T30 — Publishing Fresh Policy Single-Query Proposal Plan

## 1. Scope and Objective

This proposal delivers an isolated, conservative optimization that replaces the sequential double-query pattern in publishing peer reconciliation with a single fresh database query. 

### Explicit Non-Claims and Deferrals
- **No Speculative Performance Claims:** This plan makes no claims of eliminating all concurrency races, achieving a fixed 60% lock latency reduction, or guaranteeing that contention remains strictly below the 3,000 ms threshold across arbitrary loads.
- **Admission Batching Deferred:** Batching of admission `UPDATE` queries in `CallLifecycleService` is deferred entirely. `apps/api/src/modules/calls/call-lifecycle.service.ts` remains completely untouched.
- **Lease Store Unchanged:** `apps/api/src/modules/calls/lease-store.ts` already contains the audited, tested helper `liveLeaseWithPolicy` and remains unchanged.

---

## 2. Exact Changes Proposed

### A. `apps/api/src/modules/calls/calls.service.ts`
1. **Import Update:**
   Add `liveLeaseWithPolicy` to imports from `./lease-store.js`.
2. **Shared Private Helper:**
   Add `applyNativePermissionUpdate`:
   ```typescript
   private async applyNativePermissionUpdate(
     native: RoomServiceClient,
     roomName: string,
     identity: string,
     peer: ParticipantInfo,
     permission: {
       canSubscribe: boolean;
       canPublish: boolean;
       canPublishSources: TrackSource[];
       canPublishData: boolean;
       canUpdateMetadata: boolean;
     }
   ): Promise<void> {
     const old = peer.permission;
     if (
       !old ||
       old.canPublish !== permission.canPublish ||
       old.canPublishData ||
       !old.canSubscribe ||
       old.canUpdateMetadata ||
       JSON.stringify([...old.canPublishSources].sort()) !== JSON.stringify([...permission.canPublishSources].sort())
     ) {
       await native.updateParticipant(roomName, identity, { permission });
     }
   }
   ```
3. **Preserved Original `syncNativePermissions`:**
   Retains original behavior for existing callers (e.g., `claim`, `release`), including independent `publicationPermission` computation and native `getParticipant` lookup when `known` is omitted.
4. **New `syncLiveNativePermissions` Method:**
   ```typescript
   async syncLiveNativePermissions(db: PoolClient, known: ParticipantInfo): Promise<ParticipantInfo | undefined> {
     const evaluated = await liveLeaseWithPolicy(db, known.identity);
     if (!evaluated) return undefined;
     await this.applyNativePermissionUpdate(this.config().client, evaluated.lease.room_name, evaluated.lease.id, known, evaluated.permission);
     return known;
   }
   ```
   - Evaluates fresh `liveLeaseWithPolicy(db, known.identity)` on each call under caller-held transaction locks.
   - No optional trusted permission shortcuts, no in-memory peer/lease/binding caching, no new fields or grants.

### B. `apps/api/src/modules/calls/publishing.service.ts`
1. In `PublishingService.reconcileWithin`, replace the final peer loop:
   ```typescript
   // Replaces: for (const peer of people) { const lease = await liveLease(db, peer.identity); if (lease) await this.calls.syncNativePermissions(db, lease, peer); }
   for (const peer of people) await this.calls.syncLiveNativePermissions(db, peer);
   ```
2. The slot loop, observed map, 30-second expiry timeout, stopped track handling, and lock orders remain entirely unchanged.

---

## 3. Safety and Invariant Review

- **Caller-Held Canonical Locks:** All queries run directly on the transactional `db` client passed by `CallLifecycleService.reconcileGroup`, maintaining canonical order: `rooms` FOR UPDATE $\to$ `call_groups` FOR UPDATE $\to$ `call_members` FOR UPDATE.
- **Zero In-Memory Caching:** Every invocation executes a fresh SQL query against PostgreSQL, ensuring immediate zero-cache reflection for bans, session expirations, and moderator restrictions (`MIC_MUTED`, `STREAM_BLOCKED`).
- **Complete Policy Parity:** Evaluates all six permission matrix combinations, clock-timestamp grace windows (20s/29s/31s), and publish slot assignments identically to the original sequential functions.
- **Error Propagation & Identity:** Preserves returned peer/undefined identities and propagates native SDK errors without suppression.

---

## 4. Expected Test Verification

Integration test suite [`t30-publishing-fresh-policy.integration.spec.ts`](file:///E:/FGweb/code/quality/evidence/T30/antigravity-publishing-fresh-policy-1/t30-publishing-fresh-policy.integration.spec.ts) provides:
- **Control-1:** Verifies existing `syncNativePermissions` callers remain functional.
- **Control-2:** Verifies all six original policy combinations and exact native updates.
- **Control-3:** Verifies slot deleted by reconcile immediately reflects the stripped policy.
- **Control-4:** Verifies repeated invocations after restriction, revocation, or session expiration never reuse old results.
- **Control-5:** Verifies distinct users across distinct connection clients and pools.
- **RED-1:** Asserts `syncLiveNativePermissions` is exported on `CallsService`.
- **RED-2 & RED-3:** Asserts that `reconcileWithin` executes exactly 1 fresh query per peer under lock. On unmodified source, this fails cleanly (observing 3 queries for 1 peer and 5 queries for 2 peers) without compilation crashes or missing-method crashes.

---

## 5. Status

Proposal files delivered in `quality/evidence/T30/antigravity-publishing-fresh-policy-1/`. No tests have been executed or marked PASS in this turn. No claim of unique root cause or full native acceptance is made. Awaiting Codex review and adoption.
