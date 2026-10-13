import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { pipeRequest, AppClient } from './app-client.mjs';

async function withServer(handler, probe) {
  const sockets = new Set();
  const server = net.createServer((socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); handler(socket); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try { await probe({ host: '127.0.0.1', port: server.address().port }); }
  finally { for (const socket of sockets) socket.destroy(); await new Promise((resolve) => server.close(resolve)); }
}
const frame = (response) => {
  const payload = Buffer.from(JSON.stringify(response)), result = Buffer.alloc(4 + payload.length);
  result.writeUInt32LE(payload.length); payload.copy(result, 4); return result;
};
test('transport accepts fragmented prefix/body', async () => {
  await withServer((socket) => socket.once('data', () => {
    const value = frame({ jsonrpc: '2.0', id: 1, result: { value: 7 } });
    socket.write(value.subarray(0, 2)); setTimeout(() => socket.write(value.subarray(2, 8)), 5);
    setTimeout(() => socket.end(value.subarray(8)), 10);
  }), async (address) => assert.deepEqual(await pipeRequest(address, 'tools/list', {}), { value: 7 }));
});
test('oversized and malformed frame rejected', async () => {
  await withServer((socket) => socket.once('data', () => {
    const prefix = Buffer.alloc(4); prefix.writeUInt32LE(9 * 1024 * 1024); socket.write(prefix);
  }), async (address) => assert.rejects(pipeRequest(address, 'tools/list', {}), /too large/));
  await withServer((socket) => socket.once('data', () => socket.write(frame({ id: 2, jsonrpc: '2.0', result: true }))),
    async (address) => assert.rejects(pipeRequest(address, 'tools/list', {}), /Invalid/));
});
test('stalled connection times out and closes', async () => {
  await withServer(() => {}, async (address) => assert.rejects(pipeRequest(address, 'tools/list', {}, 30), /timeout/));
});
test('only permitted tools and pinned thread reach local app transport', async () => {
  const client = new AppClient('unused', 'fixed');
  await assert.rejects(client.call('delete_thread', { threadId: 'fixed' }), /not allowed/);
  await assert.rejects(client.send('other', 'work'), /Wrong target/);
});
test('tool RPC error details never pass to caller', async () => {
  await withServer((socket) => socket.once('data', () => socket.write(frame({ jsonrpc: '2.0', id: 1,
    error: { code: -1, message: 'private secret' } }))),
    async (address) => assert.rejects(pipeRequest(address, 'tools/list', {}), { message: 'App tools rejected request' }));
});
test('FG discovery authorizes read only within workspace and sends only to selected build', async () => {
  const calls = [];
  const rpc = async (_pipe, method, params) => {
    if (method === 'tools/list') return { tools: ['list_threads', 'read_thread', 'send_message_to_thread']
      .map((name) => ({ name, namespace: 'codex_app' })) };
    calls.push(params);
    const result = params.tool === 'list_threads' ? { threads: [
      { id: 'build', cwd: 'E:/FGweb', kind: 'codex', hostId: 'local', title: 'Coding and build 2' },
      { id: 'other', cwd: 'E:/Other', kind: 'codex', hostId: 'local' }] } : { accepted: true };
    return { success: true, contentItems: [{ type: 'inputText', text: JSON.stringify(result) }] };
  };
  const client = new AppClient('unused', 'caller', 'build', rpc);
  await client.list(); await client.read('build'); await client.send('build', 'continue');
  await assert.rejects(client.read('other'), /Wrong target/); await assert.rejects(client.send('caller', 'work'), /Wrong target/);
  assert.equal(calls.at(-1).threadId, 'caller'); assert.equal(calls.at(-1).arguments.threadId, 'build');
  assert.equal(calls.at(-1).arguments.prompt, 'continue');
});
test('automatic reconnect never replays an ambiguous command delivery', async () => {
  let dispatches = 0;
  const client = new AppClient('fake', 'caller', 'build', async (_pipe, method) => {
    if (method === 'tools/list') return { tools: [{ name: 'send_message_to_thread', namespace: 'codex_app' }] };
    dispatches++; throw new Error('Connection lost after request');
  });
  client.autoReconnect = true; client.readTargets.add('build');
  await assert.rejects(client.send('build', 'continue'), /Connection lost/);
  assert.equal(dispatches, 1);
});

test('explicit selection permits another discovered local chat and rejects undiscovered target', async () => {
  const sent = [];
  const client = new AppClient('unused', 'caller', 'build', async (_pipe, method, params) => {
    if (method === 'tools/list') return { tools: ['list_threads', 'send_message_to_thread'].map(name => ({ name, namespace: 'codex_app' })) };
    if (params.tool === 'list_threads') return { success: true, contentItems: [{ type: 'inputText', text: JSON.stringify({ threads: [
      { id: 'idea', title: 'Idea', kind: 'codex', cwd: 'E:/Other' },
      { id: 'remote', title: 'Remote', kind: 'codex', hostId: 'remote' }] }) }] };
    sent.push(params.arguments); return { success: true, contentItems: [{ type: 'inputText', text: '{}' }] };
  });
  await client.targets(); assert.throws(() => client.select('remote'), /Wrong target/);
  client.select('idea'); await client.send('idea', 'work');
  await assert.rejects(client.send('build', 'work'), /Wrong target/);
  assert.deepEqual(sent, [{ threadId: 'idea', prompt: 'work' }]);
});
