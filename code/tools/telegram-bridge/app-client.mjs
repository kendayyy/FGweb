import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { fgSessions, commandSessions } from './core.mjs';
import { discoverPipe } from './reconnect.mjs';

// Framing and caller metadata match the installed bundled codex-app-tools server.
export function pipeRequest(path, method, params, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(path);
    let buffer = Buffer.alloc(0), settled = false;
    const finish = (error, result) => {
      if (settled) return; settled = true; clearTimeout(timer); socket.destroy();
      if (error) reject(error); else resolve(result);
    };
    const timer = setTimeout(() => finish(new Error('App tools timeout')), timeoutMs);
    socket.on('error', () => finish(new Error('App tools unavailable')));
    socket.on('end', () => finish(new Error('App tools disconnected')));
    socket.on('connect', () => {
      const payload = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }));
      if (payload.length > 8 * 1024 * 1024) { finish(new Error('Request too large')); return; }
      const frame = Buffer.alloc(4 + payload.length); frame.writeUInt32LE(payload.length); payload.copy(frame, 4); socket.write(frame);
    });
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length < 4) return;
      const length = buffer.readUInt32LE();
      if (length > 8 * 1024 * 1024) { finish(new Error('Response too large')); return; }
      if (buffer.length < length + 4) return;
      try {
        const response = JSON.parse(buffer.subarray(4, length + 4).toString());
        if (response.jsonrpc !== '2.0' || Number(response.id) !== 1) throw new Error('Invalid frame');
        if (response.error) finish(new Error('App tools rejected request'));
        else finish(null, response.result);
      } catch { finish(new Error('Invalid app tools response')); }
    });
  });
}
export class AppClient {
  constructor(pipe, thread, commandTarget = thread, request = pipeRequest) {
    this.pipe = pipe; this.thread = thread; this.commandTarget = commandTarget; this.request = request;
    this.readTargets = new Set([thread]);
  }
  async call(name, args) {
    if (!['list_threads', 'read_thread', 'send_message_to_thread', 'get_usage_limits'].includes(name)) throw new Error('Tool not allowed');
    if (name === 'read_thread' && !this.readTargets.has(args.threadId)) throw new Error('Wrong target');
    if (name === 'send_message_to_thread' && (args.threadId !== this.commandTarget
      || !this.readTargets.has(args.threadId))) throw new Error('Wrong target');
    try { return await this.invoke(name, args); }
    catch (error) {
      if (!this.autoReconnect || name === 'send_message_to_thread') throw error;
      this.pipe = await discoverPipe(this.thread, this.commandTarget, this.request);
      this.catalog = null;
      await this.onReconnect?.(this.pipe);
      return this.invoke(name, args);
    }
  }
  async invoke(name, args) {
    this.catalog ??= (await this.request(this.pipe, 'tools/list', { threadStartKind: 'all' })).tools;
    const tool = this.catalog.find((item) => item.name === name || item.name.endsWith(`__${name}`));
    if (!tool) throw new Error('App tool missing');
    const result = await this.request(this.pipe, 'tools/call', {
      namespace: tool.namespace, tool: tool.name, arguments: args, callerSource: 'codex',
      threadId: this.thread, callId: `telegram-${randomUUID()}`, turnId: `telegram-${randomUUID()}`
    });
    if (!result?.success) throw new Error('App tool failed');
    const value = result.contentItems?.filter((item) => item.type === 'inputText').map((item) => item.text).join('\n');
    try { return JSON.parse(value); } catch { return value; }
  }
  async list() {
    const inventory = await this.call('list_threads', { limit: 50 });
    const sessions = fgSessions(inventory);
    this.readTargets = new Set([this.thread, ...commandSessions(inventory).map((item) => item.id)]);
    return sessions;
  }
  async targets() {
    const sessions = commandSessions(await this.call('list_threads', { limit: 50 }));
    this.readTargets = new Set([this.thread, ...sessions.map(s => s.id)]);
    return sessions;
  }
  select(target) {
    if (!this.readTargets.has(target)) throw new Error('Wrong target');
    this.commandTarget = target;
  }
  read(target = this.thread) { return this.call('read_thread', { threadId: target, turnLimit: 1, includeOutputs: false }); }
  send(target, prompt) { return this.call('send_message_to_thread', { threadId: target, prompt }); }
  usage() { return this.call('get_usage_limits', {}); }
}
