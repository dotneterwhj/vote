import { NextResponse } from "next/server";
import {
  getPollMeta,
  getSnapshot,
  deletePoll,
  updatePoll,
} from "@/lib/poll-service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const meta = await getPollMeta(id);
  if (!meta) {
    return NextResponse.json({ error: "投票不存在" }, { status: 404 });
  }
  const snapshot = await getSnapshot(id);
  return NextResponse.json({ poll: meta, snapshot });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "无效请求体" }, { status: 400 });
  }

  const title = String(body.title ?? "").trim();
  const desc = String(body.desc ?? "").trim();
  const rawOptions = Array.isArray(body.options) ? body.options : [];
  const options: { label: string; image?: string }[] = [];
  for (const o of rawOptions) {
    if (typeof o === "string") {
      const label = o.trim();
      if (label) options.push({ label });
      continue;
    }
    if (!o || typeof o !== "object") continue;
    const label = String(o.label ?? "").trim();
    if (!label) continue;
    const image = String(o.image ?? "").trim() || undefined;
    options.push({ label, image });
  }
  const bgImage = String(body.bg_image ?? "").trim() || undefined;
  const maxChoices = parseInt(String(body.max_choices ?? "1"), 10);
  const minChoices = parseInt(String(body.min_choices ?? "1"), 10);
  const expireAt = body.expire_at ? Number(body.expire_at) : 0;

  if (!title) {
    return NextResponse.json({ error: "请填写投票主题" }, { status: 400 });
  }
  if (options.length < 2) {
    return NextResponse.json({ error: "至少需要 2 个候选选项" }, { status: 400 });
  }
  if (options.length > 20) {
    return NextResponse.json({ error: "选项最多 20 个" }, { status: 400 });
  }
  for (const o of options) {
    if (o.image && !o.image.startsWith("/api/images/")) {
      return NextResponse.json({ error: "选项图片地址无效" }, { status: 400 });
    }
  }
  if (bgImage && !bgImage.startsWith("/api/images/")) {
    return NextResponse.json({ error: "背景图片地址无效" }, { status: 400 });
  }
  if (!Number.isFinite(maxChoices) || maxChoices < 1 || maxChoices > options.length) {
    return NextResponse.json(
      { error: `最多可选须在 1 ~ ${options.length} 之间` },
      { status: 400 }
    );
  }
  if (!Number.isFinite(minChoices) || minChoices < 1 || minChoices > maxChoices) {
    return NextResponse.json(
      { error: `最少可选须在 1 ~ ${maxChoices} 之间` },
      { status: 400 }
    );
  }
  if (expireAt < 0 || !Number.isFinite(expireAt)) {
    return NextResponse.json({ error: "截止时间无效" }, { status: 400 });
  }

  const allowedAuth =
    body.allowed_auth === "dingtalk" || body.allowed_auth === "wecom" || body.allowed_auth === "both"
      ? body.allowed_auth
      : undefined;

  const result = await updatePoll(id, {
    title,
    desc,
    options,
    max_choices: maxChoices,
    min_choices: minChoices,
    expire_at: expireAt,
    bg_image: bgImage,
    ...(allowedAuth ? { allowed_auth: allowedAuth } : {}),
  });

  if (!result.ok) {
    const status =
      result.code === "HAS_VOTES"
        ? 409
        : result.code === "NOT_FOUND"
        ? 404
        : 400;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status }
    );
  }

  return NextResponse.json({ poll: result.poll });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ok = await deletePoll(id);
  if (!ok) {
    return NextResponse.json({ error: "投票不存在或已被删除" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}


