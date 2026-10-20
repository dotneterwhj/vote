import { isDingTalk, isWeCom } from "@/lib/ua";

export interface Identity {
  userId: string;
  nickname?: string;
}

export function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * 身份提供者抽象
 */
export interface AuthProvider {
  getIdentity(): Promise<Identity>;
}

const STORAGE_KEY = "vote.openid";
const DINGTALK_STORAGE_KEY = "vote.dingtalk.identity";
const WECOM_STORAGE_KEY = "vote.wecom.identity";

/**
 * 设备指纹提供者：本地生成持久 UUID（非微应用/企业客户端环境的默认身份）
 */
export class DeviceFingerprintProvider implements AuthProvider {
  async getIdentity(): Promise<Identity> {
    if (typeof window === "undefined") {
      return { userId: "anonymous" };
    }
    let userId = localStorage.getItem(STORAGE_KEY);
    if (!userId) {
      userId = generateUUID();
      localStorage.setItem(STORAGE_KEY, userId);
    }
    return { userId };
  }
}

/**
 * 钉钉微应用免登授权提供者
 */
export class DingTalkOAuthProvider implements AuthProvider {
  async getIdentity(): Promise<Identity> {
    if (typeof window === "undefined") {
      return { userId: "anonymous" };
    }

    // 1. 若当前会话已有缓存身份，直接复用
    const cached = localStorage.getItem(DINGTALK_STORAGE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as Identity;
        if (parsed.userId) return parsed;
      } catch {
        localStorage.removeItem(DINGTALK_STORAGE_KEY);
      }
    }

    // 2. 获取钉钉 corpId 配置
    let corpId = "";
    try {
      const cfgRes = await fetch("/api/auth/dingtalk", { cache: "no-store" });
      if (cfgRes.ok) {
        const cfg = await cfgRes.json();
        corpId = cfg.corpId || "";
      }
    } catch (e) {
      console.warn("[DingTalk] 获取 corpId 失败:", e);
    }

    // 3. 动态加载 dingtalk-jsapi 获取免登授权码
    try {
      const ddModule = await import("dingtalk-jsapi");
      const dd = (ddModule.default || ddModule) as any;

      const authCode = await new Promise<string>((resolve, reject) => {
        dd.ready(() => {
          dd.runtime.permission.requestAuthCode({
            corpId: corpId || undefined,
            onSuccess: (info: { code: string }) => resolve(info.code),
            onFail: (err: unknown) => reject(err),
          });
        });
        // 5秒超时保护
        setTimeout(() => reject(new Error("钉钉 JSAPI 响应超时")), 5000);
      });

      // 4. 发送到后端换取用户身份
      const authRes = await fetch("/api/auth/dingtalk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: authCode }),
      });

      const data = await authRes.json();
      if (data.ok && data.userId) {
        const identity: Identity = {
          userId: data.userId,
          nickname: data.nickname,
        };
        localStorage.setItem(DINGTALK_STORAGE_KEY, JSON.stringify(identity));
        return identity;
      } else {
        throw new Error(data.error || "免登换取用户信息失败");
      }
    } catch (err) {
      console.warn("[DingTalk] 免登异常，降级处理:", err);
      // 若在钉钉内免登调用失败（例如未配置 corpId 或本地 mock），生成带前缀的唯一身份以保障体验
      let fallbackUserId = localStorage.getItem(DINGTALK_STORAGE_KEY + ".fallback");
      if (!fallbackUserId) {
        fallbackUserId = "dd_user_" + generateUUID().slice(0, 8);
        localStorage.setItem(DINGTALK_STORAGE_KEY + ".fallback", fallbackUserId);
      }
      return { userId: fallbackUserId, nickname: "钉钉用户" };
    }
  }
}

/**
 * 企业微信免登授权提供者（通过 OAuth2 snsapi_base 静默授权）
 */
export class WeComOAuthProvider implements AuthProvider {
  async getIdentity(): Promise<Identity> {
    if (typeof window === "undefined") {
      return { userId: "anonymous" };
    }

    // 1. 若当前会话已有缓存身份，直接复用
    const cached = localStorage.getItem(WECOM_STORAGE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as Identity;
        if (parsed.userId) return parsed;
      } catch {
        localStorage.removeItem(WECOM_STORAGE_KEY);
      }
    }

    try {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");

      // 2. 如果 URL 中已包含 code，向后端请求换取用户信息
      if (code) {
        const authRes = await fetch("/api/auth/wecom", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });

        const data = await authRes.json();
        if (data.ok && data.userId) {
          const identity: Identity = {
            userId: data.userId,
            nickname: data.nickname,
          };
          localStorage.setItem(WECOM_STORAGE_KEY, JSON.stringify(identity));

          // 清理 URL 中的 code / state 参数，避免刷新时重复换取已失效的授权码
          url.searchParams.delete("code");
          url.searchParams.delete("state");
          window.history.replaceState({}, "", url.toString());

          return identity;
        } else {
          throw new Error(data.error || "企业微信免登换取用户信息失败");
        }
      }

      // 3. URL 中没有 code，向后端获取 corpId 并引导重定向
      const cfgRes = await fetch("/api/auth/wecom", { cache: "no-store" });
      let corpId = "";
      if (cfgRes.ok) {
        const cfg = await cfgRes.json();
        corpId = cfg.corpId || "";
      }

      // 若未配置企业微信 corpId（开发环境），直接生成开发模拟身份
      if (!corpId) {
        let fallbackUserId = localStorage.getItem(WECOM_STORAGE_KEY + ".fallback");
        if (!fallbackUserId) {
          fallbackUserId = "wx_user_" + generateUUID().slice(0, 8);
          localStorage.setItem(WECOM_STORAGE_KEY + ".fallback", fallbackUserId);
        }
        return { userId: fallbackUserId, nickname: "企业微信测试用户" };
      }

      // 4. 发起企业微信静默授权重定向
      const redirectUri = encodeURIComponent(window.location.href);
      const oauthUrl = `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${encodeURIComponent(
        corpId
      )}&redirect_uri=${redirectUri}&response_type=code&scope=snsapi_base&state=STATE#wechat_redirect`;

      window.location.replace(oauthUrl);
      return new Promise<Identity>(() => {});
    } catch (err) {
      console.warn("[WeCom] 免登异常，降级处理:", err);
      let fallbackUserId = localStorage.getItem(WECOM_STORAGE_KEY + ".fallback");
      if (!fallbackUserId) {
        fallbackUserId = "wx_user_" + generateUUID().slice(0, 8);
        localStorage.setItem(WECOM_STORAGE_KEY + ".fallback", fallbackUserId);
      }
      return { userId: fallbackUserId, nickname: "企业微信用户" };
    }
  }
}

/**
 * 复合环境提供者：
 * - 企业微信打开：走企业微信免登授权
 * - 钉钉打开：走钉钉免登授权
 * - 其他浏览器打开：走设备指纹兜底
 */
export class HybridAuthProvider implements AuthProvider {
  private ddProvider = new DingTalkOAuthProvider();
  private wecomProvider = new WeComOAuthProvider();
  private fpProvider = new DeviceFingerprintProvider();

  async getIdentity(): Promise<Identity> {
    if (typeof window !== "undefined") {
      if (isWeCom()) {
        return this.wecomProvider.getIdentity();
      }
      if (isDingTalk()) {
        return this.ddProvider.getIdentity();
      }
    }
    return this.fpProvider.getIdentity();
  }
}

export const authProvider: AuthProvider = new HybridAuthProvider();
