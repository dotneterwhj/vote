/**
 * 客户端环境检测工具（企业微信 / 钉钉）
 */

/** 是否在企业微信环境（User-Agent 包含 wxwork） */
export function isWeCom(ua?: string): boolean {
  const target =
    ua ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
  return /wxwork/i.test(target);
}

/** 是否在钉钉环境 */
export function isDingTalk(ua?: string): boolean {
  const target =
    ua ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
  return /DingTalk/i.test(target);
}

export function checkClientEnvironment(userAgent?: string) {
  const ua =
    userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
  return {
    isWeCom: isWeCom(ua),
    isDingTalk: isDingTalk(ua),
  };
}
