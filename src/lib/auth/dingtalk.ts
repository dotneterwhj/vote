import { redis } from "@/lib/redis";

const DINGTALK_TOKEN_CACHE_KEY = "cache:dingtalk:access_token";

export interface DingTalkUserInfo {
  userId: string;
  nickname: string;
}

export function getDingTalkConfig() {
  const corpId = process.env.DINGTALK_CORP_ID || "";
  const appKey = process.env.DINGTALK_APP_KEY || "";
  const appSecret = process.env.DINGTALK_APP_SECRET || "";

  return {
    corpId,
    appKey,
    appSecret,
    isConfigured: Boolean(corpId && appKey && appSecret),
  };
}

/**
 * 获取钉钉企业接口 AccessToken（通过 Redis 缓存）
 */
export async function getDingTalkAccessToken(): Promise<string> {
  const { appKey, appSecret, isConfigured } = getDingTalkConfig();

  if (!isConfigured) {
    throw new Error(
      "DINGTALK_NOT_CONFIGURED: 请在环境变量中配置 DINGTALK_CORP_ID、DINGTALK_APP_KEY、DINGTALK_APP_SECRET"
    );
  }

  // 1. 尝试从 Redis 缓存获取
  try {
    const cached = await redis.get(DINGTALK_TOKEN_CACHE_KEY);
    if (cached) return cached;
  } catch (err) {
    console.warn("[DingTalk] Redis get cache error, falling back to direct request:", err);
  }

  // 2. 调用钉钉开放平台接口换取 access_token
  const url = `https://oapi.dingtalk.com/gettoken?appkey=${encodeURIComponent(
    appKey
  )}&appsecret=${encodeURIComponent(appSecret)}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`钉钉 AccessToken 请求 HTTP 失败: ${res.status}`);
  }

  const data = (await res.json()) as {
    errcode: number;
    errmsg: string;
    access_token?: string;
    expires_in?: number;
  };

  if (data.errcode !== 0 || !data.access_token) {
    throw new Error(`钉钉 AccessToken 获取失败 [${data.errcode}]: ${data.errmsg}`);
  }

  const token = data.access_token;
  const ttl = Math.max((data.expires_in ?? 7200) - 300, 60);

  try {
    await redis.set(DINGTALK_TOKEN_CACHE_KEY, token, "EX", ttl);
  } catch (err) {
    console.warn("[DingTalk] Redis set cache error:", err);
  }

  return token;
}

/**
 * 根据前端 JSAPI 获取的 authCode 获取用户在钉钉内的实名身份
 */
export async function getDingTalkUserInfo(code: string): Promise<DingTalkUserInfo> {
  const { isConfigured } = getDingTalkConfig();

  // 若未配置钉钉参数（如本地开发环境），提供开发模拟体验
  if (!isConfigured) {
    console.warn(
      "[DingTalk] 未配置钉钉开放平台参数，已使用开发模拟身份（生产环境请配置 DINGTALK_CORP_ID / DINGTALK_APP_KEY / DINGTALK_APP_SECRET）"
    );
    return {
      userId: `mock_dd_${code.slice(0, 8)}`,
      nickname: "钉钉测试用户",
    };
  }

  const accessToken = await getDingTalkAccessToken();
  const url = `https://oapi.dingtalk.com/topapi/v2/user/getuserinfo?access_token=${encodeURIComponent(
    accessToken
  )}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`请求钉钉用户信息 HTTP 异常: ${res.status}`);
  }

  const data = (await res.json()) as {
    errcode: number;
    errmsg: string;
    result?: {
      userid: string;
      name: string;
    };
  };

  if (data.errcode !== 0 || !data.result) {
    throw new Error(`钉钉免登凭证换取失败 [${data.errcode}]: ${data.errmsg}`);
  }

  return {
    userId: data.result.userid,
    nickname: data.result.name,
  };
}
