import { NextResponse } from "next/server";
import { setAllowedAuth } from "@/lib/poll-service";
import type { AllowedAuthType } from "@/lib/types";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const allowed = body?.allowed_auth;

  if (allowed !== "any" && allowed !== "both" && allowed !== "dingtalk" && allowed !== "wecom") {
    return NextResponse.json(
      { error: "allowed_auth 必须为 'any' | 'both' | 'dingtalk' | 'wecom'" },
      { status: 400 }
    );
  }

  const ok = await setAllowedAuth(id, allowed as AllowedAuthType);
  if (!ok) {
    return NextResponse.json({ error: "投票不存在" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, allowed_auth: allowed });
}
