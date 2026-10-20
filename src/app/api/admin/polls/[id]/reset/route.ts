import { NextResponse } from "next/server";
import { resetPoll } from "@/lib/poll-service";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const newExpireAt =
    body?.new_expire_at && Number(body.new_expire_at) > 0
      ? Number(body.new_expire_at)
      : undefined;
  const ok = await resetPoll(id, newExpireAt);
  if (!ok) {
    return NextResponse.json({ error: "投票不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
