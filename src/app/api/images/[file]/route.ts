import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";

const ALLOWED_EXT = new Set([".jpg", ".png", ".webp", ".gif"]);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file } = await params;
  // 只允许纯文件名，防路径穿越
  if (!/^[A-Za-z0-9-]+\.[a-z0-9]+$/.test(file)) {
    return NextResponse.json({ error: "无效文件名" }, { status: 400 });
  }
  if (!ALLOWED_EXT.has(path.extname(file))) {
    return NextResponse.json({ error: "不支持的文件类型" }, { status: 400 });
  }

  const filePath = path.resolve(process.cwd(), getEnv().dataDir, "uploads", file);
  let size: number;
  try {
    const st = await stat(filePath);
    if (!st.isFile()) throw new Error("not a file");
    size = st.size;
  } catch {
    return NextResponse.json({ error: "图片不存在" }, { status: 404 });
  }

  const mime = {
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
  }[path.extname(file)]!;

  // 文件名即内容（UUID），永不变更，可永久缓存
  const stream = createReadStream(filePath);
  return new NextResponse(stream as unknown as ReadableStream, {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(size),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
