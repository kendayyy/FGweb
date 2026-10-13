# FG T30 — Fixture Server Minimal SDK Hook Patch Instructions

## 1. Motivation and Problem Summary
In `fixture-server-api42-reviewed2.mjs`, only the ESM `RoomServiceClient` was instrumented:
```javascript
import { RoomServiceClient } from 'livekit-server-sdk';
...
instrumentRoomServiceClient(RoomServiceClient, evidence);
```
However, the compiled Nest backend services (`CallsService` and `CallLifecycleService`) in `apps/api/dist/modules/calls/` are CommonJS modules. They execute:
```javascript
const livekit_server_sdk_1 = require("livekit-server-sdk");
...
new livekit_server_sdk_1.RoomServiceClient(...)
```
In Node.js, `import ... from 'livekit-server-sdk'` and `require('livekit-server-sdk')` resolve to separate module instances with distinct `RoomServiceClient` prototypes (`esmPrototypeSameAsCompiledCalls: false`).
Consequently, all native SFU RPC operations initiated by `CallsService` under database transactions bypassed the observer, resulting in an uninstrumented coverage gap (`rpcUnderTransactionCount: 0`).

---

## 2. Minimal Code Patch (Diff)

To instrument both constructors in a single installation without modifying application source files or reformatting the fixture server:

```diff
--- quality/evidence/T30/fixture-server-api42-reviewed2.mjs
+++ quality/evidence/T30/fixture-server-api42-reviewed3.mjs
@@ -1,4 +1,4 @@
-import {instrumentOwnedApiPools,instrumentRoomServiceClient,instrumentOwnedApiServices,instrumentHttpTimingMiddleware,startApiLockSpansObserver} from './api42-observer-reviewed2.mjs';
+import {instrumentOwnedApiPools,instrumentRoomServiceClient,instrumentOwnedApiServices,instrumentHttpTimingMiddleware,startApiLockSpansObserver} from './api-lock-spans-observer3.mjs';
 import {startOwnedPgWaitObservation} from './pg-wait-observation-reviewed2.mjs';
 import 'reflect-metadata';
 import fs from 'node:fs';
@@ -9,6 +9,7 @@
 import {parseEnv} from 'node:util';
 import {createServer as reservePort} from 'node:net';
 import {pathToFileURL} from 'node:url';
+import {createRequire} from 'node:module';
 import pg from 'pg';
 import Redis from 'ioredis';
 import {drizzle} from 'drizzle-orm/node-postgres';
@@ -23,3 +24,7 @@
 const evidence=process.env.FG_T30_EVIDENCE_DIR;
 assert(evidence?.startsWith('quality/evidence/T30/'));fs.mkdirSync(evidence,{recursive:true});
-instrumentOwnedApiPools(pg,evidence);instrumentRoomServiceClient(RoomServiceClient,evidence);
+
+const requireFromCalls = createRequire(new URL('../../../apps/api/dist/modules/calls/calls.service.js', import.meta.url));
+const { RoomServiceClient: CjsRoomServiceClient } = requireFromCalls('livekit-server-sdk');
+
+instrumentOwnedApiPools(pg,evidence);
+instrumentRoomServiceClient([RoomServiceClient, CjsRoomServiceClient], evidence);
```

---

## 3. Invariants Preserved
- No changes outside the exact SDK import and hook.
- Retains original PostgreSQL sampler (`startOwnedPgWaitObservation`).
- Retains full resource cleanup (Nest app, web server, media containers, Redis keys, schema drop).
- Retains independent stop status verification writing `api-observer-stop-status.json`.
- Both constructors are instrumented BEFORE `AppModule` or compiled services are imported.
