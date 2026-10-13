import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { redact } from './core.mjs';

export function validateDemo(value) {
  if (!value || value.headed !== true || !['RUNNING', 'SUCCEEDED', 'FAILED', 'BLOCKED'].includes(value.status)
    || !/^[A-Za-z0-9_-]{1,100}$/.test(value.id) || !/^[A-Z0-9-]+$/.test(value.task)
    || typeof value.title !== 'string' || value.title.length > 300
    || !Number.isFinite(Date.parse(value.startedAt)) || !Number.isFinite(Date.parse(value.completedAt))
    || Date.parse(value.completedAt) < Date.parse(value.startedAt)
    || !Array.isArray(value.steps) || value.steps.length < 1 || value.steps.length > 8) throw new Error('Invalid headed demo manifest');
  for (const step of value.steps) {
    if (typeof step.action !== 'string' || !step.action || step.action.length > 500
      || typeof step.result !== 'string' || !step.result || step.result.length > 500
      || typeof step.screenshot !== 'string' || !step.screenshot.startsWith(`${value.task}/`)
      || step.screenshot.split(/[\\/]/).some((part) => ['..', '.', ''].includes(part))
      || !/^[A-Za-z0-9_./-]+\.(png|jpg|jpeg)$/.test(step.screenshot)
      || !/^[a-fA-F0-9]{64}$/.test(step.sha256)) throw new Error('Invalid demo step');
  }
  return value;
}
export function demoSummary(value) {
  validateDemo(value);
  return redact([`Demo UI/UX — ${value.title}`, `Task: ${value.task} | Kết quả demo: ${value.status}`,
    `Headed | Bắt đầu ${value.startedAt} | ${value.status === 'RUNNING' ? 'Bước ghi nhận' : 'Kết thúc demo'} ${value.completedAt}`,
    ...value.steps.map((step, index) => `${index + 1}. ${step.action}\nKết quả: ${step.result}`),
    'Kết quả demo không thay nghiệm thu checkpoint.'].join('\n'));
}
export async function loadDemo(root, relative = 'TELEGRAM-BRIDGE-01/demo-latest.json') {
  const evidence = await realpath(path.join(root, 'quality/evidence'));
  if (!/^TELEGRAM-BRIDGE-01\/(?:demo-latest\.json|demo-stream\/[A-Za-z0-9_-]+\.json)$/.test(relative)) throw new Error('Invalid demo manifest path');
  const manifest = await realpath(path.join(evidence, relative));
  if (!manifest.startsWith(evidence + path.sep)) throw new Error('Demo manifest outside evidence');
  if ((await stat(manifest)).size > 20000) throw new Error('Demo manifest too large');
  const demo = validateDemo(JSON.parse(await readFile(manifest, 'utf8')));
  const images = [];
  for (const step of demo.steps) {
    const target = await realpath(path.join(evidence, step.screenshot));
    if (!target.startsWith(evidence + path.sep)) throw new Error('Demo image outside evidence');
    const info = await stat(target);
    if (!info.isFile() || info.size > 9 * 1024 * 1024) throw new Error('Demo image invalid size');
    const bytes = await readFile(target);
    const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!png && !jpg) throw new Error('Invalid screenshot format');
    if (createHash('sha256').update(bytes).digest('hex') !== step.sha256.toLowerCase()) throw new Error('Demo image hash mismatch');
    images.push({ bytes, type: png ? 'image/png' : 'image/jpeg', step });
  }
  return { demo, images };
}
