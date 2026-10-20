import { randomUUID } from "node:crypto";
import type Redis from "ioredis";
import { redis as redisClient } from "./redis";
import { getBus } from "./bus";
import { appendAudit } from "./audit";
import {
  POLL_INDEX_KEY,
  pollChoicesKey,
  pollCountsKey,
  pollMetaKey,
  pollVotersKey,
  pollVotersMetaKey,
} from "./keys";
import type {
  AllowedAuthType,
  PollMeta,
  PollOption,
  PollStatus,
  Snapshot,
  VoteErrorReason,
  VoteErrorCode,
} from "./types";

const OPTION_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#06b6d4",
  "#84cc16",
];

export function getEffectiveStatus(meta: PollMeta, now = Date.now()): PollStatus {
  if (meta.status === "ended") return "ended";
  if (meta.expire_at > 0 && now > meta.expire_at) return "ended";
  return "active";
}

function parseMeta(pollId: string, raw: Record<string, string>): PollMeta | null {
  if (!raw.title) return null;
  let options: PollOption[] = [];
  try {
    options = JSON.parse(raw.options ?? "[]");
  } catch {
    options = [];
  }
  return {
    poll_id: pollId,
    title: raw.title,
    desc: raw.desc ?? "",
    options,
    max_choices: parseInt(raw.max_choices ?? "1", 10),
    min_choices: parseInt(raw.min_choices ?? "1", 10),
    expire_at: parseInt(raw.expire_at ?? "0", 10),
    status: (raw.status as PollStatus) ?? "active",
    hidden: raw.hidden === "1",
    allowed_auth: (raw.allowed_auth as AllowedAuthType) || "any",
    bg_image: raw.bg_image || undefined,
    created_at: parseInt(raw.created_at ?? "0", 10),
  };
}

export async function createPoll(input: {
  title: string;
  desc?: string;
  options: { label: string; image?: string }[];
  max_choices: number;
  min_choices: number;
  /** ISO 字符串或 ms epoch，0/undefined = 无截止 */
  expire_at?: number;
  bg_image?: string;
  allowed_auth?: AllowedAuthType;
}): Promise<PollMeta> {
  const pollId = randomUUID().replace(/-/g, "").slice(0, 12);
  const options: PollOption[] = input.options.map(({ label, image }, i) => ({
    id: `opt_${i + 1}`,
    label,
    color: OPTION_COLORS[i % OPTION_COLORS.length],
    ...(image ? { image } : {}),
  }));
  const expireAt = input.expire_at ?? 0;
  const now = Date.now();

  const meta: PollMeta = {
    poll_id: pollId,
    title: input.title,
    desc: input.desc ?? "",
    options,
    max_choices: input.max_choices,
    min_choices: input.min_choices,
    expire_at: expireAt,
    status: "active",
    hidden: false,
    allowed_auth: input.allowed_auth || "any",
    bg_image: input.bg_image,
    created_at: now,
  };

  const key = pollMetaKey(pollId);
  const tx = redisClient.multi();
  tx.hset(key, {
    title: meta.title,
    desc: meta.desc,
    options: JSON.stringify(options),
    max_choices: String(meta.max_choices),
    min_choices: String(meta.min_choices),
    expire_at: String(meta.expire_at),
    status: "active",
    hidden: "0",
    allowed_auth: meta.allowed_auth || "any",
    created_at: String(now),
  });
  if (input.bg_image) {
    tx.hset(key, "bg_image", input.bg_image);
  }
  for (const opt of options) {
    tx.hset(pollCountsKey(pollId), opt.id, 0);
  }
  tx.sadd(POLL_INDEX_KEY, pollId);
  await tx.exec();

  await appendAudit({ type: "create", poll_id: pollId, ts: now });
  return meta;
}

export interface PollListItem extends PollMeta {
  voters: number;
}

export async function listPolls(): Promise<PollListItem[]> {
  const ids = await redisClient.smembers(POLL_INDEX_KEY);
  if (ids.length === 0) return [];
  const metas = await Promise.all(
    ids.map(async (id) => {
      const [raw, voters] = await Promise.all([
        redisClient.hgetall(pollMetaKey(id)),
        redisClient.scard(pollVotersKey(id)),
      ]);
      const meta = parseMeta(id, raw);
      if (!meta) return null;
      return { ...meta, voters };
    })
  );
  return metas
    .filter((m): m is PollListItem => m !== null)
    .sort((a, b) => b.created_at - a.created_at);
}

export async function updatePoll(
  pollId: string,
  input: {
    title: string;
    desc?: string;
    options: { label: string; image?: string }[];
    max_choices: number;
    min_choices: number;
    expire_at?: number;
    bg_image?: string;
    allowed_auth?: AllowedAuthType;
  }
): Promise<
  | { ok: true; poll: PollMeta }
  | { ok: false; code: "NOT_FOUND" | "HAS_VOTES" | "INVALID_INPUT"; error: string }
> {
  const meta = await getPollMeta(pollId);
  if (!meta) {
    return { ok: false, code: "NOT_FOUND", error: "投票不存在" };
  }

  // 严格校验：只能对未有投票数据的开放编辑
  const voterCount = await redisClient.scard(pollVotersKey(pollId));
  if (voterCount > 0) {
    return {
      ok: false,
      code: "HAS_VOTES",
      error: `该投票已产生 ${voterCount} 条投票数据，不允许编辑。如需修改，请先一键清空重投。`,
    };
  }

  const options: PollOption[] = input.options.map(({ label, image }, i) => ({
    id: `opt_${i + 1}`,
    label,
    color: OPTION_COLORS[i % OPTION_COLORS.length],
    ...(image ? { image } : {}),
  }));

  const expireAt = input.expire_at ?? 0;
  const key = pollMetaKey(pollId);
  const tx = redisClient.multi();

  // 重置选项计数为 0
  tx.del(pollCountsKey(pollId));
  for (const opt of options) {
    tx.hset(pollCountsKey(pollId), opt.id, 0);
  }

  tx.hset(key, {
    title: input.title,
    desc: input.desc ?? "",
    options: JSON.stringify(options),
    max_choices: String(input.max_choices),
    min_choices: String(input.min_choices),
    expire_at: String(expireAt),
    bg_image: input.bg_image || "",
    ...(input.allowed_auth ? { allowed_auth: input.allowed_auth } : {}),
  });

  await tx.exec();

  await appendAudit({ type: "edit", poll_id: pollId, ts: Date.now() });
  await notify(pollId);

  const updated = await getPollMeta(pollId);
  return { ok: true, poll: updated! };
}

export async function getPollMeta(pollId: string): Promise<PollMeta | null> {
  const raw = await redisClient.hgetall(pollMetaKey(pollId));
  return parseMeta(pollId, raw);
}

export async function getSnapshot(
  redisOrPollId: string,
  client?: Redis
): Promise<Snapshot | null> {
  const r = client ?? redisClient;
  const meta = await getPollMeta(redisOrPollId);
  if (!meta) return null;
  return buildSnapshot(meta, r);
}

async function buildSnapshot(meta: PollMeta, r: Redis): Promise<Snapshot> {
  const [countsRaw, voters] = await Promise.all([
    r.hgetall(pollCountsKey(meta.poll_id)),
    r.scard(pollVotersKey(meta.poll_id)),
  ]);
  const counts: Record<string, number> = {};
  let total = 0;
  for (const opt of meta.options) {
    const c = parseInt(countsRaw[opt.id] ?? "0", 10);
    counts[opt.id] = c;
    total += c;
  }
  return {
    poll_id: meta.poll_id,
    counts,
    total,
    voters,
    status: getEffectiveStatus(meta),
    hidden: meta.hidden,
    expire_at: meta.expire_at,
    server_ts: Date.now(),
  };
}

async function notify(pollId: string) {
  const meta = await getPollMeta(pollId);
  if (!meta) return;
  const snapshot = await buildSnapshot(meta, redisClient);
  getBus().emit("votes-changed", pollId, snapshot);
}

async function pollExists(pollId: string): Promise<boolean> {
  return (await redisClient.hexists(pollMetaKey(pollId), "title")) === 1;
}

const ERROR_CODE_MAP: Record<number, VoteErrorCode> = {
  [-1]: "NOT_FOUND",
  [-2]: "ENDED",
  [-3]: "EXPIRED",
  [-4]: "ALREADY_VOTED",
  [-5]: "INVALID_OPTION",
  [-6]: "CHOICES_OUT_OF_RANGE",
};

type VoteCommand = (
  metaKey: string,
  countsKey: string,
  votersKey: string,
  choicesKey: string,
  now: string,
  count: string,
  ...optionIds: string[]
) => Promise<number>;

/** defineCommand 注册的 Lua 投票命令（见 lib/redis.ts） */
const voteCommand = (redisClient as unknown as { vote: VoteCommand }).vote.bind(
  redisClient
);

export async function castVote(
  pollId: string,
  userId: string,
  optionIds: string[],
  nickname?: string
): Promise<
  | { ok: true; myChoices: string[] }
  | { ok: false; code: VoteErrorCode; reason?: VoteErrorReason }
> {
  if (optionIds.length === 0) {
    return { ok: false, code: "CHOICES_OUT_OF_RANGE", reason: "MISSING_FIELDS" };
  }
  const unique = [...new Set(optionIds)];
  if (unique.length !== optionIds.length) {
    return { ok: false, code: "CHOICES_OUT_OF_RANGE", reason: "DUPLICATE_OPTIONS" };
  }

  const now = Date.now();
  const result = await voteCommand(
    pollMetaKey(pollId),
    pollCountsKey(pollId),
    pollVotersKey(pollId),
    pollChoicesKey(pollId, userId),
    userId,
    String(now),
    String(unique.length),
    ...unique
  );

  if (result !== 1) {
    const code = ERROR_CODE_MAP[result] ?? "NOT_FOUND";
    return { ok: false, code };
  }

  // 记录投票人信息（姓名、时间、所选选项）到 Redis 供后台导出与查看
  await redisClient.hset(
    pollVotersMetaKey(pollId),
    userId,
    JSON.stringify({
      nickname: nickname || "",
      ts: now,
      option_ids: unique,
    })
  );

  await appendAudit({
    type: "vote",
    poll_id: pollId,
    ts: now,
    user_id: userId,
    nickname: nickname || "",
    option_ids: unique,
  });

  await notify(pollId);
  return { ok: true, myChoices: unique };
}

export async function endPoll(pollId: string): Promise<boolean> {
  if (!(await pollExists(pollId))) return false;
  await redisClient.hset(pollMetaKey(pollId), "status", "ended");
  await appendAudit({ type: "end", poll_id: pollId, ts: Date.now() });
  await notify(pollId);
  return true;
}

export async function setVisibility(
  pollId: string,
  hidden: boolean
): Promise<boolean> {
  if (!(await pollExists(pollId))) return false;
  await redisClient.hset(pollMetaKey(pollId), "hidden", hidden ? "1" : "0");
  await notify(pollId);
  return true;
}

export async function setAllowedAuth(
  pollId: string,
  allowedAuth: AllowedAuthType
): Promise<boolean> {
  if (!(await pollExists(pollId))) return false;
  await redisClient.hset(pollMetaKey(pollId), "allowed_auth", allowedAuth);
  await appendAudit({
    type: "edit",
    poll_id: pollId,
    ts: Date.now(),
  });
  await notify(pollId);
  return true;
}

export async function resetPoll(
  pollId: string,
  newExpireAt?: number
): Promise<boolean> {
  const meta = await getPollMeta(pollId);
  if (!meta) return false;

  const voterIds = await redisClient.smembers(pollVotersKey(pollId));
  const tx = redisClient.multi();
  tx.del(
    pollCountsKey(pollId),
    pollVotersKey(pollId),
    pollVotersMetaKey(pollId)
  );
  for (const uid of voterIds) {
    tx.del(pollChoicesKey(pollId, uid));
  }
  for (const opt of meta.options) {
    tx.hset(pollCountsKey(pollId), opt.id, 0);
  }
  const expireAt =
    newExpireAt !== undefined ? newExpireAt : meta.expire_at > Date.now() ? meta.expire_at : 0;
  tx.hset(pollMetaKey(pollId), {
    status: "active",
    hidden: "0",
    expire_at: String(expireAt),
  });
  await tx.exec();

  await appendAudit({ type: "reset", poll_id: pollId, ts: Date.now() });
  notify(pollId);
  return true;
}

export async function deletePoll(pollId: string): Promise<boolean> {
  const meta = await getPollMeta(pollId);
  if (!meta) return false;

  const voterIds = await redisClient.smembers(pollVotersKey(pollId));
  const tx = redisClient.multi();
  tx.srem(POLL_INDEX_KEY, pollId);
  tx.del(pollMetaKey(pollId));
  tx.del(pollCountsKey(pollId));
  tx.del(pollVotersKey(pollId));
  tx.del(pollVotersMetaKey(pollId));
  for (const uid of voterIds) {
    tx.del(pollChoicesKey(pollId, uid));
  }
  await tx.exec();

  await appendAudit({ type: "delete", poll_id: pollId, ts: Date.now() });
  return true;
}

export async function getVoteState(
  pollId: string,
  userId: string | null
): Promise<{
  poll: PollMeta;
  status: PollStatus;
  voted: boolean;
  myChoices: string[];
  server_ts: number;
} | null> {
  const meta = await getPollMeta(pollId);
  if (!meta) return null;
  const status = getEffectiveStatus(meta);
  let voted = false;
  let myChoices: string[] = [];
  if (userId) {
    voted = (await redisClient.sismember(pollVotersKey(pollId), userId)) === 1;
    if (voted) {
      myChoices = await redisClient.smembers(pollChoicesKey(pollId, userId));
    }
  }
  return { poll: meta, status, voted, myChoices, server_ts: Date.now() };
}

export interface PollVoterRecord {
  poll_id: string;
  poll_title: string;
  user_id: string;
  nickname: string;
  option_ids: string[];
  option_labels: string[];
  voted_at: number;
}

/**
 * 获取指定投票的所有投票人员明细
 */
export async function getPollVoters(pollId: string): Promise<{
  poll: PollMeta;
  voters: PollVoterRecord[];
} | null> {
  const meta = await getPollMeta(pollId);
  if (!meta) return null;

  const optionMap = new Map<string, string>();
  for (const opt of meta.options) {
    optionMap.set(opt.id, opt.label);
  }

  const [voterIds, votersMetaRaw] = await Promise.all([
    redisClient.smembers(pollVotersKey(pollId)),
    redisClient.hgetall(pollVotersMetaKey(pollId)),
  ]);

  const voters: PollVoterRecord[] = [];

  for (const uid of voterIds) {
    let nickname = "";
    let ts = meta.created_at;
    let optionIds: string[] = [];

    const rawMeta = votersMetaRaw[uid];
    if (rawMeta) {
      try {
        const parsed = JSON.parse(rawMeta);
        nickname = parsed.nickname || "";
        ts = Number(parsed.ts) || ts;
        if (Array.isArray(parsed.option_ids)) {
          optionIds = parsed.option_ids.map(String);
        }
      } catch {}
    }

    if (optionIds.length === 0) {
      optionIds = await redisClient.smembers(pollChoicesKey(pollId, uid));
    }

    const optionLabels = optionIds.map((oid) => optionMap.get(oid) || oid);

    voters.push({
      poll_id: pollId,
      poll_title: meta.title,
      user_id: uid,
      nickname,
      option_ids: optionIds,
      option_labels: optionLabels,
      voted_at: ts,
    });
  }

  // 按投票时间倒序排列（最新投票排在前面）
  voters.sort((a, b) => b.voted_at - a.voted_at);

  return { poll: meta, voters };
}

/**
 * 将投票人员数据转为 CSV 格式（带 UTF-8 BOM，支持 Excel 直接打开不乱码）
 */
export function formatVotersCsv(records: PollVoterRecord[]): string {
  const headers = [
    "投票主题",
    "投票ID",
    "投票人ID",
    "投票人姓名",
    "所选选项",
    "所选选项ID",
    "投票时间",
  ];

  const escapeCell = (val: unknown): string => {
    if (val === null || val === undefined) return '""';
    const s = String(val);
    if (/[",\r\n]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return `"${s}"`;
  };

  const rows = records.map((r) => {
    const timeStr = r.voted_at
      ? new Date(r.voted_at).toLocaleString("zh-CN", {
          timeZone: "Asia/Shanghai",
          hour12: false,
        })
      : "";
    return [
      escapeCell(r.poll_title),
      escapeCell(r.poll_id),
      escapeCell(r.user_id),
      escapeCell(r.nickname || "未填写"),
      escapeCell(r.option_labels.join("、")),
      escapeCell(r.option_ids.join(";")),
      escapeCell(timeStr),
    ].join(",");
  });

  // UTF-8 BOM 确保 Microsoft Excel 打开不乱码
  return "\uFEFF" + [headers.map(escapeCell).join(","), ...rows].join("\r\n");
}

