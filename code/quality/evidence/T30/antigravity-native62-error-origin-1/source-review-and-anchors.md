# T30 Canonical Fixture Fork & Anchor Review: Error-Origin Observer

## 1. Overview & Constraints

- **Task**: T30
- **Model**: Fixed Gemini 3.6 Flash (High), Sequential proposals ONLY, NO Anti2.
- **Reference Fixture**: `quality/evidence/T30/fixture-server-canonical-direct-reviewed1.mjs` (canonical, observer-free).
- **Proposed Fork**: `quality/evidence/T30/antigravity-native62-error-origin-1/fixture-server-native62-error-origin-reviewed1.mjs`.
- **Observer Module**: `quality/evidence/T30/antigravity-native62-error-origin-1/api-error-origin-observer.mjs`.

The proposed fixture fork is an exact, minimal anchor fork of the canonical direct fixture. The direct gateway helper (`gateway-direct-support-reviewed1.mjs` / `private-gateway-canonical-direct-reviewed1.mjs`) remains completely untouched and observer-free.

---

## 2. Anchor Comparison & Exact Line Diffs

Only 5 small, explicitly counted anchors are added to attach and tear down the error-origin observer:

### Anchor 1: Observer Module Import
- **Location**: Line 19 (immediately following gateway fixture import).
- **Canonical Source**:
  ```javascript
  import {startGatewayFixture} from './private-gateway-canonical-direct-reviewed1.mjs';
  const env=parseEnv(fs.readFileSync('.env.local','utf8'))...
  ```
- **Proposed Fork**:
  ```javascript
  import {startGatewayFixture} from './private-gateway-canonical-direct-reviewed1.mjs';
  import {installErrorOriginObserver,stopErrorOriginObserver} from './api-error-origin-observer.mjs';
  const env=parseEnv(fs.readFileSync('.env.local','utf8'))...
  ```

### Anchor 2: Observer Lifecycle Handle Variable
- **Location**: Line 28 (state variables block).
- **Canonical Source**:
  ```javascript
  let inspectorFailureCount=0,inspectorWriteFailureCount=0,inspectorHealthy=false;
  const sockets=new Set();
  ```
- **Proposed Fork**:
  ```javascript
  let inspectorFailureCount=0,inspectorWriteFailureCount=0,inspectorHealthy=false;
  let stopObserver=null;
  const sockets=new Set();
  ```

### Anchor 3: Cleanup Anchor inside `cleanup()`
- **Location**: Line 73 (before application close).
- **Canonical Source**:
  ```javascript
  async function cleanup(){
   const errors=[];
   async function attempt(name,fn){
    try{await fn();}
    catch{errors.push(new Error(`Cleanup failed: ${name}`));}
   }
   if(app){
    await attempt('apiApp',async()=>{await app.close();report.appClosed=true;});
   }
  ```
- **Proposed Fork**:
  ```javascript
  async function cleanup(){
   const errors=[];
   async function attempt(name,fn){
    try{await fn();}
    catch{errors.push(new Error(`Cleanup failed: ${name}`));}
   }
   if(stopObserver){
    await attempt('errorOriginObserver',async()=>{
     await stopObserver();
     stopObserver=null;
    });
   }
   if(app){
    await attempt('apiApp',async()=>{await app.close();report.appClosed=true;});
   }
  ```

### Anchor 4: Observer Installation Anchor inside `mark('api')`
- **Location**: Lines 299–309 (after NestJS app initialization, before middleware / listen).
- **Canonical Source**:
  ```javascript
  mark('api');const {AppModule}=await import('../../../apps/api/dist/app.module.js');app=await NestFactory.create(AppModule,{logger:false,abortOnError:false});app.use('/api/media/webhook',raw({type:()=>true,limit:'64kb'}));await app.listen(apiPort,'0.0.0.0');const api=`http://127.0.0.1:${apiPort}`;
  ```
- **Proposed Fork**:
  ```javascript
  mark('api');const {AppModule}=await import('../../../apps/api/dist/app.module.js');app=await NestFactory.create(AppModule,{logger:false,abortOnError:false});
  const {CallsService}=await import('../../../apps/api/dist/modules/calls/calls.service.js');
  const {PublishingService}=await import('../../../apps/api/dist/modules/calls/publishing.service.js');
  const {CallLifecycleService}=await import('../../../apps/api/dist/modules/calls/call-lifecycle.service.js');
  const {RoomsService}=await import('../../../apps/api/dist/modules/rooms/rooms.service.js');
  const {PlaySessionsService}=await import('../../../apps/api/dist/modules/play-sessions/play-sessions.service.js');
  stopObserver=installErrorOriginObserver({
   app,
   pg,
   RoomServiceClient,
   services:{CallsService,PublishingService,CallLifecycleService,RoomsService,PlaySessionsService},
   evidenceDir:evidence
  });
  app.use('/api/media/webhook',raw({type:()=>true,limit:'64kb'}));await app.listen(apiPort,'0.0.0.0');const api=`http://127.0.0.1:${apiPort}`;
  ```

### Anchor 5: Startup Catch Restoration Anchor
- **Location**: Lines 410–413 (outer setup error handler).
- **Canonical Source**:
  ```javascript
  }catch(error){
   await cleanup().catch(()=>{});
   process.send?.({
  ```
- **Proposed Fork**:
  ```javascript
  }catch(error){
   if(stopObserver){
    await stopObserver().catch(()=>{});
    stopObserver=null;
   }
   await cleanup().catch(()=>{});
   process.send?.({
  ```

---

## 3. Byte-Exact Invariant Preservations

1. **No Application Source Changes**: `apps/api/src` and `apps/api/dist` remain completely untouched.
2. **Helper Directness**: The private gateway fixture and TURN shaper helpers remain completely direct and observer-free.
3. **Inspector Settlement**: Inspector connection reservation, process ID tracking, safe failure recording, socket end waiting, pool end verification, and health reporting are preserved with 0 modifications.
4. **Vite Preview Server & Web Assets**: Preview configuration, security headers plugin, index.html hash assertions, and bundle asset checks remain 100% byte-for-byte identical.
5. **IPC Message Protocol**: Handlers for `shape`, `shaping-stats`, `inspect`, and `stop` are preserved byte-for-byte.
6. **Reversibility**: Deleting Anchor 1–5 cleanly restores `fixture-server-canonical-direct-reviewed1.mjs`.
