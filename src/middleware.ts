import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken } from "@/lib/auth/admin";

export const runtime = "nodejs";

export const config = {
  matcher: ["/admin/:path*", "/api/admin/polls/:path*", "/api/admin/upload"],
};

const SESSION_COOKIE = "admin_session";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const authed = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === "/admin/login") {
    if (authed) {
      return NextResponse.redirect(new URL("/admin", req.url));
    }
    return NextResponse.next();
  }

  if (authed) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const loginUrl = new URL("/admin/login", req.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}
