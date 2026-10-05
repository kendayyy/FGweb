import fs from 'node:fs';
const file='apps/api/src/modules/presence/presence.service.ts';
let source=fs.readFileSync(file,'utf8');
source=source.replace("  get ns(): string {\n    const url = process.env.DATABASE_URL ?? '';\n    return createHash('sha256').update(url).digest('hex').slice(0, 16);\n  }","  get ns(): string { return this.namespace; }\n\n  private namespace = '';\n\n  private component(id: string): string { return Buffer.from(id).toString('base64url'); }");
source=source.replace("  onModuleInit() {","  onModuleInit() {\n    const database = new URL(process.env.DATABASE_URL!);\n    this.namespace = createHash('sha256').update(JSON.stringify([database.host, database.pathname, database.searchParams.get('options') ?? ''])).digest('hex').slice(0, 16);");
source=source.replace("prefix + 'leases:' + convId + ':' + userId","prefix + 'leases:' + this.component(convId) + ':' + this.component(userId)")
 .replaceAll("prefix + 'active:' + convId","prefix + 'active:' + this.component(convId)")
 .replaceAll("prefix + 'user_convs:' + userId","prefix + 'user_convs:' + this.component(userId)")
 .replace("prefix + 'game_active:' + (gameId ?? 'private-unused')","prefix + 'game_active:' + this.component(gameId ?? 'private-unused')")
 .replace('active:${convId}', 'active:${this.component(convId)}')
 .replace('user_convs:${userId}', 'user_convs:${this.component(userId)}')
 .replaceAll('game_active:${gameId}', 'game_active:${this.component(gameId)}');
const anyStart=source.indexOf('  async isUserOnlineAnywhere('),anyEnd=source.indexOf('  async getUserActiveConversations(',anyStart);
source=source.slice(0,anyStart)+`  async isUserOnlineAnywhere(userId: string): Promise<boolean> {
    const conversations = await this.getUserActiveConversations(userId);
    for (const conversationId of conversations) {
      if (await this.isUserOnlineInConv(conversationId, userId)) return true;
    }
    return false;
  }

`+source.slice(anyEnd);
const keysStart=source.indexOf('    const redis = await this.getRedis();',source.indexOf('  async getOnlineUsersAll('));
const keysEnd=source.indexOf('    const onlineUserIds = Array.from(allUserIdsSet);',keysStart);
source=source.slice(0,keysStart)+`    const approvedGames = (await this.pool.query<{ id: string }>('SELECT id FROM games WHERE title=ANY($1::text[])', [[...ALLOWED_GAMES]])).rows;
    const allUserIdsSet = new Set<string>();
    for (const game of approvedGames) {
      for (const id of await this.getOnlineUserIdsForGame(game.id)) allUserIdsSet.add(id);
    }

`+source.slice(keysEnd);
fs.writeFileSync(file,source);
const test='apps/api/test/presence.integration.spec.ts';let tests=fs.readFileSync(test,'utf8');
tests=tests.replace("import { createHash, randomUUID }", "import { randomUUID }")
 .replace("    testNs = createHash('sha256').update(url.href).digest('hex').slice(0, 16);","")
 .replace("    presenceService = app.get(PresenceService);","    presenceService = app.get(PresenceService);\n    testNs = presenceService.ns;");
fs.writeFileSync(test,tests);
const gateway='apps/api/src/modules/presence/presence.gateway.ts';let code=fs.readFileSync(gateway,'utf8');
const oldStart=code.indexOf('  private async legacyDisconnectUnused('),oldEnd=code.indexOf('  async broadcastStatusChange(',oldStart);
code=code.slice(0,oldStart)+code.slice(oldEnd);
code=code.replace("      const customStatus = await this.presenceService.getCustomStatus(event.userId).catch(() => 'JUST_CHATTING' as CustomStatus);","      const customStatus = await this.presenceService.getCustomStatus(event.userId);");
code=code.replace("    if (this.publisher) {\n      await this.publisher.publish(this.channel, JSON.stringify(event));\n    } else {\n      await this.deliverPubsub(JSON.stringify(event));\n    }","    if (this.closing) return;\n    await this.openBus();\n    await this.publisher!.publish(this.channel, JSON.stringify({ conversationId: event.conversationId, userId: event.userId }));");
code=code.replace("    const roomName = `presence:${payload.conversationId}`;","    if (typeof payload.conversationId !== 'string' || typeof payload.userId !== 'string') return;\n    const customStatus = await this.presenceService.getCustomStatus(payload.userId);\n    const isOnline = await this.presenceService.isUserOnlineInConv(payload.conversationId, payload.userId);\n    const roomName = `presence:${payload.conversationId}`;");
code=code.replace("customStatus: payload.customStatus,\n          isOnline: payload.isOnline,","customStatus,\n          isOnline,");
fs.writeFileSync(gateway,code);
console.log('Isolated opaque key components and rehydrated current state; public catalog has bounded lookup.');
