import { NextResponse } from "next/server";
import { createSessionToken, getAdminPassword, safeEqual } from "@/lib/auth/admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";
  const expected = getAdminPassword();
  if (!expected) {
    return NextResponse.json(
      { error: "未配置管理密码（.env.local 的 ADMIN_PASSWORD）" },
      { status: 500 }
    );
  }
  if (!password || !safeEqual(password, expected)) {
    return NextResponse.json({ error: "密码不正确" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("admin_session", createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
  return res;
}
