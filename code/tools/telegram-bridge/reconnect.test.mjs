import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverPipe } from './reconnect.mjs';
test('discovery only selects pipe exposing caller and selected FG session', async () => {
  const tried = [];
  const request = async (pipe, method) => {
    tried.push(pipe);
    if (method === 'tools/list') return { tools: [{ name: 'list_threads', namespace: 'codex_app' }] };
    const ids = pipe.endsWith('good') ? ['caller', 'build'] : ['other'];
    return { success: true, contentItems: [{ type: 'inputText', text: JSON.stringify({ threads: ids.map(id => ({
      id, title: id, kind: 'codex', hostId: 'local', cwd: 'E:/FGweb' })) }) }] };
  };
  const result = await discoverPipe('caller', 'build', request, async () => ['unrelated', 'codex-browser-use-wrong', 'codex-browser-use-good']);
  assert.ok(result.endsWith('good')); assert.ok(tried.every(name => name.includes('codex-browser-use-')));
});
test('wrong account/workspace never bypasses target access', async () => {
  const request = async (_pipe, method) => method === 'tools/list'
    ? { tools: [{ name: 'list_threads', namespace: 'codex_app' }] }
    : { success: true, contentItems: [{ type: 'inputText', text: JSON.stringify({ threads: [{ id: 'build',
      kind: 'codex', hostId: 'local', cwd: 'E:/Other' }] }) }] };
  await assert.rejects(discoverPipe('caller', 'build', request, async () => ['codex-browser-use-wrong']), /unavailable/);
});
