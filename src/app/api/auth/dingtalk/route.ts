import { NextResponse } from "next/server";
import { getDingTalkConfig, getDingTalkUserInfo } from "@/lib/auth/dingtalk";

export async function GET() {
  const { corpId, isConfigured } = getDingTalkConfig();
  return NextResponse.json({
    corpId,
    isConfigured,
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const code = body?.code ? String(body.code) : "";

    if (!code) {
      return NextResponse.json(
        { ok: false, error: "缺少免登授权码 code" },
        { status: 400 }
      );
    }

    const userInfo = await getDingTalkUserInfo(code);
    return NextResponse.json({
      ok: true,
      userId: userInfo.userId,
      nickname: userInfo.nickname,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "钉钉免登失败";
    console.error("[api/auth/dingtalk] error:", err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
