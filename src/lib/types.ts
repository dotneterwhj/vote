export type PollStatus = "active" | "ended";

export interface PollOption {
  id: string;
  label: string;
  color: string;
  /** 相对 URL，如 /api/images/xxx.jpg，无图时缺省 */
  image?: string;
}

export type AllowedAuthType = "any" | "both" | "dingtalk" | "wecom";

export interface PollMeta {
  poll_id: string;
  title: string;
  desc: string;
  options: PollOption[];
  max_choices: number;
  min_choices: number;
  /** ms epoch, 0 = 不限截止时间 */
  expire_at: number;
  status: PollStatus;
  hidden: boolean;
  /** 允许的投票客户端认证方式："any" = 都不勾选(无限制/任何方式均可), "both" = 钉钉和企微, "dingtalk" = 仅钉钉, "wecom" = 仅企业微信 */
  allowed_auth?: AllowedAuthType;
  /** 相对 URL，如 /api/images/xxx.jpg，无背景时缺省 */
  bg_image?: string;
  created_at: number;
}

export interface Snapshot {
  poll_id: string;
  /** option_id → count */
  counts: Record<string, number>;
  /** Σcounts */
  total: number;
  /** SCARD voters */
  voters: number;
  status: PollStatus;
  hidden: boolean;
  expire_at: number;
  /** 服务端时间戳，客户端用于校准倒计时时钟偏差 */
  server_ts: number;
}

/** H5 侧投票状态：不含 counts（防作弊） */
export interface VoteState {
  poll: PollMeta;
  status: PollStatus;
  /** 该用户是否已投 */
  voted: boolean;
  /** 已投时个人所选 option_id */
  myChoices: string[];
  server_ts: number;
}

export type VoteErrorCode =
  | "NOT_FOUND"
  | "ENDED"
  | "EXPIRED"
  | "ALREADY_VOTED"
  | "INVALID_OPTION"
  | "CHOICES_OUT_OF_RANGE";

export type VoteErrorReason = "MISSING_FIELDS" | "DUPLICATE_OPTIONS";

/** WS 服务端 → 客户端 唯一业务消息 */
export type SnapshotMessage = { type: "snapshot"; snapshot: Snapshot };
