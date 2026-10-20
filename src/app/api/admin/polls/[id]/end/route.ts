import { NextResponse } from "next/server";
import { endPoll } from "@/lib/poll-service";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ok = await endPoll(id);
  if (!ok) {
    return NextResponse.json({ error: "投票不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
