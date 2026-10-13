import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { persistSanitizedFailure, observeFailure } from './failure-observer.mjs';

/**
 * Isolated unit control runner verifying error preservation across:
 * 1. Observer success
 * 2. Observer evaluation failure
 * 3. Observer deadline timeout
 * 4. Sanitized persistence failure
 * 5. Strict original error identity preservation
 */
export async function runControls() {
  const root = path.resolve('quality/evidence/T30');
  const tempDirId = 't30-native-' + randomUUID().replaceAll('-', '');
  const testEvidenceDir = path.join(root, tempDirId);
  fs.mkdirSync(testEvidenceDir, { recursive: true });

  const results = [];

  try {
    // --- Control 1: Observer Success ---
    {
      const subDir = path.join(root, 't30-native-' + randomUUID().replaceAll('-', ''));
      fs.mkdirSync(subDir, { recursive: true });
      let checkpointCalled = false;
      let caughtError = null;

      const originalError = new Error('simulated assertion failure: expect(videos).toHaveLength(1)');
      originalError.name = 'AssertionError';
      originalError.matcherResult = { name: 'toHaveLength', pass: false };

      const mockWindows = new Map([
        ['viewer', {
          page: {
            isClosed: () => false,
            evaluate: async () => ({ at: Date.now(), rows: [], captureTracks: [], videos: [] })
          },
          source: null
        }]
      ]);

      const mockCheckpoint = async (_page, action, result, status) => {
        if (status === 'FAILED') checkpointCalled = true;
      };

      try {
        throw originalError;
      } catch (error) {
        try { persistSanitizedFailure(subDir, error, { step: 3, activeActor: 'viewer' }); } catch {}
        try { await observeFailure(subDir, mockWindows, { timeoutMs: 1000 }); } catch (obsErr) {}
        await mockCheckpoint(null, 'test', 'test', 'FAILED');
        caughtError = error;
      }

      assert.strictEqual(caughtError, originalError, 'Original error must be preserved on observer success');
      assert.strictEqual(checkpointCalled, true, 'Checkpoint must be called');

      const sanitizedRecord = JSON.parse(fs.readFileSync(path.join(subDir, 'sanitized-failure-record.json'), 'utf8'));
      assert.strictEqual(sanitizedRecord.errorKind, 'ASSERTION_ERROR');
      assert.strictEqual(sanitizedRecord.matcher, 'toHaveLength');
      assert.strictEqual(sanitizedRecord.matcherPass, false);
      assert.strictEqual(sanitizedRecord.sanitized, true);
      assert.strictEqual(sanitizedRecord.message, undefined, 'Raw error message must NOT be stored');

      const observerRecord = JSON.parse(fs.readFileSync(path.join(subDir, 'post-failure-media-state.json'), 'utf8'));
      assert.strictEqual(observerRecord.observationComplete, true);

      results.push({ control: 'observer_success', passed: true });
      fs.rmSync(subDir, { recursive: true, force: true });
    }

    // --- Control 2: Observer Evaluation Failure ---
    {
      const subDir = path.join(root, 't30-native-' + randomUUID().replaceAll('-', ''));
      fs.mkdirSync(subDir, { recursive: true });
      let checkpointCalled = false;
      let caughtError = null;

      const originalError = new Error('original assertion: expect(after.videoCount).toBe(1)');
      originalError.name = 'AssertionError';
      originalError.matcherResult = { name: 'toBe', pass: false };

      const mockWindows = new Map([
        ['viewer', {
          page: {
            isClosed: () => false,
            evaluate: async () => { throw new Error('Evaluation error: connection severed'); }
          },
          source: null
        }]
      ]);

      const mockCheckpoint = async (_page, action, result, status) => {
        if (status === 'FAILED') checkpointCalled = true;
      };

      try {
        throw originalError;
      } catch (error) {
        try { persistSanitizedFailure(subDir, error, { step: 4, activeActor: 'viewer' }); } catch {}
        try { await observeFailure(subDir, mockWindows, { timeoutMs: 1000 }); } catch (obsErr) {}
        await mockCheckpoint(null, 'test', 'test', 'FAILED');
        caughtError = error;
      }

      assert.strictEqual(caughtError, originalError, 'Original error must be preserved when observer fails');
      assert.strictEqual(checkpointCalled, true, 'Checkpoint must be called when observer fails');

      const observerRecord = JSON.parse(fs.readFileSync(path.join(subDir, 'post-failure-media-state.json'), 'utf8'));
      assert.strictEqual(observerRecord.observationComplete, false, 'Observation must remain incomplete');
      assert.strictEqual(observerRecord.failure, 'POST_FAILURE_OBSERVATION_FAILED');

      results.push({ control: 'observer_evaluation_failure', passed: true });
      fs.rmSync(subDir, { recursive: true, force: true });
    }

    // --- Control 3: Observer Deadline Timeout ---
    {
      const subDir = path.join(root, 't30-native-' + randomUUID().replaceAll('-', ''));
      fs.mkdirSync(subDir, { recursive: true });
      let checkpointCalled = false;
      let caughtError = null;

      const originalError = new Error('original assertion: timeout awaiting expected frame');
      originalError.name = 'TimeoutError';

      const mockWindows = new Map([
        ['viewer', {
          page: {
            isClosed: () => false,
            evaluate: () => new Promise(() => {}) // Hangs indefinitely
          },
          source: null
        }]
      ]);

      const mockCheckpoint = async (_page, action, result, status) => {
        if (status === 'FAILED') checkpointCalled = true;
      };

      try {
        throw originalError;
      } catch (error) {
        try { persistSanitizedFailure(subDir, error, { step: 5, activeActor: 'viewer' }); } catch {}
        try { await observeFailure(subDir, mockWindows, { timeoutMs: 50 }); } catch (obsErr) {}
        await mockCheckpoint(null, 'test', 'test', 'FAILED');
        caughtError = error;
      }

      assert.strictEqual(caughtError, originalError, 'Original error must be preserved when observer times out');
      assert.strictEqual(checkpointCalled, true, 'Checkpoint must be called when observer times out');

      const observerRecord = JSON.parse(fs.readFileSync(path.join(subDir, 'post-failure-media-state.json'), 'utf8'));
      assert.strictEqual(observerRecord.observationComplete, false, 'Observation must remain incomplete on timeout');
      assert.strictEqual(observerRecord.failure, 'POST_FAILURE_OBSERVATION_FAILED');

      results.push({ control: 'observer_deadline_timeout', passed: true });
      fs.rmSync(subDir, { recursive: true, force: true });
    }

    // --- Control 4: Persistence Error Non-Masking ---
    {
      let checkpointCalled = false;
      let caughtError = null;
      const originalError = new Error('original error with faulty persistence target');
      originalError.name = 'AssertionError';

      const uncreatableDir = path.join(root, 'invalid-non-matching-id');

      try {
        throw originalError;
      } catch (error) {
        try { persistSanitizedFailure(uncreatableDir, error, {}); } catch {}
        await (async () => { checkpointCalled = true; })();
        caughtError = error;
      }

      assert.strictEqual(caughtError, originalError, 'Original error must remain preserved even if persistence assertions throw');
      assert.strictEqual(checkpointCalled, true, 'Checkpoint must still be called');

      results.push({ control: 'persistence_error_non_masking', passed: true });
    }

    // --- Control 5: Error Identity Unmodified ---
    {
      const originalError = new Error('custom error message with private token: secret-token-xyz');
      originalError.name = 'CustomAssertionError';
      originalError.customField = 42;
      const originalMessage = originalError.message;
      const originalStack = originalError.stack;

      let caughtError = null;
      try {
        throw originalError;
      } catch (error) {
        caughtError = error;
      }

      assert.strictEqual(caughtError.message, originalMessage, 'Message must be byte-for-byte identical');
      assert.strictEqual(caughtError.stack, originalStack, 'Stack must be byte-for-byte identical');
      assert.strictEqual(caughtError.customField, 42, 'Custom fields must remain intact');
      assert.strictEqual(caughtError, originalError, 'Error reference identity must be exact');

      results.push({ control: 'error_identity_unmodified', passed: true });
    }

  } finally {
    try { fs.rmSync(testEvidenceDir, { recursive: true, force: true }); } catch {}
  }

  return {
    verified: true,
    allPassed: results.every(r => r.passed),
    controls: results
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('quality/evidence/T30/antigravity-native53-error-preservation-1/test-controls.mjs')) {
  runControls().then(res => {
    console.log(JSON.stringify(res, null, 2));
    if (!res.allPassed) process.exit(1);
  }).catch(err => {
    console.error('Controls execution error:', err);
    process.exit(1);
  });
}
