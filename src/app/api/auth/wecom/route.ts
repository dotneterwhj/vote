import { NextResponse } from "next/server";
import { getWeComConfig, getWeComUserInfo } from "@/lib/auth/wecom";

export async function GET() {
  const { corpId, agentId, isConfigured } = getWeComConfig();
  return NextResponse.json({
    corpId,
    agentId,
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

    const userInfo = await getWeComUserInfo(code);
    return NextResponse.json({
      ok: true,
      userId: userInfo.userId,
      nickname: userInfo.nickname,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "企业微信免登失败";
    console.error("[api/auth/wecom] error:", err);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
