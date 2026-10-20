import { NextResponse } from "next/server";
import { getVoteState } from "@/lib/poll-service";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ pollId: string }> }
) {
  const { pollId } = await params;
  const userId = new URL(req.url).searchParams.get("user_id");
  const state = await getVoteState(pollId, userId);
  if (!state) {
    return NextResponse.json({ error: "投票不存在" }, { status: 404 });
  }
  return NextResponse.json(state);
}
