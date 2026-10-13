# Canonical Observer-Free Fixture & Direct Gateway Helper Proposal (antigravity-native60-canonical-direct-1)

## 1. Executive Summary & Objective

This proposal establishes the **strictly controlled canonical observer-free fixture server** and **direct gateway helper** required for eventual original frozen test acceptance prior to any application fix for **T30**.

All original assertions, deadlines (45000ms), private LiveKit SDK authority, quota enforcement, shaped RTP network simulation, screen capture verification, mobile drawer interactions, and layout checks are strictly retained without modification.

> [!IMPORTANT]
> **Non-Causality & Acceptance Disclaimer**:
> Removing diagnostic instrumentation, wrappers, preloads, or switching the gateway PostgreSQL route from host-published port mapping to the direct Docker bridge network (`fg-local_default`) does **NOT** cure transaction locking contention or prove a unique root cause.
> An observer-free canonical baseline is an absolute requirement for baseline validation prior to any application fix, but removing observers does not claim any causal remedy.
> `nativeAcceptance: false` is maintained throughout.

---

## 2. Background: Native60 Run & Boundary Inspection

The Native60 execution (`t30-native-593b5b067ea6420b92904ba12cd24810`) ran between 19:21:47.747Z and 19:25:05.874Z, exiting with code 1:
- **Milestones**: 3 user joins succeeded, 2 live captures succeeded.
- **Failure**: Original 5s assertion failed at line 52/66 (`expected 2 stream tabs, got 1`), with 0 completed capture/RTP measurement windows.
- **Telemetry**:
  - 5 gateway room-lock statement timeouts (`57014`) on backend PIDs 6228, 6229, 6230, 6231 between 19:24:14Z and 19:24:29Z.
  - 15 matching PostgreSQL wait samples blocked by API backend PIDs 6254, 6295, 6349, 6355, and 6429 during `CallsService.participants`, `CallsService.list`, `CallsService.withControlGroup`, `CallLifecycleService.reconcileGroup`, and `TeamsService.transaction`.
  - API pool timeouts resulting in HTTP 500 errors.
- **Discipline**: Temporal association between room lock timeouts and stream tab absence does not prove that binding removal catches or any single isolated component caused the failure. No unsupported causal leaps or synthetic remedies are introduced.

---

## 3. Strict Architectural Invariants

1. **Zero Application Source Modifications**: No files in `apps/api/`, `apps/web/`, `packages/`, etc. are modified.
2. **Zero Test File / Assertion Modifications**: The frozen test suite and its original timeouts remain completely untouched.
3. **Pure Zero-Instrumentation Gateway Launch**:
   - Gateway container is invoked without `-r /gateway/preload.cjs`.
   - Gateway container is invoked without `startup-entry.cjs` or any diagnostic wrapper.
   - Command line is strictly:
     ```bash
     node /gateway/app/gateway-main.js /gateway/input.json
     ```
   - Neither the API nor the gateway contains ALS monkey-patching, request tracking hooks, or custom metrics wrappers.
4. **Direct Route Placement**:
   - Container connects to `fg-local_default` network using `createDirectGateway` before starting.
   - Database hostname resolves to alias `fg-local-postgres-1:5432` inside Docker.
5. **Preflight and Cleanup Verification**:
   - Database URL is preflight-verified against running containers `fg-local-postgres-1` and `fg-local-redis-1`.
   - Cleanup strictly verifies that neither main PostgreSQL nor Redis containers or their network settings were altered.

---

## 4. Counted Exact Anchors

### Gateway Helper: `private-gateway-canonical-direct-reviewed1.mjs`
Derived from `quality/evidence/T30/private-gateway-shaped-fixture.mjs` via **4 counted exact anchors**:

1. **Anchor 1 (Direct Support Import)**:
   - *Target*: Immediately following URL imports (lines 6–7).
   - *Diff*: Adds `import {prepareDirectDatabase,createDirectGateway,inspectDirectCleanup} from './gateway-direct-support-reviewed1.mjs';`.
2. **Anchor 2 (Direct Database Preflight)**:
   - *Target*: Database URL preparation (line 92).
   - *Diff*: Replaces `const connection=new URL(databaseURL);connection.hostname='host.docker.internal';` with `const directDatabase=prepareDirectDatabase(docker,databaseURL),connection=directDatabase.connection;`.
3. **Anchor 3 (Direct Cleanup Verification)**:
   - *Target*: `close()` function return block (lines 140–142).
   - *Diff*: Incorporates `inspectDirectCleanup(docker,directDatabase)` into result and asserts `result.mainServicesUnchanged && result.existingNetworkUnchanged`.
4. **Anchor 4 (Direct Container Creation & Network Attachment)**:
   - *Target*: Gateway container startup (lines 158–159).
   - *Diff*: Replaces standard `docker run -d` with `createDirectGateway(...)` which executes `docker create`, attaches `fg-local_default`, verifies labels/read-only flags, and starts the container.

### Fixture Server: `fixture-server-canonical-direct-reviewed1.mjs`
Derived from `quality/evidence/T30/fixture-server-build2-inspector-reserved-reviewed1.mjs` via **1 counted exact anchor**:

1. **Anchor 1 (Gateway Helper Import)**:
   - *Target*: Line 18.
   - *Original*: `import {startGatewayFixture} from './private-gateway-shaped-fixture.mjs';`
   - *Canonical*: `import {startGatewayFixture} from './private-gateway-canonical-direct-reviewed1.mjs';`

---

## 5. Reverse Byte Equality Proof

The verification script `prepare-canonical-direct.mjs` programmatically proves reverse byte equality:
- Applying reverse substitutions of the 4 helper anchors to `private-gateway-canonical-direct-reviewed1.mjs` yields `private-gateway-shaped-fixture.mjs` byte-for-byte (`Buffer.compare === 0`).
- Applying reverse substitution of the 1 fixture anchor to `fixture-server-canonical-direct-reviewed1.mjs` yields `fixture-server-build2-inspector-reserved-reviewed1.mjs` byte-for-byte (`Buffer.compare === 0`).
- Zero foreign bytes, accidental whitespace changes, or unintended mutations exist.

---

## 6. Full Canonical Smoke Controls Overview

The accompanying `controls-plan.json` establishes deterministic controls across all layers:
- **Preflight Phase**: Database URL valid, Docker daemon accessible, `fg-local-postgres-1` and `fg-local-redis-1` healthy.
- **Fixture Readiness**: Database migration, game seeding, 6 actor accounts, reserved inspector client PID verification.
- **Gateway Readiness**: SFU healthy, shaped TURN/TCP listener ready, direct gateway container healthy within 40 retries / 250ms polling deadline.
- **HTTP & Frontend Validation**: Vite preview server active, CSP headers include origin and fixture endpoints, asset digests match build-2 review.
- **Private Native Signaling**: Private WS `/rtc` upgrade verified without leaking public upstream SFU port.
- **Actor State**: Sender, receiver, and third actor joined state inspected via retained database inspector client.
- **Strict Settlement Cleanup**: Schema cascade drop, Redis presence key removal, media containers destroyed, network removed, main services and networks verified unchanged.
