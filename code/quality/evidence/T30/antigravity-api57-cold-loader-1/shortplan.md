# FG T30 — Isolated Cold Loader Boundary Diagnostic Proposal

## 1. Problem Statement & Root Diagnostic Context

During root's API57 verification runs (`normal 1` and `normal 2`), gateway readiness timed out with RED after 90 seconds before any UI interactions or test commands were dispatched:
- `normal 1`: `18:38:19.020Z`–`18:40:17.451Z` (readiness RED)
- `normal 2`: `18:41:45.181Z`–`18:42:44.417Z` (resource-only retry, readiness RED)

In both runs:
1. The gateway container (`fg-gateway-${id}`) was successfully created and started without an OOM condition or abnormal exit.
2. The SFU container (`fg-sfu-${id}`) became fully ready on port 7880.
3. The gateway process produced zero initial console logs (`Private media admission gateway ready`) and failed the 40-iteration 10-second readiness polling deadline against `http://127.0.0.1:${port}/health`.
4. Subsequent inspection confirmed that Cockpit PID `69608`/`69956` and Supabase 20 were restored, proving environment stability.

## 2. Hypothesis

On Windows hosts running Docker Desktop (WSL2 / 9P VFS), dynamic CommonJS module resolution and V8 parsing across host bind mounts (`apps/api/dist/modules/calls` and root `node_modules`) introduce severe I/O latency. Deep package trees—especially `@livekit/protocol` with massive generated Protobuf code, `livekit-server-sdk`, `pg`, and `ws`—combined with the entry-point observer preload script (`-r /gateway/preload.cjs`), can delay JavaScript execution by tens of seconds before `gateway-main.js` can bind its HTTP listener and serve the initial health probe.

This diagnostic measures the cold module resolution and V8 parsing latency in total isolation, comparing:
- **Cycle A (`without-preload`)**: Raw CJS module resolution directly from Windows host bind mounts.
- **Cycle B (`with-preload`)**: CJS module resolution with the observer preload script (`gateway-observer-preload-reviewed2.cjs`) active.

## 3. Strict Boundary & Non-Intrusive Design

1. **Zero Database / Network Dependencies**:
   - The diagnostic runs with `--network none`. No connections to PostgreSQL, Redis, SFU, or external hosts are attempted.
2. **Zero Code / Test Mutations**:
   - No changes to application code, tests, build artifacts, environments, mutable fixtures, checker, or ledger.
   - `nativeAcceptance: false` remains immutable.
3. **Read-Only Bind Mounts**:
   - `/gateway/loader-child.cjs` (read-only)
   - `/gateway/preload.cjs` (read-only)
   - `/gateway/app` (read-only, mapped to `apps/api/dist/modules/calls`)
   - `/gateway/node_modules` (read-only, mapped to root `node_modules`)
   - `/gateway/output` (writable scratch mount mapped to ephemeral `.runtime/t30/cold-loader-<id>/output`)
4. **Security & Containment**:
   - Pinned image: `node:24.21.0-bookworm-slim@sha256:51b1100cc2a83d370c6a60952e3f2989c8a43159d0e38586e090f3b3326efefd`
   - Container flags: `--pull=never`, `--read-only`, `--cap-drop ALL`, `--security-opt no-new-privileges`, `--user node`.
   - Bounded execution timeout: 60s per cycle.
   - Bounded result payload: fail-closed if > 64 KiB.
5. **Recovery Contract**:
   - Pre- and post-inspection ensures `fg-local-postgres-1` and `fg-local-redis-1` remain healthy and untouched.
   - Verifies `fg-local_default` network remains identical.
   - Strictly removes ephemeral containers and private runtime scratch directories in `finally`.

## 4. Measured Dependency Stages

The diagnostic child (`loader-child.cjs`) executes `createRequire('/gateway/app/gateway-main.js')` to replicate the exact module resolution context of `gateway-main.js`, measuring monotonic durations for:

1. `pg` (PostgreSQL client driver)
2. `livekit_sdk` (`livekit-server-sdk`)
3. `livekit_protocol` (`@livekit/protocol` Protobuf definitions)
4. `ws` (WebSocket server)
5. `lease_store` (`./lease-store.js` admission query module)
6. `signaling_gateway` (`./signaling-gateway.js` admission gateway class)

It also records:
- `entryMonotonicMs`: Process startup monotonic timestamp when `loader-child.cjs` begins execution.
- `preloadInstalled`: Verification that `globalThis.__FG_GATEWAY_OBSERVER_PRELOAD__` was established.
- `comparisonSummary`: Deltas between Cycle A and Cycle B for entry time, individual stages, and total duration.

## 5. Source Artifact Hashes

- `apps/api/dist/modules/calls/gateway-main.js`: `e0a44649044b3cfe3d040b3d74a409bbc3eb877e7adc96195e91637aa114a4ad`
- `apps/api/dist/modules/calls/signaling-gateway.js`: `ffb898afe1826a1d79344e7a44df990ac55dfb7ed335e1b9253097add522548e`
- `apps/api/dist/modules/calls/lease-store.js`: `b459d3dd7e8241773f6c3f9f56ab4dfe06a43375a979583635810008221c64ae`
- `quality/evidence/T30/gateway-observer-preload-reviewed2.cjs`: `3dafab5f83009e77df88b7ae6dd4229e6bce657ca2a243cf7a3ae1ec23ab3729`
- `quality/evidence/T30/antigravity-api57-cold-loader-1/loader-child.cjs`: `0acf035b4a085cbe22f41b8a1e755b64bd084543c48b6c302f9ed7741a29e862`
- `quality/evidence/T30/antigravity-api57-cold-loader-1/loader-runner.mjs`: `21b61de0d4e2109e2f552c75cb012964433b4355a1079000152551e7465285bf`
