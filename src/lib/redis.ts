import Redis from "ioredis";

const VOTE_LUA = `
local status = redis.call('HGET', KEYS[1], 'status')
if not status then return -1 end
local expire = tonumber(redis.call('HGET', KEYS[1], 'expire_at') or '0')
if status == 'ended' then return -2 end
if expire > 0 and tonumber(ARGV[2]) > expire then return -3 end
if redis.call('SISMEMBER', KEYS[3], ARGV[1]) == 1 then return -4 end
local n = tonumber(ARGV[3])
local minc = tonumber(redis.call('HGET', KEYS[1], 'min_choices') or '1')
local maxc = tonumber(redis.call('HGET', KEYS[1], 'max_choices') or '1')
if n < minc or n > maxc then return -6 end
for i = 4, 3 + n do
  if redis.call('HEXISTS', KEYS[2], ARGV[i]) == 0 then return -5 end
end
redis.call('SADD', KEYS[3], ARGV[1])
for i = 4, 3 + n do
  redis.call('HINCRBY', KEYS[2], ARGV[i], 1)
  redis.call('SADD', KEYS[4], ARGV[i])
end
return 1
`;

const g = globalThis as unknown as { __voteRedis?: Redis };

function create(): Redis {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  const r = new Redis(url, { maxRetriesPerRequest: 3 });
  r.defineCommand("vote", { numberOfKeys: 4, lua: VOTE_LUA });
  return r;
}

export const redis: Redis = (g.__voteRedis ??= create());
