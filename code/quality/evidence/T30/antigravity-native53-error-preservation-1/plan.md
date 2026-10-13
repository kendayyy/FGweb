# T30 Error Preservation & Diagnostic Isolation Plan (Proposal 1)

## 1. Problem Formulation & Native53 Incident Analysis

### 1.1 The Native53 Masking Incident
During canonical Native53 execution:
1. The diagnostic test clone successfully performed 3 actor joins, 2 native screen captures, initial RTP video reception (17,220 bytes), and stream selection DOM interaction.
2. At `14:40:20Z`, a test assertion failed (e.g. within `receiveOne` or subsequent video/subscription assertions).
3. The test catch block was entered:
   ```typescript
   } catch (error) {
     try {
       await observeFailure(evidence, windows);
     } catch (observationError) {
       error = observationError; // <-- DEFECT: Overwrites original assertion error
     }
     if (activePage && !activePage.isClosed()) {
       await checkpoint(activePage, 'Kiểm thử dừng tại assertion lỗi', 'Giữ bằng chứng thật; chưa nghiệm thu T30', 'FAILED');
     }
     throw error;
   }
   ```
4. `observeFailure` dispatched evaluations across all actor pages and source tabs with a strict 5,000 ms deadline:
   ```typescript
   await Promise.race([
     work,
     new Promise((_, reject) => { timer = setTimeout(() => reject(Error('observation deadline')), timeoutMs); })
   ]);
   ```
5. While `sourceSnapshot` was pending under browser load, the 5,000 ms timer expired, rejecting the race with `Error('observation deadline')`.
6. `observeFailure` set `record.failure = 'POST_FAILURE_OBSERVATION_FAILED'` and threw:
   `Error('Post-failure media observation incomplete; inspect sanitized evidence')`
7. The catch block in `screen-share-diagnostic.spec.ts` caught this and executed:
   `error = observationError;`
8. Playwright reported `Error: Post-failure media observation incomplete...` as the test failure.
9. **Impact**: The actual assertion failure (which line failed, which matcher failed, what RTP/DOM value was unfulfilled) was completely masked and discarded.

---

## 2. Minimal Preservation Architecture

### 2.1 Core Architectural Principles
1. **Immutable Original Error Reference**:
   The `error` object passed into `catch(error)` must never be reassigned. Any failure occurring during the optional post-failure diagnostic snapshot is caught in its own local scope and must never replace `error`.
2. **Pre-Observer Sanitized Failure Persistence**:
   Before `observeFailure` is attempted, a sanitized structural failure record is written to `${evidence}/sanitized-failure-record.json`.
3. **Strict Privacy Invariants**:
   - **Zero Raw Messages**: `error.message` is completely omitted to avoid leaking URLs, tokens, cookies, or private user text.
   - **Zero Expected/Actual Data**: `error.matcherResult.actual` and `error.matcherResult.expected` are omitted.
   - **Zero Stack Trace Text**: The raw `error.stack` string is never persisted. Only the safe filename (`screen-share-diagnostic.spec.ts`) and line number are parsed.
   - **Enum Matcher Classification**: The matcher name is validated against a strict allowlist of known Playwright matcher names (`toBe`, `toHaveLength`, `toHaveCount`, `toBeGreaterThan`, etc.).
4. **Incomplete Observer Status Preserved**:
   If `observeFailure` times out or fails, `post-failure-media-state.json` retains `observationComplete: false` and `failure: 'POST_FAILURE_OBSERVATION_FAILED'`. This ensures incomplete diagnostic status cannot be used to declare test success.
5. **Preserved Checkpoint & Invariants**:
   - Telegram checkpoint `checkpoint(activePage, ..., 'FAILED')` executes unconditionally before `throw error;`.
   - The diagnostic observation deadline remains 5,000 ms (not extended).
   - Test timeout remains 360,000 ms (not extended).
   - Test assertions, timing windows (3,000 ms measurement window), and actor sequences remain byte-for-byte identical to the canonical test.

---

## 3. Exact Diffs

### 3.1 Diff for `quality/evidence/T30/rtp-window-reviewed2/screen-share-diagnostic.spec.ts`

```diff
--- quality/evidence/T30/rtp-window-reviewed2/screen-share-diagnostic.spec.ts
+++ quality/evidence/T30/antigravity-native53-error-preservation-1/screen-share-diagnostic.spec.ts
@@ -7,1 +7,1 @@
-import {observeFailure} from './failure-observer.mjs';
+import {observeFailure,persistSanitizedFailure} from './failure-observer.mjs';
@@ -75,1 +75,1 @@
- }catch(error){try{await observeFailure(evidence,windows);}catch(observationError){error=observationError;}if(activePage&&!activePage.isClosed())await checkpoint(activePage,'Kiểm thử dừng tại assertion lỗi','Giữ bằng chứng thật; chưa nghiệm thu T30','FAILED');throw error;}
+ }catch(error){try{persistSanitizedFailure(evidence,error,{step,activeActor:activePage?Array.from(windows.entries()).find(([,w])=>w.page===activePage)?.[0]:undefined});}catch{}try{await observeFailure(evidence,windows);}catch(observationError){}if(activePage&&!activePage.isClosed())await checkpoint(activePage,'Kiểm thử dừng tại assertion lỗi','Giữ bằng chứng thật; chưa nghiệm thu T30','FAILED');throw error;}
```

### 3.2 Diff for `quality/evidence/T30/rtp-window-reviewed2/failure-observer.mjs`

```diff
--- quality/evidence/T30/rtp-window-reviewed2/failure-observer.mjs
+++ quality/evidence/T30/antigravity-native53-error-preservation-1/failure-observer.mjs
@@ -28,0 +28,47 @@
+const KNOWN_MATCHERS=new Set([
+ 'toBe','toEqual','toHaveLength','toHaveCount','toBeGreaterThan',
+ 'toBeGreaterThanOrEqual','toBeLessThan','toBeLessThanOrEqual',
+ 'toBeVisible','toContainText','toBeTruthy','toBeFalsy','toBeNull',
+ 'toBeFocused','toHaveAttribute'
+]);
+
+export function persistSanitizedFailure(evidence,error,context={}){
+ const root=path.resolve('quality/evidence/T30'),target=path.resolve(evidence);
+ assert.equal(path.dirname(target),root);assert(/^t30-native-[a-f0-9]{32}$/.test(path.basename(target)));
+
+ let errorKind='GENERIC_ERROR';
+ if(error&&typeof error==='object'){
+  if(error.name==='TimeoutError'||(typeof error.message==='string'&&error.message.toLowerCase().includes('timeout'))){
+   errorKind='TIMEOUT_ERROR';
+  }else if(error.name==='AssertionError'||error.matcherResult){
+   errorKind='ASSERTION_ERROR';
+  }
+ }
+
+ let matcher=null,matcherPass=null;
+ if(error?.matcherResult){
+  matcher=KNOWN_MATCHERS.has(error.matcherResult.name)?error.matcherResult.name:'CUSTOM_MATCHER';
+  matcherPass=typeof error.matcherResult.pass==='boolean'?error.matcherResult.pass:null;
+ }
+
+ let structuralLocation={file:null,line:null};
+ if(typeof error?.stack==='string'){
+  const match=error.stack.match(/(?:screen-share-diagnostic\.spec\.ts|screen-share\.spec\.ts):(\d+)(?::\d+)?/);
+  if(match)structuralLocation={file:'screen-share-diagnostic.spec.ts',line:parseInt(match[1],10)};
+ }
+
+ const record={
+  at:new Date().toISOString(),
+  recordType:'SANITIZED_ORIGINAL_FAILURE',
+  errorKind,
+  matcher,
+  matcherPass,
+  structuralLocation,
+  step:typeof context.step==='number'?context.step:null,
+  activeActor:typeof context.activeActor==='string'?context.activeActor:null,
+  sanitized:true
+ };
+
+ fs.writeFileSync(path.join(target,'sanitized-failure-record.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx'});
+ return record;
+}
```

---

## 4. Source Reconstruction Proof

The proposed `screen-share-diagnostic.spec.ts` is mechanically derived from the canonical frozen test `tests/e2e/screen-share.spec.ts`.

Reversing the four diagnostic additions:
1. Reverting the relative import path of `demo-stream.mjs`.
2. Removing the import of `observeFailure` and `persistSanitizedFailure`.
3. Removing the pre-assertion `measured-rtp-windows.jsonl` append in `receiveOne`.
4. Reverting the catch block back to original:
   `}catch(error){if(activePage&&!activePage.isClosed())await checkpoint(activePage,'Kiểm thử dừng tại assertion lỗi','Giữ bằng chứng thật; chưa nghiệm thu T30','FAILED');throw error;}`

Yields the exact byte-for-byte canonical frozen test with SHA-256:
`8e126efd434516a6870e9f48029c4317cc2a427e78d3157e660b00ebdba10cc8`.

Verified programmatically in [`reconstruction.proof.mjs`](file:///E:/FGweb/code/quality/evidence/T30/antigravity-native53-error-preservation-1/reconstruction.proof.mjs).

---

## 5. Control Scenarios & Test Matrix

Delivered in [`test-controls.mjs`](file:///E:/FGweb/code/quality/evidence/T30/antigravity-native53-error-preservation-1/test-controls.mjs):

| Scenario | Injected Condition | Expected Sanitized Record | Expected Observer Record | Thrown Error Identity | Checkpoint Fired |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Observer Success** | Fast evaluations (<1s) | `ASSERTION_ERROR`, matcher enum, no private text | `observationComplete: true` | `=== originalError` | Yes (`FAILED`) |
| **2. Observer Failure** | Evaluation throws `Error` | Valid record written before observer | `observationComplete: false`, `POST_FAILURE_OBSERVATION_FAILED` | `=== originalError` (NOT masked) | Yes (`FAILED`) |
| **3. Observer Timeout** | Window evaluation hangs (>50ms in test) | Valid record written before observer | `observationComplete: false`, `POST_FAILURE_OBSERVATION_FAILED` | `=== originalError` (NOT masked) | Yes (`FAILED`) |
| **4. Persistence Failure** | Target unwritable / invalid dir | Handled in local try/catch | Dependent on observer | `=== originalError` | Yes (`FAILED`) |
| **5. Error Identity** | Custom error with tokens in message | Sanitized record has no message | N/A | Message/stack/custom fields 100% byte-identical | Yes |

---

## 6. Delivered Artifacts Summary

All artifacts are delivered strictly under [`quality/evidence/T30/antigravity-native53-error-preservation-1/`](file:///E:/FGweb/code/quality/evidence/T30/antigravity-native53-error-preservation-1/):
- [`failure-observer.mjs`](file:///E:/FGweb/code/quality/evidence/T30/antigravity-native53-error-preservation-1/failure-observer.mjs): Helper exporting `actorSnapshot`, `sourceSnapshot`, `observeFailure`, and `persistSanitizedFailure`.
- [`screen-share-diagnostic.spec.ts`](file:///E:/FGweb/code/quality/evidence/T30/antigravity-native53-error-preservation-1/screen-share-diagnostic.spec.ts): Diagnostic test clone with guarded error preservation.
- [`reconstruction.proof.mjs`](file:///E:/FGweb/code/quality/evidence/T30/antigravity-native53-error-preservation-1/reconstruction.proof.mjs): Exact derivation proof matching canonical frozen test hash.
- [`test-controls.mjs`](file:///E:/FGweb/code/quality/evidence/T30/antigravity-native53-error-preservation-1/test-controls.mjs): Unit controls covering the 5-point failure matrix.
- [`proposal.json`](file:///E:/FGweb/code/quality/evidence/T30/antigravity-native53-error-preservation-1/proposal.json): Structured metadata for Codex adoption.

---

## 7. Disclaimers

1. **No Execution in This Turn**: No test runner, browser, or Docker commands were executed.
2. **No Acceptance Claim**: Diagnostic observer completion is an observation tool only and does not constitute full native acceptance. Canonical observer-free run is still required before T30 closure.
3. **No Inferred Errors**: The true failure reason of Native53 is not guessed from missing records; root Codex will re-run the diagnostic with error preservation enabled to observe the actual assertion failure directly.
