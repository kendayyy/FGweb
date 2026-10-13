# FG T30 Native47 RTP Window Diagnostic Proposal (Proposal 1)

## 1. Context & Native47 Failure Review

The canonical Native47 run recorded in [`quality/evidence/T30/native47-photo-timing-review1.json`](file:///E:/FGweb/code/quality/evidence/T30/native47-photo-timing-review1.json) executed with the following outcome:

- **Joins (All 3 Succeeded)**:
  - Owner: 4,864 ms (`12:59:13.916Z`)
  - Linh: 4,241 ms (`12:59:24.154Z`)
  - MinhAnh: 6,088 ms (`12:59:36.546Z`)
- **Screen Publications (Both Succeeded)**:
  - First publication: 8,235 ms (`12:59:44.832Z`)
  - Second publication: 13,385 ms (`12:59:58.408Z`)
- **Initial RTP Transmission**:
  - `initialRtpVideoBytes`: 24,176 bytes received during initial 3-second window on Linh's stream.
- **Stream Switch**:
  - Viewer clicked tab `'Hoàng Nam'` to switch active stream.
  - Subscription forward delay was 1,130 ms.
  - Gateway and API observers recorded 0 query errors, 0 RPC errors, and healthy completion.
- **The Failure Point**:
  - At line 64:338 of [`tests/e2e/screen-share.spec.ts`](file:///E:/FGweb/code/tests/e2e/screen-share.spec.ts):
    `Switched stream original3s RTP delta expectedone video with bytesDelta>1000 receivedzero at64:338`
- **Root Diagnostic Problem**:
  - In [`receiveOne(page: Page)`](file:///E:/FGweb/code/tests/e2e/screen-share.spec.ts#L59):
    ```typescript
    async function receiveOne(page:Page){
      const before=await stats(page);
      await page.waitForTimeout(3000);
      const after=await stats(page),rows=delta(before,after);
      expect(after.relay).toBe(true);
      expect(after.videoCount).toBe(1);
      const videos=rows.filter(r=>r.kind==='video'&&r.bytesDelta>1000);
      expect(videos).toHaveLength(1);
      expect(videos[0].packetsDelta).toBeGreaterThan(0);
      fs.appendFileSync(evidence+'/subscriptions.jsonl',JSON.stringify({before,after,delta:rows})+'\n');
      return after;
    }
    ```
  - `fs.appendFileSync(...)` was placed **after** `expect(videos).toHaveLength(1)`.
  - When the assertion failed because `bytesDelta === 0`, execution immediately jumped to the `catch` block, leaving `switchedWindowStatsMissing: true`. All before, after, and delta stats for the switched window were lost.

---

## 2. Minimal Observation Hook Architecture

The diagnostic proposal isolates the test and introduces a single, low-perturbation observation hook:

### 2.1 Lowest-Perturbation Two-Stage Design
1. **Immediate Pre-Assertion Persistence (Zero Side Effects)**:
   - Before evaluating `expect(after.relay).toBe(true)` or `expect(videos).toHaveLength(1)`, the hook immediately writes `{ at, label, before, after, delta }` to `${evidence}/subscriptions.jsonl`.
   - If downstream assertions fail, all WebRTC stats from the exact 3-second measurement window are guaranteed to be persisted on disk.
2. **Bounded Post-Window Diagnostic Inspection**:
   - Immediately after persisting the measured window, the hook queries all active windows in `windows` (`Map<string, { page: Page; source?: Page; context: BrowserContext }>`).
   - **Strict Invariants**:
     - **NO** `page.bringToFront()` calls.
     - **NO** `page.focus()` calls.
     - **NO** DOM mutation or visibilityState alteration.
     - Each evaluation is strictly bounded by a 5,000 ms timeout.
     - Fails closed on any unexpected timeout or evaluation error (records sanitized phase, re-throws, never swallows).
   - **Whitelisted Metrics Collected**:
     - `outbound-rtp`: `bytesSent`, `packetsSent`, `framesEncoded`, `framesSent`, `frameWidth`, `frameHeight`, `framesPerSecond`, `qualityLimitationReason`, retransmitted counts.
     - `media-source`: `width`, `height`, `frames`, `framesPerSecond`.
     - `inbound-rtp`: `bytesReceived`, `packetsReceived`, `packetsLost`, `jitter`, `framesDecoded`, `framesReceived`, dimensions.
     - Capture tracks (`window.t30Captures`): `id`, `kind`, `readyState`, `enabled`, `muted`.
     - Video DOM elements (`document.querySelectorAll('video')`): `readyState`, `paused`, `videoWidth`, `videoHeight`, client dimensions, bounding rect, `srcObject` track states.
     - Capture source page: `visibilityState`, CSS `animationPlayState`, `performance.now()`.
     - **Zero Private Data**: No DOM text, no URLs, no request headers, no tokens, no JWTs.

---

## 3. Exact Reconstruction Proof

The test clone [`screen-share-diagnostic1.spec.ts`](file:///E:/FGweb/code/quality/evidence/T30/antigravity-native47-rtp-window-1/screen-share-diagnostic1.spec.ts) is constructed so that reversing the minimal diagnostic additions reproduces the frozen canonical test byte-for-byte:

1. Revert `import {captureUiStep} from '../../../../tools/telegram-bridge/demo-stream.mjs';` back to `../../tools/telegram-bridge/demo-stream.mjs`.
2. Remove `import {observeRtpWindow} from './rtp-window-observer1.js';\n`.
3. Remove `await observeRtpWindow({evidence,before,after,delta:rows,windows,label:'receiveOne'});`.

### Verification Command:
```javascript
const fs = require('fs');
const crypto = require('crypto');
const diag = fs.readFileSync('quality/evidence/T30/antigravity-native47-rtp-window-1/screen-share-diagnostic1.spec.ts', 'utf8');
const reverted = diag
  .replace("import {captureUiStep} from '../../../../tools/telegram-bridge/demo-stream.mjs';", "import {captureUiStep} from '../../tools/telegram-bridge/demo-stream.mjs';")
  .replace("import {observeRtpWindow} from './rtp-window-observer1.js';\n", "")
  .replace("await observeRtpWindow({evidence,before,after,delta:rows,windows,label:'receiveOne'});", "");
const hash = crypto.createHash('sha256').update(reverted).digest('hex');
console.log(hash === '8e126efd434516a6870e9f48029c4317cc2a427e78d3157e660b00ebdba10cc8'); // true
```
The reconstructed hash exactly matches the canonical frozen hash `8e126efd434516a6870e9f48029c4317cc2a427e78d3157e660b00ebdba10cc8`.

---

## 4. Delivered Proposal Artifacts

All files are delivered under [`quality/evidence/T30/antigravity-native47-rtp-window-1/`](file:///E:/FGweb/code/quality/evidence/T30/antigravity-native47-rtp-window-1/):

| File | Description |
|---|---|
| [`rtp-window-observer1.ts`](file:///E:/FGweb/code/quality/evidence/T30/antigravity-native47-rtp-window-1/rtp-window-observer1.ts) | Observation hook module implementing immediate pre-assertion persistence and bounded post-window WebRTC/DOM inspection |
| [`screen-share-diagnostic1.spec.ts`](file:///E:/FGweb/code/quality/evidence/T30/antigravity-native47-rtp-window-1/screen-share-diagnostic1.spec.ts) | Diagnostic test clone preserving original 3-second measurement window and all assertions with inserted hook in `receiveOne` |
| [`playwright-diagnostic1.config.ts`](file:///E:/FGweb/code/quality/evidence/T30/antigravity-native47-rtp-window-1/playwright-diagnostic1.config.ts) | Playwright configuration targeting `screen-share-diagnostic1.spec.ts` with identical timeouts, workers, and headed mode |
| [`run-native47-diagnostic-parent1.mjs`](file:///E:/FGweb/code/quality/evidence/T30/antigravity-native47-rtp-window-1/run-native47-diagnostic-parent1.mjs) | Parent runner clone with host metrics sampling, container cleanup tracking, and exit code preservation |
| [`plan.md`](file:///E:/FGweb/code/quality/evidence/T30/antigravity-native47-rtp-window-1/plan.md) | This technical diagnostic plan |

---

## 5. Scope Boundaries, Invariants & Honest Non-Claims

1. **No Application Fixes**: Zero modifications to application source files (`apps/web/src/features/calls/media.ts`, `LiveViewer.tsx`, or `CallPanel.tsx`).
2. **No Assertion or Timing Weakening**:
   - The measurement window remains exactly 3,000 ms (`await page.waitForTimeout(3000)`).
   - Assertion `expect(videos[0].bytesDelta).toBeGreaterThan(1000)` is NOT lowered.
   - No adaptive streaming or dynacast overrides.
3. **No Native Acceptance Claim**: This proposal is strictly a diagnostic instrument to collect the missing `before`, `after`, and sender `outbound-rtp` metrics to determine whether the SFU stopped forwarding or the sender stopped encoding.
4. **Execution Boundaries**: No tests, builds, or Docker processes were executed during this turn. All proposal files are held for root Codex review.
