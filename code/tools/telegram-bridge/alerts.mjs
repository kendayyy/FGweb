import { agentMessages, redact } from './core.mjs';
import { createHash } from 'node:crypto';
const statusOf = value => typeof value === 'string' ? value : value?.type;
export function sessionAlert(session, page, previous = {}) {
  const turn = page?.turns?.[0];
  const status = statusOf(session.status);
  const latest = agentMessages(page ?? {}).at(-1)?.text;
  const error = turn?.error;
  const detail = typeof error === 'string' ? error : error?.message;
  const code = typeof error?.codexErrorInfo === 'string' ? error.codexErrorInfo
    : error?.codexErrorInfo?.type ?? error?.code;
  let reason;
  if (error) {
    const source = `${code ?? ''} ${detail ?? ''}`;
    const quota = /usage[_ -]?limit|quota[_ -]?(?:exceeded|exhausted)|usage.*(?:exceeded|reached)|hết (?:usage|hạn mức)/i.test(source);
    reason = quota ? 'Phiên báo đã chạm hạn mức usage.' : 'Phiên báo lỗi và có thể đã dừng.';
    if (code) reason += ` Mã: ${String(code).slice(0, 120)}.`;
    if (detail) reason += `\nLý do từ Codex: ${Array.from(redact(detail)).slice(0, 1000).join('')}`;
  } else if (status === 'needsAttention') {
    reason = 'Phiên cần bạn xử lý hoặc trả lời. Desktop chưa cung cấp lý do dừng chi tiết.';
  } else if (turn?.status === 'completed' && latest && /\?|(?:cần|chờ|hãy|bạn muốn).*(?:xác nhận|trả lời|chọn|cung cấp)/i.test(latest)) {
    reason = 'Thông báo cuối có câu hỏi hoặc yêu cầu phản hồi; có thể phiên đang chờ bạn.';
  } else if (previous.status === 'active' && status !== 'active') {
    reason = turn?.status === 'completed' ? 'Lượt làm việc đã kết thúc theo Codex; xem kết quả gần nhất bên dưới.'
      : turn?.status === 'interrupted' ? 'Lượt làm việc bị ngắt. Codex chưa cung cấp nguyên nhân cụ thể.'
        : 'Phiên không còn ở trạng thái đang chạy. Chưa có bằng chứng xác định nguyên nhân.';
  }
  const fingerprint = reason ? createHash('sha256').update(JSON.stringify({status,turn:turn?.id,reason,latest})).digest('hex') : null;
  const observation = {status, fingerprint};
  if (!reason || previous.fingerprint === fingerprint) return {observation};
  const lines = [`${session.title} — cần chú ý`, reason];
  if (latest) lines.push(`Thông báo gần nhất:\n${Array.from(redact(latest)).slice(0, 2000).join('')}`);
  lines.push(`Trả lời tại Telegram: /reply ${session.title} | nội dung trả lời, rồi /pick số để xác nhận đúng phiên.`,
    'Nếu là hộp cấp quyền/phê duyệt của Codex, bạn cần mở Codex để bấm; gửi tin trả lời không thay cho phê duyệt.');
  return {observation, text:redact(lines.join('\n'))};
}
export function recoveryAlert(previous, now, bootAt) {
  if (!Number.isFinite(previous?.lastObservedAt) || now - previous.lastObservedAt < 120000) return;
  const seconds = Math.round((now - previous.lastObservedAt) / 1000);
  const reboot = Number.isFinite(previous.bootAt) && bootAt - previous.bootAt > 120000;
  return `Bot đã kết nối trở lại sau khoảng ${seconds} giây không quan sát được tiến độ.\n${reboot
    ? 'Thời điểm khởi động Windows đã thay đổi: có bằng chứng máy khởi động lại. Chưa thể xác định do mất điện hay chủ động restart.'
    : previous.failureStage ? `Lần lỗi ghi nhận ở: ${previous.failureStage}. Chưa thể xác định nguyên nhân gốc chỉ từ lỗi kết nối.`
      : 'Không có bằng chứng xác định mất điện, mất mạng, ứng dụng đóng hay bot bị dừng.'}\nTrong khoảng này chưa xác nhận phiên còn chạy hay lệnh đã hoàn thành. Không tự gửi lại lệnh.`;
}
