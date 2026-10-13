import { readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fgSessions, commandSessions } from './core.mjs';
export async function discoverPipe(caller, target, request, inventory = () => readdir('\\\\.\\pipe\\')) {
  const names = (await inventory()).filter(name => /^codex-browser-use-[A-Za-z0-9-]+$/.test(name)).slice(0, 32);
  for (const name of names) {
    const pipe = `\\\\.\\pipe\\${name}`;
    try {
      const catalog = await request(pipe, 'tools/list', { threadStartKind: 'all' }, 1500);
      const tool = catalog.tools?.find(item => item.name === 'list_threads' || item.name.endsWith('__list_threads'));
      if (!tool) continue;
      const result = await request(pipe, 'tools/call', { namespace: tool.namespace, tool: tool.name,
        arguments: { limit: 50 }, callerSource: 'codex', threadId: caller,
        callId: `telegram-discovery-${randomUUID()}`, turnId: `telegram-discovery-${randomUUID()}` }, 2500);
      if (!result?.success) continue;
      const text = result.contentItems?.filter(item => item.type === 'inputText').map(item => item.text).join('\n');
      const inventory = JSON.parse(text);
      if (fgSessions(inventory).some(item => item.id === caller)
        && commandSessions(inventory).some(item => item.id === target)) return pipe;
    } catch { /* Only read-only discovery; never replay a mutation. */ }
  }
  throw new Error('Authorized Desktop connection unavailable');
}
