import { redis } from "@/lib/redis";

const WECOM_TOKEN_CACHE_KEY = "cache:wecom:access_token";

export interface WeComUserInfo {
  userId: string;
  nickname: string;
}

export function getWeComConfig() {
  const corpId = process.env.WECOM_CORP_ID || "";
  const agentId = process.env.WECOM_AGENT_ID || "";
  const corpSecret = process.env.WECOM_CORP_SECRET || "";

  return {
    corpId,
    agentId,
    corpSecret,
    isConfigured: Boolean(corpId && corpSecret),
  };
}

/**
 * 获取企业微信接口 AccessToken（通过 Redis 缓存）
 */
export async function getWeComAccessToken(): Promise<string> {
  const { corpId, corpSecret, isConfigured } = getWeComConfig();

  if (!isConfigured) {
    throw new Error(
      "WECOM_NOT_CONFIGURED: 请在环境变量中配置 WECOM_CORP_ID 和 WECOM_CORP_SECRET"
    );
  }

  // 1. 尝试从 Redis 缓存获取
  try {
    const cached = await redis.get(WECOM_TOKEN_CACHE_KEY);
    if (cached) return cached;
  } catch (err) {
    console.warn("[WeCom] Redis get cache error, falling back to direct request:", err);
  }

  // 2. 调用企业微信接口换取 access_token
  const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(
    corpId
  )}&corpsecret=${encodeURIComponent(corpSecret)}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`企业微信 AccessToken 请求 HTTP 失败: ${res.status}`);
  }

  const data = (await res.json()) as {
    errcode: number;
    errmsg: string;
    access_token?: string;
    expires_in?: number;
  };

  if (data.errcode !== 0 || !data.access_token) {
    throw new Error(`企业微信 AccessToken 获取失败 [${data.errcode}]: ${data.errmsg}`);
  }

  const token = data.access_token;
  const ttl = Math.max((data.expires_in ?? 7200) - 300, 60);

  try {
    await redis.set(WECOM_TOKEN_CACHE_KEY, token, "EX", ttl);
  } catch (err) {
    console.warn("[WeCom] Redis set cache error:", err);
  }

  return token;
}

/**
 * 根据前端 OAuth 获取的 authCode 获取用户在企业微信内的实名身份
 */
export async function getWeComUserInfo(code: string): Promise<WeComUserInfo> {
  const { isConfigured } = getWeComConfig();

  // 若未配置企业微信参数（如本地开发环境），提供开发模拟身份
  if (!isConfigured) {
    console.warn(
      "[WeCom] 未配置企业微信参数，已使用开发模拟身份（生产环境请配置 WECOM_CORP_ID / WECOM_CORP_SECRET）"
    );
    return {
      userId: `mock_wx_${code.slice(0, 8)}`,
      nickname: "企业微信测试用户",
    };
  }

  const accessToken = await getWeComAccessToken();

  // 1. 通过 code 获取 userid
  const userInfoUrl = `https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo?access_token=${encodeURIComponent(
    accessToken
  )}&code=${encodeURIComponent(code)}`;

  const userRes = await fetch(userInfoUrl, { cache: "no-store" });
  if (!userRes.ok) {
    throw new Error(`请求企业微信用户信息 HTTP 异常: ${userRes.status}`);
  }

  const userData = (await userRes.json()) as {
    errcode: number;
    errmsg: string;
    userid?: string;
    UserId?: string;
    OpenId?: string;
  };

  if (userData.errcode !== 0) {
    // 兼容旧版 user/getuserinfo
    const legacyUrl = `https://qyapi.weixin.qq.com/cgi-bin/user/getuserinfo?access_token=${encodeURIComponent(
      accessToken
    )}&code=${encodeURIComponent(code)}`;
    const legacyRes = await fetch(legacyUrl, { cache: "no-store" });
    const legacyData = await legacyRes.json().catch(() => null);
    if (!legacyData || legacyData.errcode !== 0) {
      throw new Error(`企业微信免登凭证换取失败 [${userData.errcode}]: ${userData.errmsg}`);
    }
    userData.userid = legacyData.userid || legacyData.UserId;
    userData.OpenId = legacyData.OpenId;
  }

  const rawUserId = userData.userid || userData.UserId || userData.OpenId;
  if (!rawUserId) {
    throw new Error("企业微信免登返回缺少用户标识");
  }

  let nickname = "";

  // 2. 如果是企业内成员 userid，尝试获取用户真实姓名
  if (userData.userid || userData.UserId) {
    try {
      const detailUrl = `https://qyapi.weixin.qq.com/cgi-bin/user/get?access_token=${encodeURIComponent(
        accessToken
      )}&userid=${encodeURIComponent(rawUserId)}`;
      const detailRes = await fetch(detailUrl, { cache: "no-store" });
      if (detailRes.ok) {
        const detailData = await detailRes.json();
        if (detailData.errcode === 0 && detailData.name) {
          nickname = String(detailData.name);
        }
      }
    } catch (e) {
      console.warn("[WeCom] 获取用户姓名详情失败:", e);
    }
  }

  return {
    userId: rawUserId,
    nickname: nickname || rawUserId,
  };
}
