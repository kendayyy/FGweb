# FG T30 — Minimal Gateway Startup Boundary Diagnostic Proposal

## 1. Context & Rationale

Root's benchmark in `loader-control-review1.json` confirmed that isolated CommonJS module resolution and V8 parsing across host bind mounts succeed in both modes:
- Without preload: ~6.9s total across dependency stages (`pg`, `ws`, `livekit_sdk`, `livekit_protocol`, `lease_store`, `signaling_gateway`).
- With preload: ~5.5s total (preload evaluation 5.5s, subsequent cached requires < 15ms).

However, isolated imports do not instantiate `createSignalingGateway()`, connect to PostgreSQL, or start HTTP/WebSocket listeners. In live container runs (Native59 and API57 normal 2), gateway readiness timed out with RED after 90 seconds before HTTP checks could pass, and container 2 produced zero initial console logs.

To determine where execution stalls during real container startup without guessing, this proposal introduces a minimal diagnostic startup wrapper (`startup-entry.cjs`) around actual gateway execution.

---

## 2. Minimal Diagnostic Wrapper (`startup-entry.cjs`)

The wrapper runs as the container entrypoint (`node /gateway/startup-entry.cjs /gateway/input.json`) and establishes three observable execution milestones:

1. **Process Entry Milestone**: Emits builtins `entry` marker immediately upon V8 entry before any application or observer modules are required.
2. **Preload Evaluation Milestone**: Records `begin` timestamp, evaluates `require('/gateway/preload.cjs')`, verifies `globalThis.__FG_GATEWAY_OBSERVER_PRELOAD__`, and emits `end` with monotonic duration.
3. **Gateway Main Milestone**: Records `begin` timestamp, evaluates `require('/gateway/app/gateway-main.js')`, and emits `end` with monotonic duration.

### Strict Invariants

- **Prefix & Schema**: All lines use safe stdout prefix `[FG_GATEWAY_STARTUP] ` with strict JSON fields (`sequence`, `type`, `stage`, `at`, `elapsedMs`, `ok`, `code`, `durationMs`).
- **Privacy & Redaction**: Never emits arguments, environment variables, error messages, URLs, credentials, or SQL text.
- **Error Handling**: On failure, maps to a fixed error code enum (`MODULE_NOT_FOUND`, `SYNTAX_ERROR`, `TYPE_ERROR`, `STARTUP_FAILED`) and **rethrows the exact exception identity**, ensuring downstream container stderr handlers and root's `redactor(text)` receive original errors.
- **Bounded I/O**: $\le 8$ rows total, $\le 1024$ bytes per row, using synchronous `fs.writeSync(1, ...)` complete byte loops.
- **Arguments Preservation**: `process.argv[2]` remains `/gateway/input.json`, identical to original direct execution.
- **Loading Order**: Original preload before main order is strictly preserved.
- **Zero Source Modifications**: `apps/api/dist/modules/calls/gateway-main.js` source is never modified.
- **No Method Wrappers**: No wrappers around `Pool`, `query`, `RPC`, or `HTTP` methods are introduced in this wrapper.
- **No Fake Ready**: The `main END` marker indicates only that synchronous script evaluation finished; it is **not** ready. The canonical ready log (`Private media admission gateway ready`) remains inside `gateway.server.listen()`, and HTTP readiness remains subject to the original 40 retries / 250ms polling assertions against `/health`.

---

## 3. Minimal Exact-Anchor Changes

### Helper Modification (`private-gateway-db-bridge-startup-reviewed1.mjs`)
Derived from `quality/evidence/T30/private-gateway-db-bridge-observer-reviewed1.mjs` with only one contiguous anchor change:

```diff
  const preloadMount=path.resolve(root,'quality/evidence/T30/gateway-observer-preload-reviewed2.cjs');
+ const startupMount=path.resolve(root,'quality/evidence/T30/startup-entry-reviewed1.cjs');
  const gateway=createDirectGateway({docker,containers,id,network,args:['create','--pull=never','--label',`fg-owner=t30-gateway-${id}`,'--name',`fg-gateway-${id}`,'--network',network,'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--user','node','-p','127.0.0.1::7883',
    '--mount',`type=bind,source=${preloadMount},target=/gateway/preload.cjs,readonly`,
+   '--mount',`type=bind,source=${startupMount},target=/gateway/startup-entry.cjs,readonly`,
    '--mount',`type=bind,source=${path.resolve(root,'apps/api/dist/modules/calls')},target=/gateway/app,readonly`,
    '--mount',`type=bind,source=${path.resolve(root,'node_modules')},target=/gateway/node_modules,readonly`,
    '--mount',`type=bind,source=${path.resolve(dir,'gateway.json')},target=/gateway/input.json,readonly`,
    nodeImage,
    'node',
-   '-r','/gateway/preload.cjs','/gateway/app/gateway-main.js','/gateway/input.json'
+   '/gateway/startup-entry.cjs','/gateway/input.json'
  ]});
```

All other lines, including dual DB network attachment, 40 retry / 250ms polling, 110s deadline, 55s cleanup, and teardown assertions, remain 100% byte-identical.

### Fixture Server Modification (`fixture-server-api57-db-bridge-reviewed1.mjs`)
Derived from `quality/evidence/T30/fixture-server-api57-db-bridge-reviewed1.mjs` with only line 21 import changed:

```diff
- import {startGatewayFixture} from './private-gateway-db-bridge-observer-reviewed1.mjs';
+ import {startGatewayFixture} from './private-gateway-db-bridge-startup-reviewed1.mjs';
```

All other 410 lines remain 100% byte-identical.

---

## 4. Reversal Byte Equality Proof

The script [`prepare-startup-boundary.mjs`](file:///E:/FGweb/code/quality/evidence/T30/antigravity-api57-startup-boundary-1/prepare-startup-boundary.mjs) verifies that:
1. Reversing the anchor replacement on `private-gateway-db-bridge-startup-reviewed1.mjs` reproduces the original `private-gateway-db-bridge-observer-reviewed1.mjs` byte-for-byte (`a265e42ad94d0601ec2c15115674531479a1f33c99ada2a98e68138040514255`).
2. Reversing line 21 on `fixture-server-api57-db-bridge-reviewed1.mjs` reproduces the original fixture server byte-for-byte (`cf3cd4f2d9f17a4241664e1905d74cc0c768111881e0bbc2024b44b64015cdbf`).

---

## 5. Scope & Boundary Adherence

- **Write Scope**: Exclusively inside `quality/evidence/T30/antigravity-api57-startup-boundary-1/**`.
- **Zero Outside Writes**: Never wrote history, invocation/completion files, application source, frozen tests, mutable fixtures, ledger, or environment files.
- **Zero Execution**: No Docker, tests, browser, or CLI execution occurred.
- **Status**: `nativeAcceptance: false`; `T30 IN_PROGRESS`.
