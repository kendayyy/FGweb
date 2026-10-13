"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEASE_SCRIPT = void 0;
exports.LEASE_SCRIPT = `
local now = tonumber(ARGV[1])
local mode = ARGV[2]
local user = ARGV[3]
local conv = ARGV[4]
local socket = ARGV[5]
local previous = redis.call('ZSCORE', KEYS[2], user)
local expired = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', now)
for _, id in ipairs(expired) do redis.call('HDEL', KEYS[6], id) end
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
if mode == 'renew' then
  redis.call('ZADD', KEYS[1], tonumber(ARGV[6]), socket)
  redis.call('EXPIRE', KEYS[1], 60)
  if ARGV[8] ~= '' then
    redis.call('HSET', KEYS[6], socket, ARGV[8])
    redis.call('EXPIRE', KEYS[6], 60)
  end
elseif mode == 'remove' then
  redis.call('ZREM', KEYS[1], socket)
  redis.call('HDEL', KEYS[6], socket)
end
local highest = redis.call('ZREVRANGE', KEYS[1], 0, 0, 'WITHSCORES')
if #highest > 0 then
  redis.call('ZADD', KEYS[2], highest[2], user)
  redis.call('SADD', KEYS[3], conv)
  redis.call('SADD', KEYS[4], conv)
  if ARGV[7] == '1' then redis.call('ZADD', KEYS[5], highest[2], user) end
  local changed = 0
  if not previous or tonumber(previous) <= now then changed = 1 end
  return {1, changed}
end
redis.call('DEL', KEYS[1])
redis.call('DEL', KEYS[6])
redis.call('ZREM', KEYS[2], user)
redis.call('SREM', KEYS[4], conv)
if ARGV[7] == '1' then redis.call('ZREM', KEYS[5], user) end
if redis.call('ZCARD', KEYS[2]) == 0 then redis.call('SREM', KEYS[3], conv) end
if previous then return {0, 1} end
return {0, 0}
`;
//# sourceMappingURL=lease-script.js.map