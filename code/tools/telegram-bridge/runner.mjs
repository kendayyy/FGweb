import { readFile, writeFile, rename, mkdir, unlink, open } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Controller, report, redact, agentMessages, sessionReport, usageReport } from './core.mjs';
import { AppClient } from './app-client.mjs';
import { Telegram } from './telegram.mjs';
import { loadDemo, demoSummary } from './demo.mjs';
import { progressReport } from './progress.mjs';
import { StatusView } from './status.mjs';
import { taskReport, taskNames } from './tasks.mjs';
import { sessionAlert, recoveryAlert } from './alerts.mjs';
import os from 'node:os';
import {drainDemoStream} from './demo-stream.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const runtime = path.join(root, '.runtime/telegram-bridge');
const statePath = path.join(runtime, 'state.json');
const connectionPath = path.join(runtime, 'connection.json');
const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
const atomic = async (file, value) => {
  const temp = `${file}.${process.pid}.tmp`;
  const handle = await open(temp, 'w', 0o600);
  try { await handle.writeFile(JSON.stringify(value, null, 2)); await handle.sync(); } finally { await handle.close(); }
  await rename(temp, file);
};
async function tokenRead() {
  return new Promise((resolve, reject) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', path.join(root, 'tools/telegram-bridge/secret.ps1'), '-Mode', 'Read',
    '-Path', path.join(runtime, 'token.dpapi')], { windowsHide: true, timeout: 10000 },
  (error, out) => error ? reject(new Error('Cannot decrypt local token')) : resolve(out.trim())));
}
async function snapshot(sessions = '', page, taskOnly = false) {
  const ledger = await json(path.join(root, 'quality/tasks.json'));
  const task = ledger.tasks.find((item) => item.status !== 'PASS');
  let evidence;
  if (task && /^[A-Z0-9-]+$/.test(task.id)) {
    try { evidence = await json(path.join(root, `quality/evidence/${task.id}/progress-review.json`)); }
    catch { /* Ledger still available when no progress snapshot exists. */ }
  }
  if (taskOnly) {
    const names = taskNames(await readFile(path.join(root, '../.doc/task.md'), 'utf8'));
    return taskReport(ledger, evidence, Date.now(), names);
  }
  return page ? progressReport(ledger, evidence, page) : report(ledger, evidence, sessions);
}
export async function main(mode = process.argv[2]) {
  await mkdir(runtime, { recursive: true });
  const connection = await json(connectionPath);
  if (connection.thread !== '01a11d13-223b-70e0-afd3-a1736eb6f62e' || !connection.pipe) throw new Error('Invalid pinned connection');
  const commandTarget = connection.commandThread ?? connection.thread;
  let selectedCommandTarget = commandTarget;
  if (!['01a11d13-223b-70e0-afd3-a1736eb6f62e', '01a11c65-3f1d-72b3-af93-75f16a80b147'].includes(commandTarget)) throw new Error('Command target not authorized');
  const token = await tokenRead();
  const telegram = new Telegram(token), app = new AppClient(connection.pipe, connection.thread, commandTarget);
  app.autoReconnect = true;
  app.onReconnect = async (pipe) => { connection.pipe = pipe; await atomic(connectionPath, connection); };
  const me = await telegram.call('getMe');
  const webhook = await telegram.call('getWebhookInfo');
  if (webhook.url) throw new Error('Existing webhook: stop and review before polling');
  let sessions = await app.list();
  const selected = sessions.find((item) => item.id === commandTarget);
  if (!selected) throw new Error('Selected FG session not found');
  let page = await app.read(commandTarget);
  if (page.thread?.id !== commandTarget) throw new Error('App target not verified');
  const inspect = async () => {
    sessions = await app.list();
    if (!sessions.some((item) => item.id === commandTarget)) throw new Error('Selected FG session unavailable');
    page = await app.read(commandTarget);
    return sessionReport(sessions, new Map([[commandTarget, page]]), selectedCommandTarget);
  };
  if (mode === 'smoke') {
    console.log(JSON.stringify({ telegram: true, botUsername: me.username, app: true, target: commandTarget,
      targetTitle: selected.title, fgSessions: sessions.length, webhook: false })); return;
  }
  if (mode === 'report') {
    console.log(await snapshot(await inspect())); return;
  }
  if (mode === 'task') { console.log(await snapshot('', undefined, true)); return; }
  if (mode === 'progress' || mode === 'progress-send') {
    await inspect();
    const text = await snapshot('', page);
    if (mode === 'progress') console.log(text);
    else {
      const owner = await json(statePath);
      if (!owner.ownerId || owner.chatId !== owner.ownerId) throw new Error('Owner not paired');
      const receipt = await telegram.send(owner.chatId, text);
      console.log(JSON.stringify({ progressSent: true, messageId: receipt.message_id }));
    }
    return;
  }
  if (mode === 'usage') {
    console.log(usageReport(await app.usage())); return;
  }
  if (mode === 'usage-send') {
    const owner = await json(statePath);
    if (!owner.ownerId || owner.chatId !== owner.ownerId) throw new Error('Owner not paired');
    const receipt = await telegram.send(owner.chatId, usageReport(await app.usage()));
    console.log(JSON.stringify({ usageSent: true, messageId: receipt.message_id })); return;
  }
  if (mode === 'prepare') {
    let existing;
    try { existing = await json(statePath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (existing?.ownerId) { console.log('Already paired'); return; }
    const pairCode = randomBytes(12).toString('base64url');
    await atomic(statePath, { offset: existing?.offset ?? 0, pairCode, pairExpires: Date.now() + 600000,
      seen: agentMessages(page).map((item) => item.id), notifications: true });
    console.log(JSON.stringify({ botUsername: me.username, pairCode, expiresMinutes: 10 })); return;
  }
  if (mode !== 'run') throw new Error('Use prepare, smoke or run');
  const lockPath = path.join(runtime, 'running.lock');
  try { await writeFile(lockPath, String(process.pid), { flag: 'wx' }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const pid = Number(await readFile(lockPath, 'utf8'));
    if (!Number.isSafeInteger(pid) || pid < 1) throw new Error('Invalid runtime lock: review locally', { cause: error });
    try { process.kill(pid, 0); throw new Error('Another bridge is running', { cause: error }); }
    catch (probe) { if (probe.code !== 'ESRCH') throw probe; }
    await unlink(lockPath); await writeFile(lockPath, String(process.pid), { flag: 'wx' });
  }
  let running = true;
  process.once('SIGTERM', () => { running = false; }); process.once('SIGINT', () => { running = false; });
  const state = await json(statePath), persist = () => atomic(statePath, state);
  const statusViews = new Map();
  selectedCommandTarget = state.commandTarget ?? commandTarget;
  const sendDemo = async (automatic = false, chatId = state.chatId, manifest) => {
    let bundle;
    try { bundle = await loadDemo(root, manifest); }
    catch (error) {
      if (!automatic) await telegram.send(chatId, error.code === 'ENOENT'
        ? 'Chưa có báo cáo demo UI/UX headed mới. Khi demo thật có ảnh/evidence, bot sẽ gửi các bước và kết quả.'
        : 'Evidence demo chưa hợp lệ hoặc ảnh/hash không khớp; chưa gửi ảnh. Cần phiên build kiểm tra.');
      return;
    }
    if (automatic && !manifest && bundle.demo.streamEvent) return;
    const identity = createHash('sha256').update(JSON.stringify(bundle.demo)).digest('hex');
    if (automatic && state.demoDelivery?.identity === identity) return state.demoDelivery.status;
    state.demoDelivery = { identity, status: 'pending', at: new Date().toISOString() }; await persist();
    try {
      await telegram.send(chatId, redact(demoSummary(bundle.demo), [token]));
      for (const [index, image] of bundle.images.entries()) {
        await telegram.photo(chatId, image.bytes,
          redact(`${index + 1}. ${image.step.action}\n${image.step.result}`, [token]), image.type);
      }
      state.demoDelivery.status = 'sent'; await persist();
      return 'sent';
    } catch {
      state.demoDelivery.status = 'uncertain'; await persist();
      await telegram.send(chatId, 'Báo cáo demo chưa xác nhận gửi đủ ảnh. Dùng /demo để yêu cầu gửi lại.').catch(() => {});
      return 'uncertain';
    }
  };
  const bot = new Controller({ state, target: commandTarget, targetName: selected.title, clock: Date.now, secrets: [token], persist,
    listTargets: () => app.targets(), selectTarget: (target, actor) => {
      app.select(target); if (actor === state.ownerId) selectedCommandTarget = target;
    },
    send: (id, text) => telegram.send(id, text), status: async (query, actor) => {
      if (!statusViews.has(actor)) statusViews.set(actor, new StatusView(app));
      const statusView = statusViews.get(actor);
      const text = await statusView.report(query);
      return query ? text : `${text}\n\n${await snapshot()}`;
    }, sessions: inspect,
    progress: async () => { await inspect(); return snapshot('', page); }, tasks: () => snapshot('', undefined, true),
    demo: (chatId) => sendDemo(false, chatId), usage: async () => usageReport(await app.usage()), dispatch: (target, text) => app.send(target, text) });
  let lastRead = 0, failureCount = 0, warned = false;
  try {
    await telegram.call('setMyCommands', { commands: [
      { command: 'status', description: 'Mọi phiên; /status tên hoặc số để xem riêng' },
      { command: 'sessions', description: 'Phiên FG web, trạng thái và tiến độ build' },
      { command: 'usage', description: 'Hạn mức Codex, phần còn lại và giờ reset' },
      { command: 'demo', description: 'Ảnh và diễn biến demo UI/UX headed gần nhất' },
      { command: 'progress', description: 'Thời gian, tiến độ và việc còn lại của FG' },
      { command: 'task', description: 'Task FG hiện tại và thứ tự các task tiếp theo' },
      { command: 'reply', description: 'Trả lời phiên: /reply tên | nội dung, rồi /pick' },
      { command: 'do', description: 'Chọn phiên theo tên hoặc gửi lệnh vào phiên đã chọn' },
      { command: 'pick', description: 'Chọn số phiên từ gợi ý: /pick 1' },
      { command: 'notifications', description: 'Bật/tắt báo tiến độ: on hoặc off' },
      { command: 'help', description: 'Hướng dẫn' } ] });
    console.log(JSON.stringify({ at: new Date().toISOString(), event: 'started', pid: process.pid }));
    let failureStage;
    while (running) {
      try {
        failureStage = 'Telegram API/kết nối';
        const updates = await telegram.call('getUpdates', { offset: state.offset, timeout: 20, allowed_updates: ['message'] });
        for (const update of updates) await bot.handle(update);
        if (Date.now() - lastRead > 10000) {
          failureStage = 'Codex Desktop/kết nối phiên';
          lastRead = Date.now();
          await inspect();
          const now = Date.now(), bootAt = now - os.uptime() * 1000;
          state.monitor ??= {sessions:{}};
          const recovery = recoveryAlert(state.monitor, now, bootAt);
          if (recovery && state.ownerId && state.notifications) await bot.reply(recovery);
          const targets = await app.targets();
          const present = new Set(targets.map(s => s.id));
          for (const [id, observed] of Object.entries(state.monitor.sessions)) {
            if (observed.status === 'active' && !present.has(id)) {
              if (state.ownerId && state.notifications) await bot.reply(`${observed.title ?? 'Phiên đã theo dõi'} không còn trong danh sách Desktop. Chưa xác định được đã đóng, mất quyền truy cập hay nằm ngoài danh sách gần đây; chưa có bằng chứng mất điện/hết usage.`);
              observed.status = 'unavailable';
            }
          }
          for (const session of targets) {
            const previous = state.monitor.sessions[session.id] ?? {};
            const status = typeof session.status === 'string' ? session.status : session.status?.type;
            if (session.id !== commandTarget && !['active','needsAttention'].includes(status) && previous.status !== 'active') continue;
            let details;
            try { details = session.id === commandTarget ? page : await app.read(session.id); }
            catch { continue; }
            if (details.thread?.id !== session.id) continue;
            const alert = sessionAlert(session, details, previous);
            if (alert.text && state.ownerId && state.notifications) await bot.reply(redact(alert.text, [token]));
            state.monitor.sessions[session.id] = {...alert.observation, title:session.title};
          }
          state.monitor.lastObservedAt = now; state.monitor.bootAt = bootAt;
          delete state.monitor.failureStage; await persist();
          const messages = agentMessages(page);
          const seen = new Set(state.seen ?? []);
          for (const message of messages) {
            if (!seen.has(message.id) && state.ownerId && state.notifications) {
              await bot.reply(`${selected.title} — tiến độ\n${redact(message.text, [token])}`);
            }
            seen.add(message.id);
          }
          state.seen = [...seen].slice(-500);
          const status = await snapshot(sessionReport(sessions, new Map(), selectedCommandTarget));
          const hash = createHash('sha256').update(status).digest('hex');
          if (state.reportHash !== hash && state.ownerId && state.notifications) await bot.reply(status);
          state.reportHash = hash; await persist();
          if (state.ownerId && state.notifications) {
            await drainDemoStream(root,state,persist,manifest => sendDemo(true,state.chatId,manifest));
            await sendDemo(true);
          }
          await atomic(path.join(runtime, 'health.json'), { at: new Date().toISOString(), paired: !!state.ownerId,
            app: true, telegram: true, pid: process.pid, commandTarget, fgSessions: sessions.length,
            delivery: state.delivery?.state ?? null });
        }
        failureCount = 0;
        warned = false;
      } catch (error) {
        failureCount += 1;
        console.error(JSON.stringify({ at: new Date().toISOString(), event: 'retry', count: failureCount }));
        await atomic(path.join(runtime, 'health.json'), { at: new Date().toISOString(), telegram: false,
          app: false, pid: process.pid, paired: !!state.ownerId, retry: failureCount });
        state.monitor ??= {sessions:{}}; state.monitor.failureStage = failureStage;
        await persist();
        if (!warned && state.ownerId && state.notifications) {
          warned = true;
          await bot.reply('Cầu nối đang gặp lỗi kết nối. Bot đang thử lại; chưa xác nhận lệnh hay tiến độ mới.').catch(() => {});
        }
        await delay(Math.min(60000, Math.max((error.retryAfter ?? 0) * 1000, 1000 * 2 ** Math.min(failureCount, 6))));
      }
    }
  } finally { await unlink(lockPath).catch(() => {}); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('Bridge stopped: inspect local configuration; no secrets logged.'); process.exitCode = 1; });
}
