# FG T30 — Fixture Inspector Client Reservation Proposal (`antigravity-inspector-client-reservation-1`)

## 1. Executive Summary & Measured Context

- **Task**: FG T30 — Fixture-Only Inspector Client Reservation to Resolve Cold Handshake Connection Timeout in Long-Running Headed E2E Tests.
- **Scope**: Strictly confined to `quality/evidence/T30/antigravity-inspector-client-reservation-1/{fixture-server-inspector-reserved.mjs, fixture-server-built-inspector-reserved.mjs, review-notes.md}`.
- **Operating Constraints**: Sequential single-task execution, fixed Gemini 3.6 Flash (High), NO Anti2 (`NO-ANTI2-01`), no subagents. Proposal-only mode. Zero application source, `dist/`, runtime configs, migrations, ledger, or history files were modified. Zero tests, builds, or browser runs were executed by this agent.
- **Measured Failure in Native32 Run**:
  - `native32-photo-review.json` confirmed that Native32 built API run 9 successfully executed two real WebRTC captures (15374ms and 21041ms), viewer with two stream selectors, received native Linh video (640x349, RTP delta 20095 bytes / 53 packets), 2 audio tracks, and TURN relay.
  - However, the first frozen `ask('inspect')` call failed at `04:44:25.772Z` with:
    `Error: Native observation failed` -> `Connection terminated due to connection timeout`.
  - In `codex-headed-t30-native-32.txt`, the failure occurred in `tests/e2e/screen-share.spec.ts` line 24.
  - **Driver Source Analysis**:
    - In `node_modules/pg-pool/index.js`, the error `'Connection terminated due to connection timeout'` is emitted exclusively at **line 276** within `newClient()`:
      ```js
      if (this.options.connectionTimeoutMillis) {
        tid = setTimeout(() => {
          if (client.connection) {
            timeoutHit = true
            client.connection.stream.destroy()
          } ...
        }, this.options.connectionTimeoutMillis)
      }
      ```
    - This is the **connection establishment handshake timeout** (5000ms), NOT the pool-waiter acquire timeout at line 224 (`'timeout exceeded when trying to connect'`).
    - The fixture pool uses default `idleTimeoutMillis: 10000` (10 seconds, `pg-pool/index.js` line 99).
    - After initial bootstrap and migrations, the client used for setup was returned to the pool and reaped after 10 seconds of idle time.
    - When `ask('inspect')` arrived well after 10–20 seconds into the test run (after media negotiation and streaming), the pool was empty. Attempting a cold TCP/TLS/PostgreSQL connection handshake during heavy concurrent CPU and browser load exceeded the 5000ms startup timeout.
    - *Note*: While driver source code definitively confirms the error branch, server saturation and hardware causal factors were not directly sampled; we do not claim them as verified facts.

---

## 2. File Artifact Hashes

| File | Baseline / Reference SHA-256 | Proposal SHA-256 |
| :--- | :--- | :--- |
| `fixture-server-inspector-reserved.mjs` (diagnostic variant) | `fixture-server-shaped.mjs` (`d387f3dd6c323ee82ea57053359dff1129f123bf0ce3f46f5da8e9e1c3a647ff`) | `09240fb6ca7ef468dbe9b9c45341dd9705a37b04e7c913e64ee677586e90a0d7` |
| `fixture-server-built-inspector-reserved.mjs` (canonical variant) | `fixture-server-built-runtime-reviewed.mjs` (`9516d2081afed3bc8c94e3c2a5778a9755638e40e494d6db23ed23724879904b`) | `2349e2f0b431cc00f335b86c42a142ba23dd0d9889a5bbdc2df4f74e21fc8b08` |
| `review-notes.md` | — | *(This document)* |

---

## 3. Architecture of the Solution

### 3.1 Pre-Allocation of One Dedicated PoolClient
- Rather than relying on on-demand `pool.query()` (which creates/destroys ephemeral clients subject to 10s idle eviction), the fixture checks out **ONE** actual `PoolClient` (`inspectorClient = await pool.connect()`) from its existing PostgreSQL pool during startup.
- **Timing**: The reservation occurs immediately after owned schema creation, migrations, seed data, and actors setup, and **before** `mark('redis')`, `mark('media')`, `mark('api')`, and `mark('web')`.
- **No Transaction**: The client is held in autocommit mode throughout the entire run. No `BEGIN` or transaction locks are held.
- **Immunity to Idle Reaping**: In `pg-pool`, checked-out clients are tracked in `this._clients` and are NOT placed in `this._idle`. Consequently, the 10,000ms `idleTimeoutMillis` timer never touches the reserved client.
- **Zero Cold-Handshake Latency**: When `ask('inspect')` is invoked at any point during the test, `inspectorClient.query` executes immediately over the pre-established TCP connection.

### 3.2 Exact Replacement of Three Inspection Queries
The three inspection queries in `process.on('message', ...)` under `message.kind === 'inspect'` are updated from `pool.query` to `inspectorClient.query`, preserving exact SQL, parameters, result structures, and order:
1. `(await inspectorClient.query(\`SELECT ...\`, [roomId, play.id])).rows[0]`
2. `(await inspectorClient.query('SELECT user_id,is_muted FROM call_members WHERE room_id=$1 AND left_at IS NULL', [roomId])).rows`
3. `(await inspectorClient.query('SELECT count(*)::int AS count FROM call_publish_slots')).rows[0].count`

### 3.3 Safe Error Handling & Invalidation
- Event listeners are attached once upon connection:
  - `inspectorClient.once('error', err => { inspectorFailed = true; inspectorFailures++; ... })`
  - `inspectorClient.once('end', () => { inspectorFailed = true; })`
- If the connection terminates unexpectedly, `inspectorFailed` is flagged.
- Subsequent `inspect` calls check `if (inspectorFailed || !inspectorClient || inspectorReleased) throw new Error('Inspector client unavailable')`.
- The failure is appended to `inspection-failures.jsonl` with secrets redacted, and `{ id: message.id, failed: true, name: error.name, code: error.code }` is dispatched to the runner.
- The fixture **never** silently reconnects, retries, or serves stale data.

### 3.4 Independent Cleanup & Release Order Invariant
- In `cleanup()`, `inspectorClient.release(true)` (which destroys the stream and removes the client from `pg-pool`) is executed **BEFORE** `dropSchema` and `pool.end()`.
- Releasing before `pool.end()` is critical: if a checked-out client is not released, `pool.end()` would hang waiting for it.
- Each cleanup operation is executed inside `attempt(name, fn)` to ensure that an error during one step (e.g. media container removal or file write) does not skip the remaining cleanup operations.
- `inspector-lifecycle.json` records safe, sanitized lifecycle metrics:
  ```json
  {
    "recordedAt": "2026-10-11T05:00:00.000Z",
    "backendPid": 12345,
    "poolTotalCount": 1,
    "poolIdleCount": 0,
    "poolWaitingCount": 0,
    "failureCount": 0,
    "reserved": true,
    "released": true,
    "poolEnded": true
  }
  ```
- If `inspectorFailures > 0`, the error is collected and propagated after all cleanup attempts complete.

---

## 4. Exact Differences Between the Two Variants

### 4.1 Diagnostic Variant: `fixture-server-inspector-reserved.mjs`
- Derived from `quality/evidence/T30/fixture-server-shaped.mjs`.
- Retains observation instrumentation:
  - `import {instrumentOwnedApiPools,getOwnedObservationFailures} from './api-room-owner-observation-reviewed.mjs'`
  - `import {startGatewayFixture} from './private-gateway-shaped-fixture.mjs'`
  - `import {startOwnedPgWaitObservation} from './pg-wait-observation-reviewed2.mjs'`
- Runs `stopPgWait = startOwnedPgWaitObservation(...)` and `instrumentOwnedApiPools(...)`.
- Reports `apiOwnerHealth` in `cleanup()`.

### 4.2 Canonical Variant: `fixture-server-built-inspector-reserved.mjs`
- Derived from `quality/evidence/T30/fixture-server-built-runtime-reviewed.mjs` (approved hash `9516d2081afed3bc8c94e3c2a5778a9755638e40e494d6db23ed23724879904b`).
- Imports canonical gateway baseline:
  - `import {startGatewayFixture} from './private-gateway-fixture.mjs'`
- Strips all diagnostic observation modules (`api-room-owner-observation` and `pg-wait-observation`).
- Adopts the exact same robust independent cleanup structure (`attempt(...)` pattern) and inspector client pre-allocation/release mechanics.

---

## 5. Exact Diffs

### 5.1 Diff: `fixture-server-shaped.mjs` vs `fixture-server-inspector-reserved.mjs`

```diff
--- quality/evidence/T30/fixture-server-shaped.mjs
+++ quality/evidence/T30/antigravity-inspector-client-reservation-1/fixture-server-inspector-reserved.mjs
@@ -23,7 +23,7 @@
 assert(evidence?.startsWith('quality/evidence/T30/'));fs.mkdirSync(evidence,{recursive:true});
 instrumentOwnedApiPools(pg,evidence);
 const report={schemaRemoved:false,mediaRemoved:false,presenceRemoved:false,appClosed:false,webClosed:false};
-let pool,redis,app,web,fixture,created=false,namespace='',phase='port',sfu,stopPgWait;
+let pool,redis,app,web,fixture,created=false,namespace='',phase='port',sfu,stopPgWait,inspectorClient,inspectorReleased=false,inspectorFailed=false,inspectorFailures=0,inspectorPid=null;
 const sockets=new Set();
 const mark=name=>{phase=name;process.send?.({kind:'phase',name});};
 async function cleanup(){
@@ -47,8 +47,10 @@
   await attempt('mediaDiagnostics',async()=>{
    fs.writeFileSync(`${evidence}/media-diagnostics.txt`,fixture.diagnostics());
-   const response=await fetch(fixture.shaperControl+'/stats').catch(()=>null);
-   if(response?.ok)fs.writeFileSync(`${evidence}/final-shaper-stats.json`,JSON.stringify(await response.json(),null,2)+'\n');
+   if(fixture.shaperControl){
+    const response=await fetch(fixture.shaperControl+'/stats').catch(()=>null);
+    if(response?.ok)fs.writeFileSync(`${evidence}/final-shaper-stats.json`,JSON.stringify(await response.json(),null,2)+'\n');
+   }
   });
   await attempt('mediaContainers',async()=>{
    const state=await fixture.close();
@@ -65,6 +67,12 @@
    report.presenceRemoved=presenceCleaned;
   });
  }
+ if(inspectorClient&&!inspectorReleased){
+  await attempt('inspectorRelease',async()=>{
+   inspectorReleased=true;
+   try{inspectorClient.release(true);}catch{}
+  });
+ }
  if(pool){
   if(created){
    await attempt('dropSchema',async()=>{
@@ -80,6 +88,20 @@
  await attempt('cleanupReport',async()=>{
   fs.writeFileSync(`${evidence}/cleanup.json`,JSON.stringify(report,null,2)+'\n');
  });
+ await attempt('inspectorLifecycleReport',async()=>{
+  const lifecycleEvidence={
+   recordedAt:new Date().toISOString(),
+   backendPid:inspectorPid,
+   poolTotalCount:pool?.totalCount??0,
+   poolIdleCount:pool?.idleCount??0,
+   poolWaitingCount:pool?.waitingCount??0,
+   failureCount:inspectorFailures,
+   reserved:Boolean(inspectorClient),
+   released:inspectorReleased,
+   poolEnded:Boolean(pool?.ended)
+  };
+  fs.writeFileSync(`${evidence}/inspector-lifecycle.json`,JSON.stringify(lifecycleEvidence,null,2)+'\n');
+ });
  let observationFailures=0;
  await attempt('apiOwnerHealth',async()=>{
   observationFailures=getOwnedObservationFailures();
@@ -88,6 +110,9 @@
  if(observationFailures>0){
   errors.push(new Error('Owned API observations unavailable'));
  }
+ if(inspectorFailures>0){
+  errors.push(new Error('Inspector client failures observed'));
+ }
  if(errors.length===1){
   throw errors[0];
  }
@@ -111,6 +136,17 @@
   await pool.query("INSERT INTO session(id,user_id,token,expires_at,created_at,updated_at) VALUES($1,$2,$3,now()+interval '1 day',now(),now())",[randomUUID(),id,token]);
   actors[key]={id,name,cookie:`${token}.${await makeSignature(token,secret)}`};
  }
+ inspectorClient=await pool.connect();
+ inspectorPid=Number(inspectorClient.processID);
+ inspectorClient.once('error',err=>{
+  inspectorFailed=true;
+  inspectorFailures++;
+  try{
+   const failure={recordedAt:new Date().toISOString(),name:err?.name??'Error',code:err?.code,backendPid:inspectorPid};
+   fs.appendFileSync(`${evidence}/inspector-failures.jsonl`,JSON.stringify(failure)+'\n');
+  }catch{}
+ });
+ inspectorClient.once('end',()=>{inspectorFailed=true;});
  mark('redis');redis=new Redis(env.REDIS_URL,{connectTimeout:5000,retryStrategy:()=>null});await redis.ping();
  mark('media');fixture=await startGatewayFixture({databaseURL:scoped.href,key:env.LIVEKIT_API_KEY,secret:env.LIVEKIT_API_SECRET,origin,turnTcp:true,webhookUrl:`http://host.docker.internal:${apiPort}/api/media/webhook`});
  Object.assign(process.env,env,{DATABASE_URL:scoped.href,BETTER_AUTH_SECRET:secret,PUBLIC_ORIGIN:origin,BETTER_AUTH_URL:origin,LIVEKIT_SERVER_URL:fixture.server,LIVEKIT_ADMISSION_URL:fixture.ws,FG_UPLOADS_DIR:path.resolve('.runtime/t30/uploads')});delete process.env.ADMIN_USER_IDS;delete process.env.ADMIN_DISCORD_IDS;
@@ -163,16 +199,17 @@
   })
  };
  web.httpServer.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
- process.send?.({kind:'ready',origin,actors,roomId,otherRoomId:other.id,turnPort:fixture.turnPort});
+ process.send?.({kind:'ready',origin,actors,roomId,otherRoomId:other.id,turnPort:fixture.turnPort,inspectorPid});
  process.on('message',async message=>{
   if(message.kind==='shape')try{assert(fixture.shaperControl);const response=await fetch(fixture.shaperControl+'/shape',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(message.policy)});assert.equal(response.status,200);process.send?.({id:message.id,...await response.json()});}catch{process.send?.({id:message.id,failed:true});}
   if(message.kind==='shaping-stats')try{assert(fixture.shaperControl);const response=await fetch(fixture.shaperControl+'/stats');assert.equal(response.status,200);process.send?.({id:message.id,...await response.json()});}catch{process.send?.({id:message.id,failed:true});}
   if(message.kind==='inspect')try{
-   const state=(await pool.query(`SELECT (SELECT count(*)::int FROM rooms WHERE id=$1) rooms,(SELECT count(*)::int FROM room_members WHERE room_id=$1) members,(SELECT state FROM play_sessions WHERE id=$2) play_state,(SELECT count(*)::int FROM active_play_slots WHERE play_session_id=$2) play_slots,(SELECT count(*)::int FROM call_members WHERE room_id=$1 AND left_at IS NULL) callers,(SELECT count(*)::int FROM call_groups WHERE room_id=$1 AND state='OPEN') open_calls`,[roomId,play.id])).rows[0];
-   const people=(await pool.query('SELECT user_id,is_muted FROM call_members WHERE room_id=$1 AND left_at IS NULL',[roomId])).rows;
-   const native=await sfu.listRooms();let audio=0;const nativeTracks=[];for(const room of native)for(const person of await sfu.listParticipants(room.name)){audio+=person.tracks.filter(t=>t.type===0&&!t.muted).length;for(const track of person.tracks)nativeTracks.push({identity:person.identity,sid:track.sid,type:track.type,source:track.source,muted:track.muted});}const slots=(await pool.query('SELECT count(*)::int AS count FROM call_publish_slots')).rows[0].count;
-   process.send?.({id:message.id,...state,people,nativeUnmutedAudioTracks:audio,nativeTracks,publisherSlots:slots});
-  }catch(error){const failure={recordedAt:new Date().toISOString(),name:error.name,code:error.code,column:error.column,table:error.table,message:String(error.message).replaceAll(env.LIVEKIT_API_SECRET,'[REDACTED]').replaceAll(env.DATABASE_URL,'[REDACTED]')};fs.appendFileSync(`${evidence}/inspection-failures.jsonl`,JSON.stringify(failure)+'\n');process.send?.({id:message.id,failed:true,name:error.name,code:error.code});}
+   if(inspectorFailed||!inspectorClient||inspectorReleased)throw new Error('Inspector client unavailable');
+   const state=(await inspectorClient.query(`SELECT (SELECT count(*)::int FROM rooms WHERE id=$1) rooms,(SELECT count(*)::int FROM room_members WHERE room_id=$1) members,(SELECT state FROM play_sessions WHERE id=$2) play_state,(SELECT count(*)::int FROM active_play_slots WHERE play_session_id=$2) play_slots,(SELECT count(*)::int FROM call_members WHERE room_id=$1 AND left_at IS NULL) callers,(SELECT count(*)::int FROM call_groups WHERE room_id=$1 AND state='OPEN') open_calls`,[roomId,play.id])).rows[0];
+   const people=(await inspectorClient.query('SELECT user_id,is_muted FROM call_members WHERE room_id=$1 AND left_at IS NULL',[roomId])).rows;
+   const native=await sfu.listRooms();let audio=0;const nativeTracks=[];for(const room of native)for(const person of await sfu.listParticipants(room.name)){audio+=person.tracks.filter(t=>t.type===0&&!t.muted).length;for(const track of person.tracks)nativeTracks.push({identity:person.identity,sid:track.sid,type:track.type,source:track.source,muted:track.muted});}const slots=(await inspectorClient.query('SELECT count(*)::int AS count FROM call_publish_slots')).rows[0].count;
+   process.send?.({id:message.id,...state,people,nativeUnmutedAudioTracks:audio,nativeTracks,publisherSlots:slots,inspectorPid});
+  }catch(error){inspectorFailures++;const failure={recordedAt:new Date().toISOString(),name:error.name,code:error.code,column:error.column,table:error.table,message:String(error.message).replaceAll(env.LIVEKIT_API_SECRET,'[REDACTED]').replaceAll(env.DATABASE_URL,'[REDACTED]')};fs.appendFileSync(`${evidence}/inspection-failures.jsonl`,JSON.stringify(failure)+'\n');process.send?.({id:message.id,failed:true,name:error.name,code:error.code});}
   if(message.kind==='stop')try{await cleanup();process.exit(0);}catch(error){fs.writeFileSync(`${evidence}/cleanup-failure.json`,JSON.stringify({name:error.name,code:error.code}));process.exit(1);}
  });
 }catch(error){await cleanup().catch(()=>{});process.send?.({kind:'failed',phase,name:error.name,code:error.code,table:error.table,column:error.column,constraint:error.constraint,message:String(error.message).replaceAll(env.LIVEKIT_API_SECRET,'[REDACTED]').replaceAll(env.DATABASE_URL,'[REDACTED]')});process.exit(1);}
```

---

## 6. Verification Plan for Codex

Before adopting these proposals and proceeding to Native33, Codex must execute the following verifications:

1. **Pre-Allocation & PID Validation Test**:
   - Start the fixture in diagnostic mode.
   - Verify that `inspectorPid` is returned in the `ready` message.
   - Verify that `pg_stat_activity` contains a backend PID matching `inspectorPid` with `state = 'idle'`.
2. **Idle Survival Test (>10,000ms idle)**:
   - Allow >12 seconds to elapse after `ready` without sending any inspect requests (exceeding default `idleTimeoutMillis: 10000`).
   - Send `ask('inspect')`.
   - Verify that `inspect` succeeds with zero errors, returning state metrics and matching `inspectorPid`.
3. **Unexpected Socket Drop Handling Test**:
   - Terminate the backend PID via `SELECT pg_terminate_backend(...)`.
   - Send `ask('inspect')`.
   - Verify that `inspect` throws an honest error without crashing the fixture process or returning corrupted state.
4. **Orderly Cleanup Invariant Test**:
   - Send `stop` to the fixture.
   - Verify that `inspector-lifecycle.json` records `released: true`, `poolEnded: true`, `failureCount: 0`.
   - Verify that `schemaRemoved: true` and all Docker containers/networks are removed.

---

> [!NOTE]
> This proposal does NOT claim unrecorded test success or native run 33 completion. Gate review, adoption, and subsequent execution remain under Codex oversight.
