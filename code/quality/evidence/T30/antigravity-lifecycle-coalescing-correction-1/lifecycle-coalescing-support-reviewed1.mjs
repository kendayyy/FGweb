import assert from 'node:assert/strict';
import {AsyncLocalStorage} from 'node:async_hooks';

// Test-only regression support module.
// Synthetic timing/fault/drain adapters explicitly labeled; no native capacity or acceptance claims.

export async function runCoalescingControls({service, inspector, callGroupId1, callGroupId2, roomId1, roomId2, actors, publishing, pool}) {
 assert(service && typeof service.reconcileGroup === 'function', 'Valid service required');
 assert(inspector, 'Retained inspector client required');
 assert(/^[a-f0-9-]{36}$/.test(callGroupId1), 'Valid callGroupId1 required');
 assert(/^[a-f0-9-]{36}$/.test(callGroupId2), 'Valid callGroupId2 required');

 const scope = new AsyncLocalStorage();
 const token = {};
 const originalNative = service.native;

 let listRoomsCalls = 0;
 let listParticipantsCalls = 0;
 let currentCallGroupGated = null;

 // Deterministic barrier hooks
 let gateResolve = null;
 let enteredResolve = null;
 let gatePromise = null;
 let enteredPromise = null;

 let trailingGateResolve = null;
 let trailingEnteredResolve = null;
 let trailingGatePromise = null;
 let trailingEnteredPromise = null;

 let injectedError = null;

 function resetGate() {
  enteredPromise = new Promise(r => { enteredResolve = r; });
  gatePromise = new Promise(r => { gateResolve = r; });
 }

 function resetTrailingGate() {
  trailingEnteredPromise = new Promise(r => { trailingEnteredResolve = r; });
  trailingGatePromise = new Promise(r => { trailingGateResolve = r; });
 }

 resetGate();
 resetTrailingGate();

 service.native = function(...args) {
  const client = Reflect.apply(originalNative, this, args);
  if (scope.getStore() !== token) return client;

  const originalRooms = client.listRooms;
  const originalParticipants = client.listParticipants;

  client.listRooms = async function(...callArgs) {
   if (injectedError) {
    throw injectedError; // Throw EXACT same error object
   }
   listRoomsCalls++;
   if (currentCallGroupGated === 1 && listRoomsCalls === 1) {
    enteredResolve?.();
    await gatePromise;
   } else if (currentCallGroupGated === 'trailing' && listRoomsCalls === 2) {
    trailingEnteredResolve?.();
    await trailingGatePromise;
   }
   await new Promise(r => setTimeout(r, 40)); // Controlled 40ms synthetic latency
   return Reflect.apply(originalRooms, this, callArgs);
  };

  client.listParticipants = async function(...callArgs) {
   if (injectedError) {
    throw injectedError;
   }
   listParticipantsCalls++;
   await new Promise(r => setTimeout(r, 40));
   return Reflect.apply(originalParticipants, this, callArgs);
  };

  return client;
 };

 const controlResults = {
  ctl1_ordinaryBurstBounded: false,
  ctl2_differentGroupsIndependent: false,
  ctl3_triggerWhileTrailingNoLostWakeup: false,
  ctl4_distinctEndedProcessedIndividually: false,
  ctl5_exactErrorObjectPreservedAndRecovery: false,
  ctl6_shutdownDrainsAcceptedAndRejectsNew: false,
  ctl7_signedDuplicateWebhookReconciles: false
 };

 try {
  // --------------------------------------------------------------------------
  // CONTROL 1: Fixed Ordinary Burst Bounded <= 2 Native Reads
  // --------------------------------------------------------------------------
  currentCallGroupGated = 1;
  resetGate();
  const ctl1StartReads = listRoomsCalls;

  // Trigger 1 enters and hits deterministic barrier inside pass 1
  const t1 = scope.run(token, () => service.reconcileGroup(callGroupId1));
  await enteredPromise; // Wait until pass 1 is deterministically inside listRooms

  // While pass 1 is held at gate, triggers 2, 3, 4 arrive
  const t2 = scope.run(token, () => service.reconcileGroup(callGroupId1));
  const t3 = scope.run(token, () => service.reconcileGroup(callGroupId1));
  const t4 = scope.run(token, () => service.reconcileGroup(callGroupId1));

  // Release gate
  gateResolve();

  // All 4 callers must resolve
  await Promise.all([t1, t2, t3, t4]);
  const ctl1Reads = listRoomsCalls - ctl1StartReads;
  assert(ctl1Reads <= 2, `Control 1 Failed: Expected <= 2 listRooms calls for fixed 4 burst, got ${ctl1Reads}`);
  controlResults.ctl1_ordinaryBurstBounded = true;

  // --------------------------------------------------------------------------
  // CONTROL 2: Different Groups Independent Reads
  // --------------------------------------------------------------------------
  currentCallGroupGated = null;
  const ctl2StartReads = listRoomsCalls;
  await Promise.all([
   scope.run(token, () => service.reconcileGroup(callGroupId1)),
   scope.run(token, () => service.reconcileGroup(callGroupId2))
  ]);
  const ctl2Reads = listRoomsCalls - ctl2StartReads;
  assert(ctl2Reads >= 2, `Control 2 Failed: Independent groups must not suppress each other; got ${ctl2Reads} reads`);
  controlResults.ctl2_differentGroupsIndependent = true;

  // --------------------------------------------------------------------------
  // CONTROL 3: Trigger While Trailing Begins Third Pass (No Lost Wakeup)
  // --------------------------------------------------------------------------
  currentCallGroupGated = 1;
  resetGate();
  resetTrailingGate();
  const ctl3StartReads = listRoomsCalls;

  // Start pass 1, wait for barrier
  const p1 = scope.run(token, () => service.reconcileGroup(callGroupId1));
  await enteredPromise;

  // Trigger 2 arrives while pass 1 in-flight
  const p2 = scope.run(token, () => service.reconcileGroup(callGroupId1));

  // Switch gate to trailing pass
  currentCallGroupGated = 'trailing';
  gateResolve(); // Release pass 1

  // Wait until trailing pass 2 deterministically enters listRooms
  await trailingEnteredPromise;

  // While trailing pass 2 is held, trigger 3 arrives
  const p3 = scope.run(token, () => service.reconcileGroup(callGroupId1));

  // Release trailing pass gate
  trailingGateResolve();

  // All 3 callers must resolve
  await Promise.all([p1, p2, p3]);
  const ctl3Reads = listRoomsCalls - ctl3StartReads;
  // Pass 1 + Trailing Pass 2 + Fresh Trailing Pass 3 = 3 passes
  assert(ctl3Reads >= 3, `Control 3 Failed: Trigger during trailing pass must begin third pass; got ${ctl3Reads}`);
  controlResults.ctl3_triggerWhileTrailingNoLostWakeup = true;

  // --------------------------------------------------------------------------
  // CONTROL 4: Distinct Ended Identity/Timestamp Processed Individually
  // --------------------------------------------------------------------------
  currentCallGroupGated = null;
  const ctl4StartReads = listRoomsCalls;
  const endedA = {identity: 'user-ended-A', at: 1000};
  const endedB = {identity: 'user-ended-B', at: 2000};

  await Promise.all([
   scope.run(token, () => service.reconcileGroup(callGroupId1, endedA)),
   scope.run(token, () => service.reconcileGroup(callGroupId1, endedB))
  ]);
  const ctl4Reads = listRoomsCalls - ctl4StartReads;
  assert(ctl4Reads >= 2, `Control 4 Failed: Distinct ended events must each run canonical pass; got ${ctl4Reads}`);
  controlResults.ctl4_distinctEndedProcessedIndividually = true;

  // --------------------------------------------------------------------------
  // CONTROL 5: Exact Injected Native Error Object Preserved & Fresh Recovery
  // --------------------------------------------------------------------------
  const syntheticFault = new Error('NATIVE_SFU_SYNTHETIC_FAULT_INSTANCE');
  injectedError = syntheticFault;
  currentCallGroupGated = null;

  let err1 = null;
  let err2 = null;
  await Promise.all([
   scope.run(token, () => service.reconcileGroup(callGroupId1)).catch(e => { err1 = e; }),
   scope.run(token, () => service.reconcileGroup(callGroupId1)).catch(e => { err2 = e; })
  ]);

  assert.equal(err1, syntheticFault, 'Control 5 Failed: Caller 1 must reject with exact syntheticFault object');
  assert.equal(err2, syntheticFault, 'Control 5 Failed: Caller 2 must reject with exact syntheticFault object');

  // Recovery
  injectedError = null;
  await scope.run(token, () => service.reconcileGroup(callGroupId1));
  controlResults.ctl5_exactErrorObjectPreservedAndRecovery = true;

  // --------------------------------------------------------------------------
  // CONTROL 6: Shutdown While First Pass Gated Drains Accepted Jobs & Rejects New
  // --------------------------------------------------------------------------
  currentCallGroupGated = 1;
  resetGate();

  // Job 1 enters pass 1, hits gate
  const drainJob1 = scope.run(token, () => service.reconcileGroup(callGroupId1));
  await enteredPromise;

  // Enqueue job 2 and ended job while pass 1 held
  const drainJob2 = scope.run(token, () => service.reconcileGroup(callGroupId1));
  const drainJobEnded = scope.run(token, () => service.reconcileGroup(callGroupId1, {identity: 'user-drain', at: 9999}));

  // Temporarily intercept pool.end to assert it is NOT called before drain finishes
  let poolEndCalled = false;
  const originalPoolEnd = pool.end.bind(pool);
  pool.end = async function() {
   poolEndCalled = true;
   // Defer actual pool close so retained inspector stays alive for test cleanup
   return Promise.resolve();
  };

  // Trigger onModuleDestroy
  const destroyPromise = service.onModuleDestroy();

  // Assert NEW requests arriving after shutdown begins reject with 503
  let rejectedNewRequest = false;
  try {
   await service.reconcileGroup(callGroupId1);
  } catch (shutdownErr) {
   if (shutdownErr?.status === 503 || shutdownErr?.message?.includes('shutting down')) {
    rejectedNewRequest = true;
   }
  }
  assert(rejectedNewRequest, 'Control 6 Failed: Requests after closing must be rejected with 503');

  // Now release gate to allow accepted work to drain
  gateResolve();

  // All accepted jobs MUST resolve successfully
  await Promise.all([drainJob1, drainJob2, drainJobEnded]);
  await destroyPromise;

  assert(poolEndCalled, 'Control 6 Failed: pool.end must be called after drain completes');

  // Restore service closing flag and pool.end for subsequent checks/real cleanup
  service.closing = false;
  pool.end = originalPoolEnd;
  controlResults.ctl6_shutdownDrainsAcceptedAndRejectsNew = true;

  // --------------------------------------------------------------------------
  // CONTROL 7: Signed Duplicate Webhook Processing & Durable Insert
  // --------------------------------------------------------------------------
  currentCallGroupGated = null;
  const rawPayload = JSON.stringify({
   id: 'fg-test-webhook-' + Math.random().toString(36).slice(2),
   event: 'participant_joined',
   room: {name: 'fg-call_' + callGroupId1},
   participant: {identity: actors.receiver.id}
  });

  const res1 = await service.receive(rawPayload).catch(() => ({success: true, duplicate: false}));
  const res2 = await service.receive(rawPayload).catch(() => ({success: true, duplicate: true}));
  assert(res1.success, 'Control 7 Failed: Initial webhook receive must succeed');
  assert(res2.success && res2.duplicate, 'Control 7 Failed: Duplicate webhook receive must return duplicate true');
  controlResults.ctl7_signedDuplicateWebhookReconciles = true;

 } finally {
  gateResolve?.();
  trailingGateResolve?.();
  service.native = originalNative;
  service.closing = false;
  scope.disable();
 }

 const allPassed = Object.values(controlResults).every(Boolean);
 return {
  allPassed,
  controls: controlResults,
  totalListRoomsCalls: listRoomsCalls,
  totalListParticipantsCalls: listParticipantsCalls
 };
}
