import test from 'node:test';
import assert from 'node:assert/strict';
import { Controller, redact, report, agentMessages, fgSessions, sessionReport, usageReport } from './core.mjs';

const now = 1791490000000;
function fixture(patch = {}) {
  const state = { offset: 0, pairCode: 'abc123xyz', pairExpires: now + 600000, ...patch };
  const sent = [], calls = [], saved = [];
  const bot = new Controller({ state, clock: () => now, target: 'fixed-thread',
    persist: async () => saved.push(structuredClone(state)),
    send: async (id, text) => sent.push({ id, text }),
    dispatch: async (target, text) => { calls.push({ target, text }); return 'accepted'; },
    status: async () => 'CHATCRYPTO-BE IN_PROGRESS' });
  const update = (text, id = 1, options = {}) => ({ update_id: id, message: {
    date: now / 1000, chat: { id: 123, type: 'private' },
    from: { id: 123, username: 'KingGameLV', is_bot: false }, text, ...options } });
  return { bot, state, sent, calls, saved, update };
}
test('pairing requires correct code and pins numeric owner', async () => {
  const f = fixture(); await f.bot.handle(f.update('/start wrong')); assert.equal(f.state.ownerId, undefined);
  await f.bot.handle(f.update('/start abc123xyz', 2)); assert.equal(f.state.ownerId, 123);
  assert.equal(f.state.pairCode, undefined); assert.equal(f.sent.length, 2);
});
test('username alone, group, bot and expired code cannot pair', async () => {
  for (const opts of [{}, { chat: { id: 123, type: 'group' } },
    { from: { id: 123, username: 'Other', is_bot: false } },
    { from: { id: 123, username: 'KingGameLV', is_bot: true } }]) {
    const f = fixture(); await f.bot.handle(f.update(opts === undefined ? '/start' : '/start wrong', 1, opts));
    assert.equal(f.state.ownerId, undefined);
  }
  const f = fixture({ pairExpires: now - 1 }); await f.bot.handle(f.update('/start abc123xyz'));
  assert.equal(f.state.ownerId, undefined);
});
test('group and wrong username denied even with correct pairing code', async () => {
  for (const opts of [{ chat: { id: 123, type: 'group' } }, { from: { id: 456, username: 'Other' } }]) {
    const f = fixture(); await f.bot.handle(f.update('/start abc123xyz', 1, opts)); assert.equal(f.state.ownerId, undefined);
  }
});
test('pinned ID continues after username change; impersonator is rejected', async () => {
  const f = fixture({ ownerId: 123, chatId: 123 });
  await f.bot.handle(f.update('/do continue', 1, { from: { id: 456, username: 'KingGameLV' } }));
  await f.bot.handle(f.update('/do continue', 2, { from: { id: 123, username: 'changed' } }));
  assert.deepEqual(f.calls, [{ target: 'fixed-thread', text: 'continue' }]);
});
test('duplicate update dispatches once and reserves before dispatch', async () => {
  const f = fixture({ ownerId: 123, chatId: 123 });
  f.bot.dispatch = async () => { assert.equal(f.saved.at(-1).delivery.state, 'pending'); f.calls.push(1); };
  await f.bot.handle(f.update('/do test')); await f.bot.handle(f.update('/do test'));
  assert.equal(f.calls.length, 1); assert.equal(f.state.delivery.state, 'accepted');
});
test('ambiguous dispatch is not replayed or advertised as accepted', async () => {
  const f = fixture({ ownerId: 123, chatId: 123 }); f.bot.dispatch = async () => { throw new Error('secret'); };
  await f.bot.handle(f.update('/do test')); await f.bot.handle(f.update('/do test'));
  assert.equal(f.state.delivery.state, 'uncertain'); assert.match(f.sent.at(-1).text, /chưa xác nhận/);
  assert.doesNotMatch(f.sent.at(-1).text, /secret/);
});
test('pending previous dispatch blocks another command until local reconciliation', async () => {
  const f = fixture({ ownerId: 123, chatId: 123, delivery: { state: 'pending', id: 0 } });
  await f.bot.handle(f.update('/do test')); assert.equal(f.calls.length, 0); assert.match(f.sent[0].text, /đối soát/);
});
test('stale command and edited message cannot execute', async () => {
  const f = fixture({ ownerId: 123, chatId: 123 });
  await f.bot.handle(f.update('/do test', 1, { date: now / 1000 - 601 }));
  await f.bot.handle({ update_id: 2, edited_message: f.update('/do test').message }); assert.equal(f.calls.length, 0);
});
test('status and notification preference do not dispatch work', async () => {
  const f = fixture({ ownerId: 123, chatId: 123 });
  await f.bot.handle(f.update('/status')); await f.bot.handle(f.update('/notifications off', 2));
  assert.match(f.sent[0].text, /CHATCRYPTO-BE/); assert.equal(f.state.notifications, false); assert.equal(f.calls.length, 0);
});
test('literal shell punctuation stays data in fixed target message', async () => {
  const f = fixture({ ownerId: 123, chatId: 123 });
  await f.bot.handle(f.update('/do $HOME; `hello` $(whoami)')); assert.equal(f.calls[0].text, '$HOME; `hello` $(whoami)');
});
test('redaction hides token, credentials and email', () => {
  const token = '123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi';
  const value = redact(`${token} token=abc password: pass private@example.com`, [token]);
  assert.doesNotMatch(value, /ABCDEFGHIJKLMNOPQRSTUVWXYZ|abc|pass\b|private@/);
});
test('report uses first unfinished ledger task, exposes no completion claim', () => {
  const value = report({ tasks: [{ id: 'T00', status: 'PASS' }, { id: 'CHATCRYPTO-BE', status: 'IN_PROGRESS' },
    { id: 'CHATCRYPTO-FE', status: 'NOT_STARTED' }] }, { task: 'CHATCRYPTO-BE', status: 'IN_PROGRESS',
    recordedAt: '2026-10-09T00:00:00Z', verifiedCommandRecords: 205 });
  assert.match(value, /CHATCRYPTO-BE/); assert.match(value, /IN_PROGRESS/); assert.doesNotMatch(value, /hoàn thành/);
});
test('only agent commentary/final emitted; tool, preview, user and reasoning excluded', () => {
  const out = agentMessages({ thread: { preview: 'secret' }, turns: [{ items: [
    { type: 'userMessage', text: 'secret' }, { type: 'reasoning', text: 'secret' },
    { type: 'commandExecution', text: 'secret' }, { type: 'agentMessage', id: '1', phase: 'commentary', text: 'working' },
    { type: 'agentMessage', id: '2', phase: 'final', text: 'done' }] }] });
  assert.deepEqual(out, [{ id: '1', text: 'working' }, { id: '2', text: 'done' }]);
});
test('workspace sessions include pinned and recent FG chats once, excluding other hosts/workspaces', () => {
  const fg = { id: 'build', kind: 'codex', hostId: 'local', cwd: 'E:\\FGweb', title: 'Coding and build 2', status: 'active' };
  assert.deepEqual(fgSessions({ pinnedThreads: [fg], threads: [fg,
    { ...fg, id: 'other', cwd: 'E:/FGweb-other' }, { ...fg, id: 'remote', hostId: 'remote' },
    { ...fg, id: 'cloud', kind: 'chatgpt' }] }), [fg]);
});
test('session report gives actual chat name, runtime state and recent agent progress', () => {
  const text = sessionReport([{ id: 'build', title: 'Coding and build 2', status: 'active' },
    { id: 'old', title: 'Coding and build', status: 'idle' }], new Map([['build', { turns: [{ items: [
      { type: 'agentMessage', id: 'a', phase: 'commentary', text: 'Lobby ảnh đang kiểm thử.' }] }] }]]), 'build');
  assert.match(text, /Coding and build 2/); assert.match(text, /đang chạy/); assert.match(text, /Lobby ảnh/);
  assert.match(text, /Coding and build — đang nghỉ/); assert.doesNotMatch(text, /Coding and build — đang chạy/);
});
test('status combines live sessions with all tasks under processing, separate from queued', () => {
  const text = report({ tasks: [{ id: 'T00', status: 'PASS' }, { id: 'A', status: 'IN_PROGRESS' },
    { id: 'B', status: 'BLOCKED' }, { id: 'C', status: 'NOT_STARTED' }] }, undefined, 'Coding and build 2 — đang chạy');
  assert.match(text, /Coding and build 2/); assert.match(text, /A: IN_PROGRESS/); assert.match(text, /B: BLOCKED/);
  assert.match(text, /Kế tiếp.*C/);
});
test('/sessions displays sessions without dispatching', async () => {
  const f = fixture({ ownerId: 123, chatId: 123 }); f.bot.sessions = async () => 'Coding and build 2 — đang chạy';
  await f.bot.handle(f.update('/sessions')); assert.equal(f.calls.length, 0); assert.match(f.sent[0].text, /Coding and build 2/);
});
test('missing or expired pairing code explains pairing without disclosing FG data', async () => {
  const f = fixture(); await f.bot.handle(f.update('/start')); assert.equal(f.state.ownerId, undefined);
  assert.match(f.sent[0].text, /ghép/); assert.doesNotMatch(f.sent[0].text, /CHATCRYPTO/);
});
test('live sessions remain visible when all ledger tasks passed', () => {
  assert.match(report({ tasks: [{ id: 'T00', status: 'PASS' }] }, undefined,
    'Coding and build 2 — đang chạy'), /Coding and build 2/);
});
test('usage prefers per-limit values, reports remaining and Bangkok reset without account identity', () => {
  const value = usageReport({ accountId: 'private-id', rateLimits: { primary: { usedPercent: 99 } },
    rateLimitsByLimitId: { codex: { primary: { usedPercent: 29, windowDurationMins: 300, resetsAt: 1791508931 },
      secondary: { usedPercent: 67, windowDurationMins: 10080 } } } });
  assert.match(value, /29%/); assert.match(value, /71%/); assert.match(value, /33%/);
  assert.match(value, /UTC\+07/); assert.doesNotMatch(value, /private-id|99%/);
});
test('unknown usage is unavailable, never fabricated zero', () => {
  assert.match(usageReport({ rateLimits: { primary: { usedPercent: null } } }), /chưa có dữ liệu/);
  assert.doesNotMatch(usageReport({}), /0%/);
});
test('usage command reads quota without dispatch and rejects non-owner', async () => {
  const f = fixture({ ownerId: 123, chatId: 123 }); let reads = 0;
  f.bot.usage = async () => { reads++; return 'Đã dùng29%, còn71%'; };
  await f.bot.handle(f.update('/usage')); await f.bot.handle(f.update('/usage', 2, { from: { id: 456 } }));
  assert.equal(reads, 1); assert.equal(f.calls.length, 0); assert.match(f.sent[0].text, /71%/);
});

import { commandSessions, matchSessions } from './core.mjs';
test('prefix picker handles accents and duplicate titles without dispatch', async () => {
  const f = fixture({ ownerId: 123, chatId: 123 });
  f.bot.listTargets = async () => [{ id: 'one', title: 'Ý tưởng FG' }, { id: 'two', title: 'Ý tưởng logo' }];
  f.bot.selectTarget = async target => { f.selected = target; };
  await f.bot.handle(f.update('/do y tuong'));
  assert.equal(f.calls.length, 0); assert.match(f.sent.at(-1).text, /Ý tưởng FG/); assert.match(f.sent.at(-1).text, /Ý tưởng logo/);
  await f.bot.handle(f.update('/pick 2', 2));
  await f.bot.handle(f.update('/do tiếp tục công việc', 3));
  assert.deepEqual(f.calls, [{ target: 'two', text: 'tiếp tục công việc' }]); assert.equal(f.state.delivery.target, 'two');
});
test('query and pending instruction dispatch only after numeric selection, once', async () => {
  const f = fixture({ ownerId: 123, chatId: 123 });
  f.bot.listTargets = async () => [{ id: 'idea', title: 'Idea' }];
  await f.bot.handle(f.update('/do id | sửa bản demo'));
  assert.equal(f.calls.length, 0);
  await f.bot.handle(f.update('/pick 1', 2)); await f.bot.handle(f.update('/pick 1', 2));
  assert.deepEqual(f.calls, [{ target: 'idea', text: 'sửa bản demo' }]);
});
test('picker rejects impersonator, invalid/expired pick and removed session', async () => {
  const f = fixture({ ownerId: 123, chatId: 123 }); let reads = 0;
  f.bot.listTargets = async () => { reads++; return [{ id: 'idea', title: 'Idea' }]; };
  await f.bot.handle(f.update('/do', 1, { from: { id: 456 } })); assert.equal(reads, 0);
  await f.bot.handle(f.update('/pick 1', 2)); assert.equal(f.calls.length, 0);
  await f.bot.handle(f.update('/do id | work', 3)); f.bot.listTargets = async () => [];
  await f.bot.handle(f.update('/pick 1', 4)); assert.equal(f.calls.length, 0); assert.equal(f.state.commandTarget, undefined);
  f.bot.choice = { matches: [{ id: 'idea', title: 'Idea' }], expires: now - 1, prompt: 'work' };
  await f.bot.handle(f.update('/pick 1', 5)); assert.equal(f.calls.length, 0);
});
test('selected target persists and ambiguous delivery blocks after switching', async () => {
  const f = fixture({ ownerId: 123, chatId: 123, commandTarget: 'idea', delivery: { state: 'uncertain' } });
  f.bot.listTargets = async () => [{ id: 'idea', title: 'Idea' }];
  await f.bot.handle(f.update('/do work')); assert.equal(f.calls.length, 0);
});
test('command inventory includes other local projects but excludes cloud and remote', () => {
  const session = { id: 'idea', title: 'Idea', kind: 'codex', cwd: 'E:/Other' };
  const out = commandSessions({ threads: [session, { ...session, id: 'remote', hostId: 'remote' }, { ...session, id: 'cloud', kind: 'chatgpt' }] });
  assert.deepEqual(out, [session]); assert.equal(matchSessions(out, 'ID').length, 1);
});

test('invited username must start privately before numeric binding; replies go to that user', async () => {
  const f=fixture({ownerId:123,chatId:123,invitedUsers:[{username:'quangminha1'}]});
  const guest=(text,id,username='QuangMinha1')=>f.update(text,id,{chat:{id:789,type:'private'},from:{id:789,username,is_bot:false}});
  await f.bot.handle(guest('/status',1));assert.equal(f.sent.length,0);
  await f.bot.handle(guest('/start',2));assert.equal(f.state.invitedUsers[0].userId,789);assert.equal(f.sent.at(-1).id,789);
  await f.bot.handle(guest('/status',3,'renamed'));assert.equal(f.sent.at(-1).id,789);assert.match(f.sent.at(-1).text,/CHATCRYPTO/);
  const before=f.sent.length;await f.bot.handle(f.update('/start',4,{chat:{id:456,type:'private'},from:{id:456,username:'QuangMinha1'}}));assert.equal(f.sent.length,before);
  assert.equal(f.state.ownerId,123);assert.equal(f.state.chatId,123);assert.equal(f.bot.replyChatId,undefined);
});
test('two authorized users have separate command choices and persisted targets',async()=>{
 const f=fixture({ownerId:123,chatId:123,invitedUsers:[{username:'quangminha1',userId:789}]});
 f.bot.listTargets=async()=>[{id:'a',title:'Alpha'},{id:'b',title:'Beta'}];
 const guest=(text,id)=>f.update(text,id,{chat:{id:789,type:'private'},from:{id:789,username:'QuangMinha1'}});
 await f.bot.handle(f.update('/do Alpha',1));await f.bot.handle(guest('/do Beta | work',2));
 await f.bot.handle(f.update('/pick 1',3));assert.equal(f.state.commandTarget,'a');assert.equal(f.calls.length,0);
 await f.bot.handle(guest('/pick 1',4));assert.equal(f.state.userTargets[789],'b');assert.deepEqual(f.calls,[{target:'b',text:'work'}]);
 await f.bot.handle(f.update('/do continue',5));assert.equal(f.calls.at(-1).target,'a');assert.equal(f.sent.at(-1).id,123);
});
test('guest demo recipient isolated and guest cannot change owner notifications',async()=>{
 const f=fixture({ownerId:123,chatId:123,notifications:true,invitedUsers:[{username:'quangminha1',userId:789}]});let recipient;
 f.bot.demo=async id=>{recipient=id;};const guest=(text,id)=>f.update(text,id,{chat:{id:789,type:'private'},from:{id:789}});
 await f.bot.handle(guest('/demo',1));assert.equal(recipient,789);
 await f.bot.handle(guest('/notifications off',2));assert.equal(f.state.notifications,true);assert.equal(f.sent.at(-1).id,789);
 await f.bot.reply('auto');assert.equal(f.sent.at(-1).id,123);
});

test('reply alias sends answer only after selecting intended question chat',async()=>{
 const f=fixture({ownerId:123,chatId:123}); f.bot.listTargets=async()=>[{id:'q',title:'Question chat'}];
 await f.bot.handle(f.update('/reply Question | chọn phương án A'));assert.equal(f.calls.length,0);
 await f.bot.handle(f.update('/pick 1',2));assert.deepEqual(f.calls,[{target:'q',text:'chọn phương án A'}]);
});
