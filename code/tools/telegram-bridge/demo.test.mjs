import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDemo, demoSummary } from './demo.mjs';
const fixture = () => ({ id: 'run-1', task: 'CHATCRYPTO-FE', title: 'Chat demo', headed: true,
  startedAt: '2026-10-09T01:00:00Z', completedAt: '2026-10-09T01:02:00Z', status: 'FAILED',
  steps: [{ action: 'Gửi ảnh', result: 'Upload lỗi', screenshot: 'CHATCRYPTO-FE/demo/01.png', sha256: 'a'.repeat(64) }] });
test('requires actual headed evidence, hashes, bounded images and outcome', () => {
  assert.equal(validateDemo(fixture()).id, 'run-1');
  for (const patch of [{ headed: false }, { status: 'PASS' }, { steps: [] },
    { steps: [{ ...fixture().steps[0], screenshot: '../secret.png' }] },
    { steps: [{ ...fixture().steps[0], sha256: '' }] }]) assert.throws(() => validateDemo({ ...fixture(), ...patch }));
});
test('report describes actual failure without asserting task PASS', () => {
  const text = demoSummary(fixture()); assert.match(text, /FAILED/); assert.match(text, /Gửi ảnh/);
  assert.match(text, /Upload lỗi/); assert.doesNotMatch(text, /task PASS/);
});
