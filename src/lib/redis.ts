import { Redis as UpstashRedis } from "@upstash/redis";

export const VOTE_LUA = `
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

export interface VoteTransaction {
  hset(key: string, data: Record<string, unknown> | string, value?: unknown): VoteTransaction;
  del(...keys: string[]): VoteTransaction;
  sadd(key: string, ...members: string[]): VoteTransaction;
  srem(key: string, ...members: string[]): VoteTransaction;
  exec(): Promise<unknown>;
}

export interface VoteRedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: unknown[]): Promise<unknown>;
  hgetall(key: string): Promise<Record<string, string>>;
  hset(key: string, data: Record<string, unknown> | string, value?: unknown): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
  hexists(key: string, field: string): Promise<number>;
  scard(key: string): Promise<number>;
  smembers(key: string): Promise<string[]>;
  sismember(key: string, member: string): Promise<number>;
  sadd(key: string, ...members: string[]): Promise<unknown>;
  srem(key: string, ...members: string[]): Promise<unknown>;
  multi(): VoteTransaction;
  vote(
    metaKey: string,
    countsKey: string,
    votersKey: string,
    choicesKey: string,
    userId: string,
    now: string,
    count: string,
    ...optionIds: string[]
  ): Promise<number>;
}

function createUpstashClient(url: string, token: string): VoteRedisClient {
  const client = new UpstashRedis({ url, token });

  return {
    async get(key: string) {
      const res = await client.get<unknown>(key);
      if (res === null || res === undefined) return null;
      return typeof res === "string" ? res : JSON.stringify(res);
    },
    async set(key: string, value: string, ...args: unknown[]) {
      if (args[0] === "EX" && typeof args[1] === "number") {
        return client.set(key, value, { ex: args[1] });
      }
      if (args[0] === "PX" && typeof args[1] === "number") {
        return client.set(key, value, { px: args[1] });
      }
      return client.set(key, value);
    },
    async hgetall(key: string) {
      const res = await client.hgetall<Record<string, unknown>>(key);
      if (!res) return {};
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(res)) {
        out[k] = v !== null && v !== undefined ? String(v) : "";
      }
      return out;
    },
    async hset(key: string, data: Record<string, unknown> | string, value?: unknown) {
      if (typeof data === "string") {
        return client.hset(key, { [data]: value });
      }
      return client.hset(key, data as Record<string, unknown>);
    },
    async del(...keys: string[]) {
      if (keys.length === 0) return 0;
      return client.del(...keys);
    },
    async hexists(key: string, field: string) {
      const res = await client.hexists(key, field);
      return res ? 1 : 0;
    },
    async scard(key: string) {
      return client.scard(key);
    },
    async smembers(key: string) {
      const res = await client.smembers(key);
      if (!Array.isArray(res)) return [];
      return res.map(String);
    },
    async sismember(key: string, member: string) {
      const res = await client.sismember(key, member);
      return res ? 1 : 0;
    },
    async sadd(key: string, ...members: string[]) {
      if (members.length === 0) return 0;
      return client.sadd(key, members[0], ...members.slice(1));
    },
    async srem(key: string, ...members: string[]) {
      if (members.length === 0) return 0;
      return client.srem(key, members[0], ...members.slice(1));
    },
    multi() {
      const p = client.pipeline();
      const tx: VoteTransaction = {
        hset(key, data, val) {
          if (typeof data === "string") {
            p.hset(key, { [data]: val });
          } else {
            p.hset(key, data as Record<string, unknown>);
          }
          return tx;
        },
        del(...keys) {
          if (keys.length > 0) p.del(...keys);
          return tx;
        },
        sadd(key, ...members) {
          if (members.length > 0) p.sadd(key, members[0], ...members.slice(1));
          return tx;
        },
        srem(key, ...members) {
          if (members.length > 0) p.srem(key, members[0], ...members.slice(1));
          return tx;
        },
        async exec() {
          return p.exec();
        },
      };
      return tx;
    },
    async vote(
      metaKey: string,
      countsKey: string,
      votersKey: string,
      choicesKey: string,
      userId: string,
      now: string,
      count: string,
      ...optionIds: string[]
    ) {
      const keys = [metaKey, countsKey, votersKey, choicesKey];
      const args = [userId, now, count, ...optionIds];
      const res = await (client as any).eval(VOTE_LUA, keys, args);
      return Number(res);
    },
  };
}

function createIoredisClient(url: string): VoteRedisClient {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const IORedis = require("ioredis");
  const r = new IORedis(url, { maxRetriesPerRequest: 3, lazyConnect: true });
  r.on("error", (err: unknown) => {
    // 捕获静默处理连接失败，防止 unhandled error 事件打断流程
    if (process.env.NODE_ENV !== "production") {
      console.warn("[ioredis] connection warning:", (err as Error)?.message || err);
    }
  });

  return {
    async get(key: string) {
      return r.get(key);
    },
    async set(key: string, value: string, ...args: unknown[]) {
      return (r as any).set(key, value, ...args);
    },
    async hgetall(key: string) {
      const res = await r.hgetall(key);
      return res ?? {};
    },
    async hset(key: string, data: Record<string, unknown> | string, value?: unknown) {
      if (typeof data === "string") {
        return r.hset(key, data, value as any);
      }
      return r.hset(key, data as any);
    },
    async del(...keys: string[]) {
      if (keys.length === 0) return 0;
      return r.del(...keys);
    },
    async hexists(key: string, field: string) {
      return r.hexists(key, field);
    },
    async scard(key: string) {
      return r.scard(key);
    },
    async smembers(key: string) {
      return r.smembers(key);
    },
    async sismember(key: string, member: string) {
      return r.sismember(key, member);
    },
    async sadd(key: string, ...members: string[]) {
      if (members.length === 0) return 0;
      return r.sadd(key, ...members);
    },
    async srem(key: string, ...members: string[]) {
      if (members.length === 0) return 0;
      return r.srem(key, ...members);
    },
    multi() {
      const txRaw = r.multi();
      const tx: VoteTransaction = {
        hset(key, data, val) {
          if (typeof data === "string") {
            txRaw.hset(key, data, val as any);
          } else {
            txRaw.hset(key, data as any);
          }
          return tx;
        },
        del(...keys) {
          if (keys.length > 0) txRaw.del(...keys);
          return tx;
        },
        sadd(key, ...members) {
          if (members.length > 0) txRaw.sadd(key, ...members);
          return tx;
        },
        srem(key, ...members) {
          if (members.length > 0) txRaw.srem(key, ...members);
          return tx;
        },
        async exec() {
          return txRaw.exec();
        },
      };
      return tx;
    },
    async vote(
      metaKey: string,
      countsKey: string,
      votersKey: string,
      choicesKey: string,
      userId: string,
      now: string,
      count: string,
      ...optionIds: string[]
    ) {
      const keys = [metaKey, countsKey, votersKey, choicesKey];
      const args = [userId, now, count, ...optionIds];
      const res = await (r as any).eval(VOTE_LUA, keys.length, ...keys, ...args);
      return Number(res);
    },
  };
}

const g = globalThis as unknown as { __voteRedis?: VoteRedisClient };

function create(): VoteRedisClient {
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (upstashUrl && upstashToken) {
    return createUpstashClient(upstashUrl, upstashToken);
  }
  else {
    const url = process.env.REDIS_URL || "redis://localhost:6379";
    return createIoredisClient(url);
  }
}

export const redis: VoteRedisClient = (g.__voteRedis ??= create());
