import { timingSafeEqual } from 'node:crypto';
export function commandSessions(inventory) {
  const found = new Map();
  for (const thread of [...(inventory.pinnedThreads ?? []), ...(inventory.threads ?? [])]) {
    if (thread.kind === 'codex' && (thread.hostId ?? 'local') === 'local'
      && typeof thread.id === 'string' && typeof thread.title === 'string') found.set(thread.id, thread);
  }
  return [...found.values()];
}
const normalizeTitle = value => value.normalize('NFD').replace(/\p{M}/gu, '').replaceAll('đ', 'd').replaceAll('Đ', 'D').toLowerCase().trim();
export function matchSessions(sessions, query) {
  const prefix = normalizeTitle(query);
  return sessions.filter(session => normalizeTitle(session.title).startsWith(prefix));
}
export function usageReport(data) {
  const buckets = data?.rateLimitsByLimitId && Object.keys(data.rateLimitsByLimitId).length
    ? Object.values(data.rateLimitsByLimitId) : data?.rateLimits ? [data.rateLimits] : [];
  const lines = ['Codex — usage tài khoản (dùng chung giữa các chat)'];
  if (!buckets.length) lines.push('Hạn mức: chưa có dữ liệu.');
  for (const bucket of buckets) {
    lines.push(`Hạn mức: ${bucket.limitName ?? bucket.limitId ?? 'Codex'}`);
    for (const [key, label] of [['primary', 'Cửa sổ chính'], ['secondary', 'Cửa sổ dài']]) {
      const window = bucket[key];
      if (!window || typeof window.usedPercent !== 'number' || !Number.isFinite(window.usedPercent)) {
        lines.push(`${label}: chưa có dữ liệu.`); continue;
      }
      const remaining = Math.max(0, Math.min(100, 100 - window.usedPercent));
      const duration = Number.isFinite(window.windowDurationMins) ? ` (${window.windowDurationMins / 60} giờ)` : '';
      lines.push(`${label}${duration}: đã dùng ${window.usedPercent}%, còn ${remaining}%.`);
      if (Number.isFinite(window.resetsAt)) {
        const reset = new Date(window.resetsAt * 1000);
        if (!Number.isNaN(reset.valueOf())) lines.push(`Reset: ${new Intl.DateTimeFormat('vi-VN', {
          timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'medium' }).format(reset)} (UTC+07).`);
      }
    }
  }
  return redact(lines.join('\n'));
}
export function fgSessions(inventory) {
  const found = new Map();
  for (const thread of [...(inventory.pinnedThreads ?? []), ...(inventory.threads ?? [])]) {
    const cwd = String(thread.cwd ?? '').replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase();
    if (thread.kind === 'codex' && (thread.hostId ?? 'local') === 'local'
      && ['e:/fgweb', 'e:/fgweb/code'].includes(cwd) && typeof thread.id === 'string') found.set(thread.id, thread);
  }
  return [...found.values()].sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active'));
}
export function sessionReport(sessions, pages = new Map(), target) {
  const states = { active: 'đang chạy', idle: 'đang nghỉ', notLoaded: 'chưa mở', needsAttention: 'cần xử lý' };
  const lines = ['FG web — phiên làm việc', 'Workspace: E:/FGweb'];
  if (!sessions.length) lines.push('Chưa tìm thấy phiên FG trong danh sách Desktop hiện tại.');
  for (const session of sessions) {
    const state = typeof session.status === 'string' ? session.status : session.status?.type;
    lines.push(`${session.title} — ${states[state] ?? state ?? 'chưa rõ'}${session.id === target ? ' [nhận /do]' : ''}`);
    const latest = agentMessages(pages.get(session.id) ?? {}).at(-1);
    if (latest) lines.push(`  Tiến độ: ${Array.from(redact(latest.text)).slice(0, 650).join('')}`);
  }
  return redact(lines.join('\n'));
}

export function redact(text, secrets = []) {
  let result = String(text ?? '');
  for (const secret of secrets.filter(Boolean)) result = result.split(secret).join('[REDACTED]');
  return result.replace(/\b\d{6,15}:[A-Za-z0-9_-]{25,}\b/g, '[REDACTED]')
    .replace(/\b(token|password|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]');
}
const help = 'FG / Codex\n/status — phiên FG, task và evidence hiện tại\n/sessions — danh sách phiên FG web\n/usage — hạn mức Codex và thời gian reset\n/do — xem các phiên Codex local\n/do vài chữ đầu — gợi ý phiên theo tên\n/pick 1 — chọn số từ danh sách (hạn 5 phút)\n/do tên đầu | nội dung — chọn phiên rồi chuyển lệnh\n/do nội dung — gửi lệnh vào phiên đã chọn; mặc định Coding and build 2\n/demo — demo UI/UX gần nhất\n/progress — tiến độ FG\n/notifications on|off — bật/tắt báo tiến độ\n/help — hướng dẫn\nBot chạy khi máy và Codex Desktop mở. Không tự đổi task hoặc PASS.';
export function report(ledger, evidence, sessions = '') {
  const task = ledger.tasks?.find((item) => item.status !== 'PASS');
  if (!task) return [sessions, 'Ledger không có task chưa PASS. Đây là trạng thái ledger, không thay review.'].filter(Boolean).join('\n');
  const lines = [sessions, 'FG — task từ ledger', `Task: ${task.id}`, `Trạng thái: ${task.status}`].filter(Boolean);
  const processing = ledger.tasks.filter((item) => ['IN_PROGRESS', 'BLOCKED', 'FAILED'].includes(item.status));
  if (processing.length) lines.push('Đang xử lý trong ledger:', ...processing.map((item) => `${item.id}: ${item.status}`));
  const next = ledger.tasks.filter((item) => item.status === 'NOT_STARTED').slice(0, 3);
  if (next.length) lines.push(`Kế tiếp (chưa chạy): ${next.map((item) => item.id).join(' → ')}`);
  const last = task.commands?.at(-1);
  if (last) lines.push(`Command cuối được ghi: exit ${last.exitCode ?? 'chưa có'}`);
  if (evidence?.task === task.id) {
    lines.push(`Evidence snapshot: ${evidence.recordedAt ?? 'chưa có giờ'}`);
    if (Number.isInteger(evidence.verifiedCommandRecords)) lines.push(`Command records đã đối soát: ${evidence.verifiedCommandRecords}`);
  }
  lines.push('Dữ liệu đã ghi nhận; không suy ra PASS hoặc task đang chạy chỉ từ snapshot.');
  return redact(lines.join('\n'));
}
export function agentMessages(page) {
  return (page.turns ?? []).toReversed().flatMap((turn) => turn.items ?? [])
    .filter((item) => item.type === 'agentMessage' && ['commentary', 'final'].includes(item.phase)
      && typeof item.text === 'string' && typeof item.id === 'string')
    .map(({ id, text }) => ({ id, text }));
}
export class Controller {
  constructor(options) { Object.assign(this, options); }
  async suggest(query = '', prompt) {
    const matches = matchSessions(await this.listTargets(), query).slice(0, 20);
    this.choice = { matches, prompt, expires: this.clock() + 300000 };
    await this.reply(matches.length ? `Chọn phiên nhận lệnh:\n${matches.map((s, i) => `${i + 1}. ${s.title} — ${s.cwd ?? 'không có project'}`).join('\n')}\nGửi /pick số (ví dụ /pick 1). Hoặc nhập thêm vài chữ đầu tên phiên.\n${prompt ? 'Lệnh sẽ được gửi sau khi bạn chọn phiên.' : 'Sau khi chọn, gửi /do nội dung.'}`
      : 'Không tìm thấy tên phiên bắt đầu bằng các chữ này. Dùng /do để xem danh sách.');
  }
  async deliver(id, prompt) {
    if (!prompt || prompt.length > 3500) { await this.reply('Lệnh cần 1–3500 ký tự.'); return; }
    if (['pending', 'uncertain'].includes(this.state.delivery?.state)) {
      await this.reply('Lệnh trước cần đối soát trong Codex trước khi gửi thêm, để tránh thực hiện trùng.'); return;
    }
    const target = this.actorId && this.actorId !== this.state.ownerId
      ? this.state.userTargets?.[this.actorId] ?? this.target : this.state.commandTarget ?? this.target;
    const sessions = this.listTargets ? await this.listTargets() : [{ id: target, title: this.targetName }];
    const selected = sessions.find(s => s.id === target);
    if (!selected) { await this.reply('Phiên đã chọn không còn khả dụng. Dùng /do để chọn lại.'); return; }
    await this.selectTarget?.(target, this.actorId);
    this.state.delivery = { id, target, actorId: this.actorId, state: 'pending', at: new Date(this.clock()).toISOString() };
    await this.persist();
    try {
      await this.dispatch(target, redact(prompt, this.secrets));
      this.state.delivery.state = 'accepted'; await this.persist();
      await this.reply(`Đã chuyển lệnh #${id} vào ${selected.title ?? 'chat Codex'}. Chưa có kết quả thực hiện.`);
    } catch {
      this.state.delivery.state = 'uncertain'; await this.persist();
      await this.reply(`Lệnh #${id} chưa xác nhận được chuyển. Cần đối soát trong Codex; bot không tự gửi lại.`);
    }
  }
  async reply(text) {
    const receipt = await this.send(this.replyChatId ?? this.state.chatId, redact(text, this.secrets));
    if (Number.isSafeInteger(receipt?.message_id)) {
      this.state.lastReply = { messageId: receipt.message_id, at: new Date(this.clock()).toISOString() };
      await this.persist();
    }
  }
  async handle(update) {
    this.actorChoices ??= new Map();
    const actor = update.message?.from?.id;
    this.choice = this.actorChoices.get(actor);
    try { await this.handleMessage(update); }
    finally {
      if (this.choice) this.actorChoices.set(actor, this.choice); else this.actorChoices.delete(actor);
      this.choice = null; this.replyChatId = undefined; this.actorId = undefined;
    }
  }
  async handleMessage(update) {
    const id = update.update_id;
    if (!Number.isSafeInteger(id) || id < this.state.offset || id < 0) return;
    this.state.offset = id + 1;
    await this.persist();
    const message = update.message;
    if (!message || message.chat?.type !== 'private' || message.from?.is_bot
      || !Number.isSafeInteger(message.from?.id) || message.from.id <= 0
      || message.chat.id !== message.from.id || typeof message.text !== 'string'
      || !Number.isFinite(message.date) || Math.abs(this.clock() / 1000 - message.date) > 300) return;
    const rawText = message.text.trim();
    const text = rawText === '/reply' ? '/do' : rawText.startsWith('/reply ') ? `/do ${rawText.slice(7)}` : rawText;
    if (!this.state.ownerId) {
      const match = /^\/start\s+([A-Za-z0-9_-]+)$/.exec(text);
      if (message.from.username?.toLowerCase() !== 'kinggamelv') return;
      if (!match || this.clock() > this.state.pairExpires || !this.state.pairCode) {
        await this.send(message.chat.id, 'Chưa ghép tài khoản. Mở liên kết ghép mới nhất trong chat Codex rồi bấm Start; mã có hạn10phút.'); return;
      }
      const expected = Buffer.from(this.state.pairCode), provided = Buffer.from(match[1]);
      if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
        await this.send(message.chat.id, 'Mã ghép chưa đúng. Dùng liên kết ghép mới nhất trong chat Codex.'); return;
      }
      this.state.ownerId = message.from.id; this.state.chatId = message.chat.id;
      this.state.notifications = true;
      delete this.state.pairCode; delete this.state.pairExpires;
      await this.persist(); await this.reply(`Đã ghép tài khoản. Phiên nhận lệnh: ${this.targetName ?? 'chat Codex đã chọn'}.\n${help}`); return;
    }
    const username = message.from.username?.toLowerCase();
    const invite = this.state.invitedUsers?.find(item => item.username === username && !item.userId);
    if (message.from.id !== this.state.ownerId && !this.state.invitedUsers?.some(item => item.userId === message.from.id)) {
      if (text !== '/start' || !invite) return;
      invite.userId = message.from.id; invite.pairedAt = new Date(this.clock()).toISOString();
      await this.persist();
    }
    this.replyChatId = message.chat.id; this.actorId = message.from.id;
    if (text === '/start') { await this.reply(`Đã có quyền dùng bot: xem báo cáo, chọn phiên và gửi /do.\n${help}`); return; }
    if (this.listTargets && (text === '/do' || text.startsWith('/pick ') || text.startsWith('/do ')
      || (this.choice && !text.startsWith('/')))) {
      try {
        if (text.startsWith('/pick ')) {
          const index = Number(text.slice(6));
          if (!this.choice || this.choice.expires < this.clock() || !Number.isInteger(index) || index < 1 || index > this.choice.matches.length) {
            await this.reply('Lựa chọn hết hạn hoặc số không hợp lệ. Gửi /do vài-chữ-đầu để tìm lại.'); return;
          }
          const selected = this.choice.matches[index - 1];
          if (!(await this.listTargets()).some(s => s.id === selected.id)) { this.choice = null; await this.reply('Phiên không còn khả dụng. Gửi /do để tìm lại.'); return; }
          const prompt = this.choice.prompt;
          await this.selectTarget?.(selected.id, this.actorId);
          if (this.actorId === this.state.ownerId) this.state.commandTarget = selected.id;
          else { this.state.userTargets ??= {}; this.state.userTargets[this.actorId] = selected.id; }
          await this.persist(); this.choice = null;
          await this.reply(`Đã chọn phiên: ${selected.title}.`);
          if (prompt) await this.deliver(id, prompt);
          return;
        }
        const value = text === '/do' ? '' : text.startsWith('/do ') ? text.slice(4).trim() : text;
        const separator = value.indexOf('|');
        if (separator >= 0) {
          const prompt = value.slice(separator + 1).trim();
          if (!prompt || prompt.length > 3500) { await this.reply('Lệnh cần 1–3500 ký tự sau dấu |.'); return; }
          await this.suggest(value.slice(0, separator).trim(), prompt); return;
        }
        const matches = matchSessions(await this.listTargets(), value);
        if (!value || matches.length || !text.startsWith('/do ')) { await this.suggest(value, this.choice?.prompt); return; }
        this.choice = null;
        await this.deliver(id, value);
      } catch { await this.reply('Chưa đọc/chọn được phiên Codex. Thử lại /do sau; chưa xác nhận gửi lệnh.'); }
      return;
    }
    if (text === '/status' || text.startsWith('/status ')) {
      try { await this.reply(await this.status(text.slice(7).trim(), this.actorId)); }
      catch { await this.reply('Chưa đọc được danh sách phiên Codex. Thử lại /status sau.'); }
      return;
    }
    if (text === '/sessions') { await this.reply(await this.sessions()); return; }
    if (text === '/task') {
      try { await this.reply(await this.tasks()); }
      catch { await this.reply('Chưa đọc được ledger task FG. Thử lại /task sau; không có dữ liệu để xác nhận thứ tự.'); }
      return;
    }
    if (text === '/demo') { await this.demo(this.replyChatId); return; }
    if (['/progress', '/time', '/check_progress'].includes(text)) {
      await this.reply(await this.progress()); return;
    }
    if (text === '/usage' || text === '/check_usage') {
      try { await this.reply(await this.usage()); }
      catch { await this.reply('Chưa đọc được usage Codex. Thử lại /usage sau; không có số liệu để xác nhận.'); }
      return;
    }
    if (/^\/notifications (on|off)$/.test(text)) {
      if (this.actorId !== this.state.ownerId) { await this.reply('Báo tự động đang dành cho Ken. Bạn có thể dùng /status, /progress, /usage và /demo để xem báo cáo.'); return; }
      this.state.notifications = text.endsWith(' on'); await this.persist();
      await this.reply(this.state.notifications ? 'Đã bật báo tiến độ.' : 'Đã tắt báo tiến độ.'); return;
    }
    if (text.startsWith('/do ')) {
      const prompt = text.slice(4).trim();
      if (!prompt || prompt.length > 3500) { await this.reply('Lệnh cần 1–3500 ký tự.'); return; }
      if (['pending', 'uncertain'].includes(this.state.delivery?.state)) {
        await this.reply('Lệnh trước cần đối soát trong Codex trước khi gửi thêm, để tránh thực hiện trùng.'); return;
      }
      this.state.delivery = { id, state: 'pending', at: new Date(this.clock()).toISOString() };
      await this.persist();
      try {
        await this.dispatch(this.target, redact(prompt, this.secrets));
        this.state.delivery.state = 'accepted'; await this.persist();
        await this.reply(`Đã chuyển lệnh #${id} vào chat Codex. Chưa có kết quả thực hiện.`);
      } catch {
        this.state.delivery.state = 'uncertain'; await this.persist();
        await this.reply(`Lệnh #${id} chưa xác nhận được chuyển. Cần đối soát trong Codex; bot không tự gửi lại.`);
      }
      return;
    }
    await this.reply(`${help}\n/task — task FG hiện tại và thứ tự toàn bộ task tiếp theo\n/reply tên phiên | trả lời — chọn phiên rồi gửi phản hồi; không thay phê duyệt Codex`);
  }
}
