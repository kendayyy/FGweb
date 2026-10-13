import test from 'node:test';
import assert from 'node:assert/strict';
import { progressReport } from './progress.mjs';
const now = Date.parse('2026-10-09T03:00:00Z');
test('reports elapsed task/turn time, checkpoint ratio and real remaining evidence', () => {
  const value = progressReport({ tasks: [{ id: 'T00', status: 'PASS' }, { id: 'BE', title: 'Backend', status: 'IN_PROGRESS',
    startedAt: '2026-10-09T01:00:00Z' }, { id: 'FE', status: 'NOT_STARTED' }] },
  { task: 'BE', recordedAt: '2026-10-09T02:30:00Z', remaining: ['Rotation restore chưa kiểm'] },
  { thread: { title: 'Coding and build 2', status: { type: 'active' } }, turns: [{ status: 'inProgress', startedAt: now / 1000 - 600,
    items: [{ type: 'agentMessage', id: 'x', phase: 'commentary', text: 'Đang kiểm sync' }] }] }, now);
  assert.match(value, /2 giờ/); assert.match(value, /10 phút/); assert.match(value, /1\/3/);
  assert.match(value, /Rotation restore/); assert.match(value, /Đang kiểm sync/); assert.match(value, /Mini task/);
});
test('missing/future time is unavailable, no invented duration or task percent', () => {
  const value = progressReport({ tasks: [{ id: 'BE', status: 'IN_PROGRESS', startedAt: '2099-01-01' }] }, undefined, {}, now);
  assert.match(value, /chưa có dữ liệu/); assert.doesNotMatch(value, /NaN|âm|100%/);
});
test('stale evidence for another task is excluded and idle turn does not claim active execution', () => {
  const value = progressReport({ tasks: [{ id: 'BE', status: 'IN_PROGRESS' }] }, { task: 'OLD', remaining: ['Wrong'] },
    { thread: { title: 'Coding and build 2', status: { type: 'idle' } } }, now);
  assert.doesNotMatch(value, /Wrong|đang chạy/); assert.match(value, /idle/);
});
