import fs from 'node:fs';
const file='apps/api/src/modules/presence/presence.gateway.ts';let code=fs.readFileSync(file,'utf8');
code=code.replace('  private readonly subscriptions =','  private readonly operations = new Map<string, Promise<void>>();\n  private readonly subscriptions =');
for(const name of ['subscribe','unsubscribe','heartbeat']) {
 const start=code.indexOf('  async '+name+'('),body=code.indexOf('    try {',start);
 if(start<0||body<0)throw new Error('Missing event handler');
 code=code.slice(0,body)+`    return this.serialize(socket, () => this.${name}Now(socket, body)).catch(error => this.denied(error));
  }

  private async ${name}Now(socket: Socket, body: unknown): Promise<SocketPresenceAck> {
`+code.slice(body);
}
const before=code.indexOf('  private async releaseSubscription(');
code=code.slice(0,before)+`  private serialize<T>(socket: Socket, operation: () => Promise<T>, cleanup = false): Promise<T> {
    const previous = this.operations.get(socket.id) ?? Promise.resolve();
    const result = previous.then(() => {
      if (!cleanup && (this.closing || !socket.connected)) throw new Error('Socket closed');
      return operation();
    });
    const settled = result.then(() => undefined, () => undefined);
    this.operations.set(socket.id, settled);
    void settled.then(() => { if (this.operations.get(socket.id) === settled) this.operations.delete(socket.id); });
    return result;
  }

`+code.slice(before);
code=code.replace('      await this.releaseSocket(socket);\n    } catch {','      await this.serialize(socket, () => this.releaseSocket(socket), true);\n    } catch {');
code=code.replace('    this.closing = true;\n    await Promise.all','    this.closing = true;\n    await Promise.all([...this.operations.values()]);\n    await Promise.all');
fs.writeFileSync(file,code);
console.log('Serialized same-socket subscribe/heartbeat/unsubscribe/disconnect operations.');
