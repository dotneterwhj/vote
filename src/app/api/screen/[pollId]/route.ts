import { NextResponse } from "next/server";
import { getSnapshot } from "@/lib/poll-service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ pollId: string }> }
) {
  const { pollId } = await params;
  const snapshot = await getSnapshot(pollId);
  if (!snapshot) {
    return NextResponse.json({ error: "投票不存在" }, { status: 404 });
  }
  return NextResponse.json(snapshot);
}
