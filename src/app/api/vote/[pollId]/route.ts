import { NextResponse } from "next/server";
import { castVote, getPollMeta } from "@/lib/poll-service";
import { isDingTalk, isWeCom } from "@/lib/ua";

const ERROR_STATUS: Record<string, number> = {
  NOT_FOUND: 404,
  ENDED: 409,
  EXPIRED: 409,
  ALREADY_VOTED: 409,
  INVALID_OPTION: 400,
  CHOICES_OUT_OF_RANGE: 400,
};

const ERROR_MESSAGE: Record<string, string> = {
  NOT_FOUND: "投票不存在",
  ENDED: "投票已结束",
  EXPIRED: "投票已过截止时间",
  ALREADY_VOTED: "您已投过票",
  INVALID_OPTION: "包含无效选项",
  CHOICES_OUT_OF_RANGE: "选择数量不符合规则",
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ pollId: string }> }
) {
  const { pollId } = await params;
  const userAgent = req.headers.get("user-agent") ?? "";

  const meta = await getPollMeta(pollId);
  if (!meta) {
    return NextResponse.json(
      { error: "投票不存在", code: "NOT_FOUND" },
      { status: 404 }
    );
  }

  const allowedAuth = meta.allowed_auth ?? "any";

  // 根据管理员设定的认证限制进行客户端校验（若未设置限制，则任何方式均可访问）
  if (allowedAuth === "dingtalk") {
    if (!isDingTalk(userAgent)) {
      return NextResponse.json(
        {
          error: "该投票仅支持使用钉钉扫码参与",
          code: "AUTH_MODE_MISMATCH",
        },
        { status: 403 }
      );
    }
  } else if (allowedAuth === "wecom") {
    if (!isWeCom(userAgent)) {
      return NextResponse.json(
        {
          error: "该投票仅支持使用企业微信扫码参与",
          code: "AUTH_MODE_MISMATCH",
        },
        { status: 403 }
      );
    }
  } else if (allowedAuth === "both") {
    if (!isDingTalk(userAgent) && !isWeCom(userAgent)) {
      return NextResponse.json(
        {
          error: "该投票仅支持使用钉钉或企业微信扫码参与",
          code: "AUTH_MODE_MISMATCH",
        },
        { status: 403 }
      );
    }
  }

  const body = await req.json().catch(() => null);
  const userId = body?.user_id ? String(body.user_id) : "";
  const optionIds = Array.isArray(body?.option_ids) ? body.option_ids : [];
  const nickname = body?.nickname ? String(body.nickname) : "";

  if (!userId || optionIds.length === 0) {
    return NextResponse.json(
      { error: "缺少 user_id 或 option_ids" },
      { status: 400 }
    );
  }

  const result = await castVote(
    pollId,
    userId,
    optionIds.map(String),
    nickname
  );
  if (!result.ok) {
    return NextResponse.json(
      {
        error: ERROR_MESSAGE[result.code] ?? "投票失败",
        code: result.code,
        reason: result.reason,
      },
      { status: ERROR_STATUS[result.code] ?? 400 }
    );
  }
  return NextResponse.json({ ok: true, my_choices: result.myChoices });
}
