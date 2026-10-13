// Engineering planning budgets in minutes, not statistically calibrated timings.
// Only explicit remaining-work entries participate; no subtraction by elapsed wall time.
const profiles = [
  { match: /legacy|reconcil|roundtrip/i, title: 'Migration dữ liệu cũ',
    steps: [['Luồng client/receipt/reconcile còn thiếu', 180, 480], ['Roundtrip/restore và kiểm tra lỗi', 120, 300], ['Review dữ liệu và đối soát', 60, 120]] },
  { match: /custody|rotation|restore|configuration/i, title: 'Khóa, cấu hình và restore',
    steps: [['Wiring/cấu hình custody còn thiếu', 120, 300], ['DB/object rotation, restore và ACL', 120, 300], ['Review fail-closed và bàn giao', 60, 120]] },
  { match: /notification|realtime|push|preferences/i, title: 'Realtime và thông báo',
    steps: [['Wiring và producer còn thiếu', 120, 300], ['Delivery/preferences/revoke và hồi quy', 120, 240], ['Review integration', 45, 90]] },
  { match: /quota|performance|orphan|security/i, title: 'Quota, hiệu năng và security',
    steps: [['Quota/expiry/orphan còn thiếu', 90, 240], ['Đo tải và security regression', 120, 300], ['Review và sửa phát hiện', 60, 180]] },
  { match: /ban|unban|membership|moderation/i, title: 'Quyền thành viên và moderation',
    steps: [['Producer/epoch còn thiếu', 60, 180], ['Race/revoke/ban native tests', 60, 180], ['Review quyền và hồi quy', 45, 90]] },
];
const hours = (minutes) => `${Math.round(minutes / 60 * 10) / 10} giờ`;
const range = ({ min, max }) => `${hours(min)}–${hours(max)}`;
export function forecast(task, evidence, now = Date.now()) {
  if (!task || evidence?.task !== task.id || !Array.isArray(evidence.remaining) || !evidence.remaining.length) return null;
  const entries = evidence.remaining.filter((entry) => typeof entry === 'string' && entry.trim());
  if (!entries.length || entries.length > 20) return null;
  const groups = entries.map((entry, index) => {
    const profile = profiles.find((item) => item.match.test(entry));
    const steps = profile?.steps ?? [['Phân tích/triển khai phần chưa phân loại', 90, 300],
      ['Kiểm thử phần còn thiếu', 60, 240], ['Review/sửa lỗi', 45, 180]];
    return { id: index + 1, source: entry, title: profile?.title ?? 'Công việc chưa phân loại',
      steps: steps.map(([title, min, max]) => ({ title, min, max })) };
  });
  const summed = groups.flatMap((group) => group.steps).reduce((total, step) => ({ min: total.min + step.min, max: total.max + step.max }), { min: 0, max: 0 });
  const snapshot = Date.parse(evidence.recordedAt);
  return { task: task.id, groups, total: { min: Math.ceil(summed.min * 1.15), max: Math.ceil(summed.max * 1.4) },
    stale: !Number.isFinite(snapshot) || snapshot > now || now - snapshot > 6 * 3600000,
    blocked: ['BLOCKED', 'FAILED'].includes(task.status) || !!task.blockers?.length,
    externalWait: entries.some((entry) => /future|chưa có|credential|prerequisite|producer modules.*not yet/i.test(entry)) };
}
export function forecastText(value, active, now = Date.now()) {
  if (!value) return 'ETA: chưa có danh sách công việc còn lại để ước lượng.';
  const lines = ['Mini task — khoảng ước lượng kỹ thuật (độ tin cậy thấp):'];
  for (const group of value.groups) {
    lines.push(`${group.id}. ${group.title}`);
    for (const step of group.steps) lines.push(`• ${step.title}: ${range(step)}`);
  }
  lines.push(`Task lớn ${value.task}: còn khoảng ${range(value.total)} làm việc tuần tự, gồm dự phòng integration/review 15–40%.`);
  if (value.stale) lines.push('Cảnh báo: snapshot cũ hơn6giờ hoặc thiếu thời gian hợp lệ; cần đối soát phạm vi trước khi dùng ETA.');
  if (value.blocked || value.externalWait) lines.push('Chưa chốt giờ xong: còn chờ blocker/phụ thuộc bên ngoài; thời gian chờ chưa nằm trong ước lượng.');
  else if (active && !value.stale) {
    const clock = (minutes) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Bangkok',
      dateStyle: 'short', timeStyle: 'short' }).format(now + minutes * 60000);
    lines.push(`Mốc hoàn thành nếu làm liên tục, không blocker mới: ${clock(value.total.min)} → ${clock(value.total.max)} UTC+07.`);
  } else lines.push('Phiên chưa chạy hoặc snapshot chưa đủ mới: chưa quy đổi ETA thành giờ hoàn thành.');
  lines.push('Căn cứ: loại công việc trong evidence.remaining + ngân sách kỹ thuật; chưa hiệu chỉnh thống kê. Không tự trừ thời gian đã chờ; cập nhật khi evidence thay đổi.');
  return lines.join('\n');
}
