# Corrected Lifecycle RED Probe Specification (antigravity-native61-lifecycle-red-probe-correction-1)

## 1. Executive Summary & Review Findings Addressed

This proposal delivers a corrected test/design probe for **T30** under the disciplined **TDD (failing test before product code)** workflow.
Root rejected the initial proposal; no commands have been executed. All 7 concrete review findings have been resolved in full:

1. **Owned Private Gateway & Real SFU**:
   - The probe now uses the accepted canonical direct fixture flow (`startGatewayFixture`) with credentials loaded from `.env.local`.
   - Default `localhost` SFU, `devkey`, and fallback credentials have been completely eliminated. Real private containers run in the isolated bridge network.
2. **Exact Real SDK Delayed Wrapper (Zero Invented Fallback)**:
   - The test-only adapter on `actualLifecycle.native` invokes the real client's exact methods (`client.listRooms`, `client.listParticipants`) with a 40ms controlled delay.
   - It returns or rethrows original results and errors unchanged. All invented/fallback synthetic return structures have been removed.
   - The delay is explicitly labeled as test-only synthetic latency without real-world throughput claims.
3. **Asserting Actual Native Read Counts ($\le 2$), Not Caller Completions**:
   - In coalescing, all 4 calling promises should resolve. The intended RED assertion now evaluates the actual per-group `listRooms` read count ($\le 2$), not caller resolution count.
   - Both counts are recorded separately: 4 requested, 4 resolved, and 4 native reads executed (under un-coalesced source).
4. **Accurate Durations & True Database Contention**:
   - Invocation-to-completion duration is reported accurately as request duration (including queueing), without claiming it represents pure row lock hold duration.
   - Real PostgreSQL wait events and blocking PIDs are sampled from the retained inspector client during concurrent load.
5. **Real DB Blocking Sampling & Integrity Controls**:
   - Replaced false native-count proof with real sampling of `pg_stat_activity` and `pg_blocking_pids` via the retained inspector client during concurrent work.
   - Verifies `call_groups` state remains `OPEN`, `rooms` row exists, and `call_members` rows remain intact.
   - Persisted outputs are sanitized (no raw SQL, tokens, or credentials).
6. **Strict Cleanup Settlement & Error Handling**:
   - Cleanup failures strictly override expected RED with exit code 2.
   - Output reports are written with flag `'wx'` to prevent accidental overwrites.
   - Unexpected errors are sanitized without stack traces or sensitive credentials.
7. **Source Pins & Realistic Coalescing Scope**:
   - Exact source pins and SHA256 checksums are documented.
   - Coalescing guarantee is scoped to a **fixed concurrent burst** arriving while an initial pass is active.
   - Preserves distinct screen-share `ended` events under individual canonical runs (preventing invalid batching into the single-ended `PublishingService` API).

---

## 2. Architecture & Two Counted Insertion Anchors

The probe adapts the accepted canonical fixture (`fixture-server-canonical-direct-reviewed1.mjs`) via **two exact counted insertion anchors**:

### Anchor A: Service Resolution & Timer Isolation
- **Target**: Immediately following `await app.listen(apiPort, '0.0.0.0');` in API bootstrap.
- **Diff**:
  ```javascript
  const actualLifecycle = app.get('FG_CALL_LIFECYCLE');
  if (actualLifecycle?.timer) {
    clearInterval(actualLifecycle.timer);
    actualLifecycle.timer = undefined;
  }
  if (actualLifecycle?.running) {
    await actualLifecycle.running.catch(() => {});
  }
  ```
- **Rationale**: Uses canonical injection token `'FG_CALL_LIFECYCLE'`, stops periodic sweep triggers, and awaits any currently running sweep to eliminate background measurement contamination.

### Anchor B: Lifecycle Probe IPC Handler
- **Target**: In `process.on('message', async message => ...)` message dispatcher.
- **Diff**:
  ```javascript
  if (message.kind === 'lifecycle-probe') try {
    const actualLifecycle = app.get('FG_CALL_LIFECYCLE');
    assert(actualLifecycle, 'FG_CALL_LIFECYCLE service instance missing');
    await new Promise(r => setTimeout(r, 150)); // Settle setup webhooks
    const origNative = actualLifecycle.native.bind(actualLifecycle);
    let actualListRoomsCalls = 0, actualListParticipantsCalls = 0;
    actualLifecycle.native = function() {
      const client = origNative(), origListRooms = client.listRooms.bind(client), origListParticipants = client.listParticipants.bind(client);
      client.listRooms = async function(...args) {
        actualListRoomsCalls++;
        await new Promise(r => setTimeout(r, 40)); // Controlled test delay
        return origListRooms(...args); // Real client, no fallback
      };
      client.listParticipants = async function(...args) {
        actualListParticipantsCalls++;
        await new Promise(r => setTimeout(r, 40)); // Controlled test delay
        return origListParticipants(...args); // Real client, no fallback
      };
      return client;
    };
    let completedCount = 0, failedCount = 0;
    const blockingSamples = []; let sampling = true;
    const samplePromise = (async () => {
      while (sampling) {
        try {
          const res = await inspectorClient.query("SELECT pid,wait_event_type,wait_event,state,array_to_string(pg_blocking_pids(pid),',') AS blocking_pids FROM pg_stat_activity WHERE datname=current_database() AND pid!=pg_backend_pid() AND wait_event_type IS NOT NULL");
          if (res.rows.length) blockingSamples.push({at: new Date().toISOString(), samples: res.rows.map(r => ({pid: Number(r.pid), waitEventType: r.wait_event_type, waitEvent: r.wait_event, state: r.state, blockingPids: r.blocking_pids ? r.blocking_pids.split(',').map(Number) : []}))});
        } catch {}
        await new Promise(r => setTimeout(r, 15));
      }
    })();
    const requestedCount = 4, t0 = performance.now();
    try {
      const triggers = Array.from({length: requestedCount}, () => actualLifecycle.reconcileGroup(message.callGroupId).then(() => { completedCount++; }).catch(e => { failedCount++; throw e; }));
      await Promise.all(triggers);
    } finally {
      sampling = false; await samplePromise.catch(() => {});
      actualLifecycle.native = origNative; // Restore in finally
    }
    const durationMs = performance.now() - t0;
    process.send?.({id: message.id, ok: true, requestedCount, completedCount, failedCount, durationMs, actualListRoomsCalls, actualListParticipantsCalls, blockingSamples});
  } catch (err) {
    process.send?.({id: message.id, ok: false, error: sanitizeName(err?.name), code: sanitizeCode(err?.code)});
  }
  ```

---

## 3. Candidate Coalescing Design Specification & Nuance

### Fixed Concurrent Burst Guarantee
- **Invariant**: For a fixed burst of $N$ triggers arriving while an initial reconciliation pass is active for call group $G$, work is bounded to at most **2 passes** (1 in-flight pass + 1 trailing pass).
- **Subsequent Triggers**: If new triggers arrive after the trailing pass begins, they are coalesced into a subsequent pass. Coalescing bounds work per active window; it does not claim to execute only 2 passes for an infinite stream of continuous events.

### Fresh Trailing State
- When the trailing pass executes, it opens a fresh PostgreSQL transaction and issues fresh `native.listRooms` and `native.listParticipants` RPCs. It operates strictly on the latest system state, guaranteeing eventual consistency without stale snapshot evaluation.

### Screen-Share Ended Event Preservation
- `PublishingService.reconcileWithin` accepts a single `ended?: { identity: string; at: number }`.
- In a coalesced architecture, multiple distinct `ended` events must **never** be silently batched into an API that only processes one event.
- Each distinct `ended` event must be tracked and processed under its own canonical reconciliation run to ensure screen-share publishing slots are correctly released.

### Future Test Coverage Requirements
Before any source implementation is finalized, dedicated unit/integration tests must verify:
1. Error propagation: Failure of an in-flight pass must not cancel the trailing pass.
2. Shutdown drain: `onModuleDestroy` must await in-flight and scheduled trailing passes before ending the database pool.
3. Durable webhook deduplication: `webhook_events` insert remains decoupled from in-memory coalescing.

---

## 4. Strict Architectural Invariants

1. **NO user/room lock `SHARE` relaxation**: `SELECT id FROM rooms WHERE id=$1 FOR UPDATE` and `SELECT id, room_id, state FROM call_groups WHERE id=$1 FOR UPDATE` remain strictly exclusive.
2. **NO RPC outside transaction**: Media RPCs and database mutations remain within existing transaction boundaries.
3. **NO actor removal**: All actor validations (`actor()`, `liveLease()`) remain intact.
4. **NO deadline increase**: 45000ms deadline and 5s assertion deadlines remain immutable.
5. **NO sweep interval reduction**: 1000ms sweep interval remains unchanged.
6. **NO skipping event processing**: All events trigger reconciliation passes.

---

## 5. Root Execution & Verification Instructions

### Preparation (Optional if running from root T30 directory):
```powershell
node quality/evidence/T30/antigravity-native61-lifecycle-red-probe-correction-1/prepare-lifecycle-probe.mjs
```

### Execution:
```powershell
node quality/evidence/T30/antigravity-native61-lifecycle-red-probe-correction-1/run-lifecycle-red-probe.mjs
```

### Expected Outcomes:
- **Expected Exit Code**: `1` (Intended RED assertion failure).
- **Expected Error Signature**:
  ```
  ======================================================================
  PARENT PROBE RESULT: EXPECTED RED REPRODUCTION CONFIRMED (Exit Code 1)
  ======================================================================
  [RED REPRODUCTION CONFIRMED] Fixed burst of 4 concurrent triggers executed 4 listRooms passes (expected <= 2 under per-group coalescing). All 4 callers resolved in ...ms. PG blocking samples observed: ...
  ======================================================================
  ```
- **Cleanup Settlement Verification**:
  - `probe-report.json`:
    - `cleanupSettlement.schemaRemoved: true`
    - `cleanupSettlement.mediaRemoved: true`
    - `cleanupSettlement.presenceRemoved: true`
    - `cleanupSettlement.appClosed: true`
    - `cleanupSettlement.webClosed: true`
    - `cleanupSettlement.inspectorHealthy: true`
    - `cleanupSettlement.cleanupSettled: true`
    - `testResult: "EXPECTED_RED_CONFIRMED"`
- **Cleanup Failure Override**:
  - If any cleanup step fails, the harness overrides the test outcome and exits with **code 2**, preventing false RED reporting.
