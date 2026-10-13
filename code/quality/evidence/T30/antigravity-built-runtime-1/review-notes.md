# FG T30 — Built Frontend Runtime Fixture Review Notes

**Directory**: `quality/evidence/T30/antigravity-built-runtime-1`  
**Agent**: Antigravity (Gemini 3.6 Flash High)  
**Policy**: T30 only, NO Anti2 (`NO-ANTI2-01`), no subagents. Proposal only.  
**Execution Boundary**: Zero test, build, or browser runs executed. No edits outside `quality/evidence/T30/antigravity-built-runtime-1/`. No edits to application source, `apps/web/dist`, database schemas, ledger, or history. No claims of performance improvement or task PASS.

---

## 1. Measured Diagnostic Context & Problem Statement

- **Telemetry from Native24 (`api-loading-profile-timing-summary-1.json`)**:
  - The canonical build8 baseline passed real two-capture and single-video TURN RTP delivery, as well as the native unsubscribe-switch check.
  - Failure occurred at the original 5,000 ms initial third-actor room loading checkpoint (`Minh Anh` room/sidebar loading).
  - Diagnostic performance samples during room loading showed:
    - Host CPU utilization consistently reaching 99%–100%.
    - Minimum free system memory dropping to ~514 MB (539,533,312 bytes).
    - Substantial Node.js event-loop delays during startup and actor loading (mean event loop delay exceeding 1,000 ms, peak delay up to 5,926 ms).
    - Slowest `profiles.service.js` query took 403 ms, while connection pool acquisition reached 2,178 ms.
    - Idle PostgreSQL 12 read-only query commit durations remained nominal (mean 2.48 ms, max 3.66 ms).
- **Core Observation**:
  - The prior test fixture hosted the Vite development compiler/server (performing on-the-fly TypeScript compilation, JSX transformation, module graph dependency resolution, and file watching) and the NestJS backend API inside the **same single Node.js process**.
  - This observation highlights potential process-level event-loop and CPU resource contention between the dynamic dev bundler and the API, but **does not constitute proof of sole cause**.
  - In accordance with project policy, no unmeasured performance or overhead claims are made.
- **Objective**:
  - Transition the test fixture from the in-process Vite development compiler to the verified, pre-built production frontend runtime (`apps/web/dist`) using Vite's installed `preview()` server API.
  - Strictly preserve all existing functionality, security boundaries, authentication cookies, CSP headers, API/WS proxies, timeouts, and assertions.

---

## 2. Web Startup & Close Adapter Implementation

### A. Pre-Startup Build Provenance Verification
Before initializing the web server, the fixture strictly validates the pre-existing build evidence from `codex-t30-build-1.json` and `t30-build-1-index-review.json`:
1. Asserts that `codex-t30-build-1.json` has `exitCode === 0`.
2. Computes the SHA-256 hash of `apps/web/dist/index.html` and asserts that it matches `review.afterSha256` (`cb9d6e4d41a834467b8bc01d920ac5f77128c144290be95c02bbab12a233bd90`).
3. Validates that `review.activeAssets` contains exactly two active files, verifying their exact paths and SHA-256 hashes:
   - `apps/web/dist/assets/index-D6aTQDz5.js`: `4c2027b054ad531524c481b4a2166bb9cac4a5ab2ea6686739c2cd70967aee7f`
   - `apps/web/dist/assets/index-Dr0NL-IN.css`: `4b56270bfbb4ae498b170d8d2141ecaa82503a13f1653e897b8cf614053ba51b`
4. If any file is missing or has a hash mismatch, the fixture immediately throws an assertion error and aborts.
5. Retained historical assets in `apps/web/dist/assets/` are neither deleted nor rewritten. No new build was executed or permitted.

### B. Vite Preview Server Initialization
- Dynamically imports `{ preview, loadConfigFromFile }` from Vite (`apps/web/node_modules/vite/dist/node/index.js`).
- Loads `apps/web/vite.config.ts` in `mode: 'production'`.
- Preserves the canonical security headers plugin replacement:
  ```javascript
  const plugins = loaded.config.plugins.map(p =>
    p?.name === 'fg-security-headers'
      ? fgSecurityHeadersPlugin([origin, fixture.server, fixture.ws])
      : p
  );
  ```
- Configures `preview()` with explicit options:
  - `root`: `path.resolve('apps/web')` (directs Vite to serve `apps/web/dist`).
  - `host`: `'127.0.0.1'` (strictly bound to loopback).
  - `port`: dynamic port reserved for the web frontend.
  - `strictPort`: `true`.
  - `proxy`: forwards `/api` to the NestJS instance and `/socket.io` with WebSocket support (`ws: true`).
  - Overriding `preview.proxy` is necessary because Vite's `preview()` reads proxy configurations from `config.preview.proxy` rather than `config.server.proxy`.
- Vite's `preview()` automatically starts listening on the HTTP server; no redundant `.listen()` call is made.

### C. Explicit Minimal `httpServer` and Close Adapter
- `PreviewServer` exposes `httpServer` as a native Node.js HTTP server.
- The `web` reference is constructed as:
  ```javascript
  web = {
    httpServer: previewServer.httpServer,
    close: () => new Promise((resolve, reject) => {
      previewServer.httpServer.close(err => {
        if (!err || err.code === 'ERR_SERVER_NOT_RUNNING') resolve();
        else reject(err);
      });
    })
  };
  ```
- **Socket Tracking**: Canonical socket tracking is preserved byte-identically:
  ```javascript
  web.httpServer.on('connection', socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  ```
- **Cleanup Semantics**:
  - In `cleanup()`, all tracked sockets in `sockets` are destroyed first (`socket.destroy()`).
  - `await web.close()` invokes `httpServer.close()`.
  - If the server has already closed or is not running, `ERR_SERVER_NOT_RUNNING` is handled idempotently without throwing.
  - Unexpected errors reject the promise, preventing `report.webClosed` from becoming `true`.
  - `report.webClosed = true` is set only after the close promise successfully resolves.

---

## 3. Preserved Canonical Rest & Security Architecture

1. **Zero Observers Installed**:
   - The fixture contains strictly zero performance or locking observers (no `instrumentOwnedApiPools`, no `instrumentOwnedHttpTiming`, no `startOwnedPerformanceTiming`).
   - Line 18 retains canonical `import { startGatewayFixture } from './private-gateway-shaped-fixture.mjs';`.
2. **Backend API and Media Services**:
   - NestJS API (`AppModule`) runs full production routing, media webhook middleware (`raw` parser), and listens on `0.0.0.0:${apiPort}` for internal Docker/SFU webhook access.
   - LiveKit SFU, RoomServiceClient, dynamic shaper control, and TURN TCP configuration remain 100% canonical.
3. **Database & Cache State**:
   - Isolated PostgreSQL schema `t30_screen_*` created and torn down via cascade drop.
   - Redis presence namespace scoped and cleared on cleanup.
4. **Content Security Policy (CSP)**:
   - `fgSecurityHeadersPlugin` in preview mode reads `apps/web/dist/index.html` and computes SHA-256 hashes for all inline scripts.
   - In preview mode, development HMR WebSocket URLs (`ws://127.0.0.1:...`) are omitted, maintaining strict production CSP boundaries.
   - Allowed connect origins strictly include `self`, the web origin, SFU HTTP origin, and SFU WS origin.
5. **Actor Authentication & State**:
   - 6 test actors seeded with valid sessions, game interests, and `better-auth` HMAC signature cookies.
   - Single recruitment created, play session started, and initial room/conversation memberships established.
6. **Inspection & Shaper Protocols**:
   - IPC handlers for `shape`, `shaping-stats`, `inspect`, and `stop` messages remain byte-identical.

---

## 4. Pinned Artifact & Evidence Hashes

| Component | Path | SHA-256 Hash |
| :--- | :--- | :--- |
| **Canonical Base Fixture** | `quality/evidence/T30/antigravity-gateway-db-ready-1/fixture-server-shaped.mjs` | `bfd4c5fe5131ea69b4240858e1249bdfe9663e7142b65ede609ee9951f06b3a2` |
| **Build 1 Exit Evidence** | `quality/evidence/T30/codex-t30-build-1.json` | `5441ceec1ec82f19bf812f7ef574534be624b1466132879f21b3e2c6d94f70f1` |
| **Build 1 Review Record** | `quality/evidence/T30/t30-build-1-index-review.json` | `4f4c83653f60a71ee133a7409f7713218d991065d83c5b625af6055caa309402` |
| **Built Entry HTML** | `apps/web/dist/index.html` | `cb9d6e4d41a834467b8bc01d920ac5f77128c144290be95c02bbab12a233bd90` |
| **Active Built JS** | `apps/web/dist/assets/index-D6aTQDz5.js` | `4c2027b054ad531524c481b4a2166bb9cac4a5ab2ea6686739c2cd70967aee7f` |
| **Active Built CSS** | `apps/web/dist/assets/index-Dr0NL-IN.css` | `4b56270bfbb4ae498b170d8d2141ecaa82503a13f1653e897b8cf614053ba51b` |
| **Proposal Built Fixture** | `quality/evidence/T30/antigravity-built-runtime-1/fixture-server-shaped.mjs` | `6cf006cb42df96a40478900b47a4ba116d66538c1b6d5175debb27f8677ad3a3` |

---

## 5. Acceptance & Diagnostic Disclaimer

- This is a proposal for test fixture execution using the pre-built frontend runtime.
- No tests, builds, or browser runs were executed by this agent.
- `node --check` was executed on `fixture-server-shaped.mjs` (exit code 0).
- Visual and native acceptance remain pending until Codex reviews, gate-adopts, and runs the headed test suite sequentially.
- Test assertions, timers (5s, 25s, 45s), deadlines, and media requirements (`getDisplayMedia`, RTP streams) remain completely unchanged.
