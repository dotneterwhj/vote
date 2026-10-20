import { NextResponse } from "next/server";
import { setVisibility } from "@/lib/poll-service";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body.hidden !== "boolean") {
    return NextResponse.json({ error: "hidden 必须为布尔值" }, { status: 400 });
  }
  const ok = await setVisibility(id, body.hidden);
  if (!ok) {
    return NextResponse.json({ error: "投票不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, hidden: body.hidden });
}
