import { agentMessages, redact } from './core.mjs';
import { forecast, forecastText } from './forecast.mjs';
const parse = (value) => typeof value === 'number' && Number.isFinite(value) ? value * 1000
  : typeof value === 'string' ? Date.parse(value) : NaN;
const date = (value) => Number.isFinite(parse(value)) ? new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'medium' }).format(parse(value)) + ' UTC+07' : 'chưa có dữ liệu';
function elapsed(value, now) {
  const start = parse(value);
  if (!Number.isFinite(start) || start > now) return 'chưa có dữ liệu';
  const minutes = Math.floor((now - start) / 60000);
  const days = Math.floor(minutes / 1440), hours = Math.floor(minutes % 1440 / 60);
  return [days ? `${days} ngày` : '', hours ? `${hours} giờ` : '', `${minutes % 60} phút`].filter(Boolean).join(' ');
}
export function progressReport(ledger, evidence, page = {}, now = Date.now()) {
  const tasks = ledger.tasks ?? [], pass = tasks.filter((item) => item.status === 'PASS').length;
  const task = tasks.find((item) => item.status !== 'PASS');
  const lines = ['FG — thời gian & tiến độ', `Kiểm tra lúc: ${date(now / 1000)}`,
    `Checkpoints PASS: ${pass}/${tasks.length} (không phải % hoàn thiện sản phẩm).`,
    `Phiên: ${page.thread?.title ?? 'chưa có dữ liệu'} | ${page.thread?.status?.type ?? 'chưa có dữ liệu'}`];
  if (!task) { lines.push('Không còn task chưa PASS trong ledger.'); return redact(lines.join('\n')); }
  lines.push(`Task: ${task.id}${task.title ? ` — ${task.title}` : ''} | ${task.status}`,
    `Bắt đầu task: ${date(task.startedAt)}`, `Đã trôi qua từ bắt đầu task: ${elapsed(task.startedAt, now)} (bao gồm thời gian nghỉ).`);
  const turn = page.turns?.[0];
  if (turn?.status === 'inProgress') lines.push(`Lượt làm việc hiện tại: ${elapsed(turn.startedAt, now)}.`);
  const latest = agentMessages(page).at(-1);
  if (latest) lines.push(`Tiến độ mới nhất: ${Array.from(latest.text).slice(0, 900).join('')}`);
  if (evidence?.task === task.id) {
    lines.push(`Evidence cập nhật: ${date(evidence.recordedAt)} (${elapsed(evidence.recordedAt, now)} trước).`);
    if (Array.isArray(evidence.remaining) && evidence.remaining.length) lines.push('Còn lại theo evidence:',
      ...evidence.remaining.slice(0, 6).map((item, i) => `${i + 1}. ${String(item).slice(0, 350)}`));
  }
  if (Array.isArray(task.blockers) && task.blockers.length) lines.push('Blocker ledger:',
    ...task.blockers.slice(0, 3).map((item) => typeof item === 'string' ? item.slice(0, 300) : 'Có blocker, xem ledger/evidence.'));
  const queued = tasks.filter((item) => item.status === 'NOT_STARTED').slice(0, 3);
  if (queued.length) lines.push(`Kế tiếp: ${queued.map((item) => item.id).join(' → ')}`);
  lines.push(forecastText(forecast(task, evidence, now), page.thread?.status?.type === 'active', now));
  return redact(lines.join('\n'));
}
