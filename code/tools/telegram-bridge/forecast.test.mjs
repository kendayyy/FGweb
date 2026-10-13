import test from 'node:test';
import assert from 'node:assert/strict';
import { forecast, forecastText } from './forecast.mjs';
const now = Date.parse('2026-10-09T04:00:00Z');
const task = { id: 'BE', status: 'IN_PROGRESS' };
const evidence = { task: 'BE', recordedAt: new Date(now).toISOString(), remaining: ['Legacy encrypted candidates/client roundtrip/reconciliation and restore'] };
test('mini tasks have individual ranges and aggregate includes integration review buffer', () => {
  const estimate = forecast(task, evidence, now);
  assert.equal(estimate.groups.length, 1); assert.equal(estimate.groups[0].steps.length, 3);
  const sum = estimate.groups.flatMap(g => g.steps).reduce((s, v) => s + v.max, 0);
  assert.ok(estimate.total.max > sum); assert.ok(estimate.total.max >= estimate.total.min);
  assert.match(forecastText(estimate, true, now), /Mini task/); assert.match(forecastText(estimate, true, now), /Task lớn/);
});
test('does not estimate absent, mismatched or empty remaining evidence', () => {
  for (const patch of [undefined, { ...evidence, task: 'OLD' }, { ...evidence, remaining: [] }]) assert.equal(forecast(task, patch, now), null);
});
test('stale snapshot and blockers suppress calendar deadline, preserve conditional effort', () => {
  const result = forecast({ ...task, status: 'BLOCKED', blockers: ['Waiting credentials'] }, { ...evidence,
    recordedAt: new Date(now - 8 * 3600000).toISOString() }, now);
  const text = forecastText(result, true, now); assert.match(text, /snapshot cũ/);
  assert.match(text, /chờ blocker/); assert.doesNotMatch(text, /Mốc hoàn thành/);
});
test('idle does not predict a running finish date; effort does not count down without updated evidence', () => {
  const first = forecast(task, evidence, now), second = forecast(task, evidence, now + 3600000);
  assert.deepEqual(first.total, second.total); assert.doesNotMatch(forecastText(first, false, now), /Mốc hoàn thành/);
});
test('unrecognized work gets labeled general planning range, not invented calibration', () => {
  const text = forecastText(forecast(task, { ...evidence, remaining: ['New uncommon requirement'] }, now), true, now);
  assert.match(text, /chưa phân loại/); assert.match(text, /thấp/); assert.doesNotMatch(text, /99%/);
});
