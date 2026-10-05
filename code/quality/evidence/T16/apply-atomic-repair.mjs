import fs from 'node:fs';
const file='apps/api/src/modules/presence/presence.service.ts';
let source=fs.readFileSync(file,'utf8');
source=source.replace("import { createHash } from 'node:crypto';","import { createHash } from 'node:crypto';\nimport { LEASE_SCRIPT } from './lease-script.js';");
const start=source.indexOf('  async addOrRenewLease('),end=source.indexOf('  async isUserOnlineInConv(',start);
if(start<0||end<0)throw new Error('Expected draft region missing');
const methods=`
  private async transition(convId: string, userId: string, socketId: string, mode: 'renew' | 'remove' | 'expire') {
    // Resolve SQL metadata before entering the atomic Redis transition.
    const gameId = await this.getGameIdForLobby(convId);
    const redis = await this.getRedis();
    const now = this.nowMs;
    const prefix = 'fg:presence:' + this.ns + ':';
    const result = await redis.eval(LEASE_SCRIPT, 5,
      prefix + 'leases:' + convId + ':' + userId,
      prefix + 'active:' + convId,
      prefix + 'active_convs',
      prefix + 'user_convs:' + userId,
      prefix + 'game_active:' + (gameId ?? 'private-unused'),
      now, mode, userId, convId, socketId, now + PRESENCE_TTL_MS, gameId ? '1' : '0'
    ) as number[];
    return { isOnline: result[0] === 1, stateChanged: result[1] === 1 };
  }

  async addOrRenewLease(convId: string, userId: string, socketId: string) {
    return this.transition(convId, userId, socketId, 'renew');
  }

  async removeLease(convId: string, userId: string, socketId: string) {
    return this.transition(convId, userId, socketId, 'remove');
  }

  async sweepExpiredLeases(): Promise<void> {
    if (!this.redis) return;
    const redis = await this.getRedis();
    const now = this.nowMs;
    const prefix = 'fg:presence:' + this.ns + ':';
    const convIds = await redis.smembers(prefix + 'active_convs');
    for (const convId of convIds) {
      const users = await redis.zrangebyscore(prefix + 'active:' + convId, '-inf', now);
      for (const userId of users) {
        const result = await this.transition(convId, userId, '', 'expire');
        if (result.stateChanged && this.pubsubCallback) {
          await this.pubsubCallback({ conversationId: convId, userId, isOnline: result.isOnline });
        }
      }
    }
  }

`;
source=source.slice(0,start)+methods+source.slice(end);
fs.writeFileSync(file,source);
console.log('Replaced interleaved lease writes with one real Redis Lua transition.');
