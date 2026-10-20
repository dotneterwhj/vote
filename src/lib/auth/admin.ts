import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * 管理后台鉴权：单密码模型。
 * middleware（Edge）只检查 cookie 是否存在且格式合法，
 * HMAC 校验在此（Node runtime，能读到真实 env）执行。
 */
export function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD ?? "";
}

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function sessionSecret(): string {
  return process.env.ADMIN_SESSION_SECRET ?? getAdminPassword();
}

function hmac(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(payload).digest("hex");
}

/** token = `${issuedAt}.${hmac(issuedAt)}`，投票当天有效即可 */
export function createSessionToken(now = Date.now()): string {
  const issuedAt = String(now);
  return `${issuedAt}.${hmac(issuedAt)}`;
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const issuedAt = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = hmac(issuedAt);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const age = Date.now() - Number(issuedAt);
  return Number.isFinite(age) && age >= 0 && age < SESSION_TTL_MS;
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) {
    // 长度不等也要跑一次比较，抹平时序差异
    timingSafeEqual(ba, ba);
    return false;
  }
  return timingSafeEqual(ba, bb);
}
