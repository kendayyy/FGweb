import { redact } from './core.mjs';
export function taskNames(markdown) {
  const names = new Map();
  for (const line of markdown.split(/\r?\n/)) {
    const heading = /^###\s+([A-Z][A-Z0-9-]+)\s+[—–]\s+(.+)$/.exec(line);
    if (heading) names.set(heading[1], heading[2].trim());
    if (line.startsWith('|')) {
      const cells = line.split('|').slice(1, -1).map(value => value.trim());
      if (/^[A-Z][A-Z0-9-]+$/.test(cells[0]) && cells.length >= 3) {
        names.set(cells[0], cells.length >= 4 ? cells[2] : cells[1]);
      }
    }
    const supplement = /^\*\*([A-Z][A-Z0-9-]+)\s*\([^)]*\):\*\*\s*([^;]+);/.exec(line);
    if (supplement) names.set(supplement[1], supplement[2].trim());
  }
  return names;
}
export function taskReport(ledger, evidence, now = Date.now(), names = new Map()) {
  if (!Array.isArray(ledger?.tasks)) throw new Error('Task ledger unavailable');
  const tasks = ledger.tasks, remaining = tasks.filter(t => t.status !== 'PASS');
  const lines = ['FG — theo dõi task và thứ tự tiếp theo', `Đọc lúc: ${new Intl.DateTimeFormat('vi-VN', {timeZone:'Asia/Bangkok', dateStyle:'short', timeStyle:'medium'}).format(new Date(now))} (UTC+07)`];
  if (!remaining.length) return `${lines.join('\n')}\nLedger không có task chưa PASS; kết luận này chỉ dựa trên ledger.`;
  const current = remaining[0];
  const label = task => `${task.id}: ${names.get(task.id) || task.title || 'Chưa có tên trong kế hoạch/ledger'}`;
  lines.push(`Task hiện tại theo thứ tự ledger: ${label(current)}`, `Trạng thái: ${current.status}`, `Bắt đầu ghi nhận: ${current.startedAt ?? 'chưa có'}`);
  const blockers = current.blockers;
  if (Array.isArray(blockers) && blockers.length) lines.push(`Blocker: ${blockers.map(b => typeof b === 'string' ? b : b.message ?? b.reason ?? 'Có blocker, xem evidence').join('; ')}`);
  if (evidence?.task === current.id) {
    lines.push(`Evidence cập nhật: ${evidence.recordedAt ?? 'chưa có giờ'}`);
    if (Array.isArray(evidence.remaining) && evidence.remaining.length) lines.push('Việc còn lại:', ...evidence.remaining.map(r => typeof r === 'string' ? `• ${r}` : '• Xem chi tiết trong evidence.'));
  }
  const statusById = new Map(tasks.map(t => [t.id, t.status]));
  lines.push('Thứ tự tiếp theo (chưa tự mở task):');
  if (remaining.length === 1) lines.push('Không còn task phía sau trong ledger.');
  for (const [index, task] of remaining.slice(1).entries()) {
    lines.push(`${index + 1}. ${label(task)} [${task.status}]`);
    const dependencies = task.dependencies ?? [];
    if (dependencies.length) lines.push(`   Tiền nhiệm: ${dependencies.map(id => `${id} (${statusById.get(id) ?? 'chưa có trong ledger'})`).join(', ')}`);
  }
  lines.push('Thứ tự lấy từ quality/tasks.json tại lúc đọc. Các task mới chỉ ghi trong tài liệu chưa đăng ký/rebaseline vào ledger không nằm trong danh sách này. Task trước phải PASS qua review/gate; snapshot không xác nhận chat đang chạy và không dự đoán thời gian hoàn thành.');
  return redact(lines.join('\n'));
}
