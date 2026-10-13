import test from 'node:test';
import assert from 'node:assert/strict';
import { Telegram } from './telegram.mjs';

test('API failures never leak the token or request URL', async () => {
  const api = new Telegram('test-secret', async () => { throw new Error('https://api.telegram.org/bottest-secret'); });
  await assert.rejects(api.call('getMe'), { message: 'Telegram connection failed' });
});
test('429 retains retry delay; service detail stays private', async () => {
  const api = new Telegram('test-secret', async () => ({ json: async () => ({ ok: false, error_code: 429,
    description: 'test-secret', parameters: { retry_after: 7 } }) }));
  await assert.rejects(api.call('getMe'), (error) => error.retryAfter === 7 && !error.message.includes('test-secret'));
});
test('only supported API methods accepted and parsed result returned', async () => {
  let options;
  const api = new Telegram('test-secret', async (_url, opts) => { options = opts; return { json: async () => ({ ok: true, result: [{ update_id: 1 }] }) }; });
  assert.deepEqual(await api.call('getUpdates', { offset: 7, timeout: 20 }), [{ update_id: 1 }]);
  assert.equal(JSON.parse(options.body).offset, 7);
  await assert.rejects(api.call('deleteWebhook'), /not allowed/);
});
test('demo photo uses multipart bytes with caption, no local path disclosure', async () => {
  let request;
  const api = new Telegram('test-secret', async (_url, options) => {
    request = options; return { json: async () => ({ ok: true, result: { message_id: 9 } }) };
  });
  const receipt = await api.photo(123, Buffer.from([137,80,78,71]), 'Bước1: mở Lobby');
  assert.equal(receipt.message_id, 9); assert.ok(request.body instanceof FormData);
  assert.equal(request.headers, undefined); assert.equal(request.body.get('chat_id'), '123');
  assert.equal(request.body.get('photo').name, 'demo.png');
  assert.match(request.body.get('caption'), /^Xin chào Ken, tôi là FG Bot, xin báo cáo\n\n/);
  assert.match(request.body.get('caption'), /Lobby/);
});
test('long progress report sends all content in ordered chunks instead of truncation', async () => {
  const bodies = [];
  const api = new Telegram('test-secret', async (_url, options) => {
    bodies.push(JSON.parse(options.body)); return { json: async () => ({ ok: true, result: { message_id: bodies.length } }) };
  });
  const value = 'A'.repeat(4500) + '\nTask lớn còn 30 giờ';
  await api.send(123, value);
  assert.equal(bodies.map(item => item.text.replace(/^Xin chào Ken, tôi là FG Bot, xin báo cáo\n\n/, '')).join(''), value);
  assert.equal(bodies.length, 2); assert.ok(bodies.every(item => item.text.length <= 3800));
});
test('all messages start with requested greeting without duplicating it', async () => {
  const bodies = [];
  const api = new Telegram('test-secret', async (_url, opts) => { bodies.push(JSON.parse(opts.body));
    return { json: async () => ({ ok: true, result: { message_id: 1 } }) }; });
  await api.send(123, 'Báo cáo'); await api.send(123, 'Xin chào Ken, tôi là FG Bot, xin báo cáo\n\nBáo cáo');
  for (const body of bodies) assert.equal((body.text.match(/Xin chào Ken/g) ?? []).length, 1);
  assert.ok(bodies.every(body => body.text.startsWith('Xin chào Ken, tôi là FG Bot, xin báo cáo')));
});
