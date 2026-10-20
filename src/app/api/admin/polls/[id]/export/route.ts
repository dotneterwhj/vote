import { NextResponse } from "next/server";
import { getPollVoters, formatVotersCsv } from "@/lib/poll-service";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const data = await getPollVoters(id);

  if (!data) {
    return NextResponse.json({ error: "投票不存在" }, { status: 404 });
  }

  const url = new URL(req.url);
  const format = url.searchParams.get("format");

  // 支持以 JSON 格式返回供前端弹窗展示
  if (format === "json") {
    return NextResponse.json({
      ok: true,
      poll: {
        poll_id: data.poll.poll_id,
        title: data.poll.title,
        status: data.poll.status,
      },
      total: data.voters.length,
      voters: data.voters,
    });
  }

  // 默认下载 CSV
  const csv = formatVotersCsv(data.voters);
  const safeTitle = data.poll.title.replace(/[\/\\?%*:|"<>]/g, "_").slice(0, 30);
  const filename = `投票名单_${safeTitle}_${id}.csv`;
  const encodedFilename = encodeURIComponent(filename);

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`,
      "Cache-Control": "no-store",
    },
  });
}
