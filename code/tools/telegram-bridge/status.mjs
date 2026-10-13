import { agentMessages, matchSessions, redact } from './core.mjs';
import { sessionAlert } from './alerts.mjs';

export class StatusView {
  constructor(app, clock = Date.now) { this.app = app; this.clock = clock; }
  async report(query = '') {
    const inventory = await this.app.targets();
    const state = session => typeof session.status === 'string' ? session.status : session.status?.type;
    let sessions;
    if (/^\d+$/.test(query)) {
      const index = Number(query) - 1;
      const chosen = this.choices?.sessions[index];
      if (!chosen || this.choices.expires < this.clock()) return 'Số phiên không hợp lệ hoặc danh sách hết hạn. Gửi /status để xem lại.';
      sessions = inventory.filter(s => s.id === chosen.id);
    } else {
      sessions = query ? matchSessions(inventory, query) : inventory;
      sessions = [...sessions].sort((a, b) => Number(state(b) === 'active') - Number(state(a) === 'active'));
      this.choices = { sessions, expires: this.clock() + 300000 };
    }
    if (!sessions.length) return 'Không tìm thấy phiên khả dụng. Gửi /status hoặc /status vài-chữ-đầu-tên.';
    const states = { active: 'đang chạy', idle: 'đang nghỉ', notLoaded: 'chưa mở', needsAttention: 'cần xử lý' };
    const lines = ['Codex — các phiên làm việc', `Đọc lúc: ${new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'medium' }).format(new Date(this.clock()))} (UTC+07)`];
    for (const [index, session] of sessions.entries()) {
      lines.push(`${query.match(/^\d+$/) ? query : index + 1}. ${session.title} — ${states[state(session)] ?? state(session) ?? 'chưa rõ'}`, `Project: ${session.cwd ?? 'không có project'}`);
      // All active chats are read sequentially; a failed chat does not hide others.
      if (query || ['active', 'needsAttention'].includes(state(session))) {
        try {
          const page = await this.app.read(session.id);
          if (page.thread?.id !== session.id) throw new Error('Wrong page');
          const latest = agentMessages(page).at(-1);
          lines.push(latest ? `Tiến độ gần nhất: ${Array.from(redact(latest.text)).slice(0, 650).join('')}` : 'Chưa có thông báo tiến độ từ agent.');
          const alert = sessionAlert(session, page);
          if (alert.text) lines.push(alert.text);
        } catch { lines.push('Chưa đọc được tiến độ phiên này; trạng thái trên lấy từ danh sách Desktop.'); }
      }
    }
    lines.push('Xem riêng: /status số (danh sách có hạn 5 phút), hoặc /status vài-chữ-đầu-tên. Lệnh xem không đổi phiên nhận /do.');
    return redact(lines.join('\n'));
  }
}
