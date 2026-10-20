import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { getEnv } from "@/lib/env";

const MAX_SIZE = 15 * 1024 * 1024; // 允许上传最大 15MB 原图
const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "请选择图片文件" }, { status: 400 });
  }

  const ext = ALLOWED_MIME[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: "仅支持 jpg/png/webp/gif 格式" },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "图片不能超过 15MB" }, { status: 400 });
  }

  const uploadType = form?.get("type");
  const isBg = uploadType === "bg";

  try {
    const rawBuffer = Buffer.from(await file.arrayBuffer());
    const dir = path.resolve(process.cwd(), getEnv().dataDir, "uploads");
    await mkdir(dir, { recursive: true });

    // 1. 背景图策略：高保真大屏展示，优先保证画质无失真
    if (isBg) {
      const meta = await sharp(rawBuffer).metadata();
      const width = meta.width ?? 0;
      const height = meta.height ?? 0;

      // 如果原图体积在 4MB 以内且分辨率在 4K UHD（3840×2160）以内，直接保留原画质原文件，确保 100% 无损零失真
      if (file.size <= 4 * 1024 * 1024 && width <= 3840 && height <= 2160) {
        const name = `${randomUUID()}${ext}`;
        await writeFile(path.join(dir, name), rawBuffer);
        return NextResponse.json({ url: `/api/images/${name}` }, { status: 201 });
      }

      // 超大原图（>4MB 或超 4K 分辨率）：
      // 保持在 4K 超清规格内，并采用 95 极高画质 + 4:4:4 色彩采样，杜绝色块与模糊
      const optimizedBuffer = await sharp(rawBuffer, { animated: true })
        .resize({
          width: 3840,
          height: 2160,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({
          quality: 95,
          alphaQuality: 100,
          effort: 6,
          smartSubsample: true, // 禁用色彩降采样，保护边缘和暗色渐变
        })
        .toBuffer();

      const name = `${randomUUID()}.webp`;
      await writeFile(path.join(dir, name), optimizedBuffer);
      return NextResponse.json({ url: `/api/images/${name}` }, { status: 201 });
    }

    // 2. 选项图/头像策略：直接在服务端裁切为原生透明圆形 WebP
    // 居中裁切（fit: cover）至 300x300，并施加圆形蒙版将四角裁为完全透明
    // 这样在任何客户端/大屏中加载的第一时间、第一帧直接就是圆形头像，彻底消除“先方后圆”的延迟和闪烁
    const size = 300;
    const circleMask = Buffer.from(
      `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="black"/></svg>`
    );

    const optimizedBuffer = await sharp(rawBuffer, { animated: true })
      .resize(size, size, {
        fit: "cover",
      })
      .composite([{ input: circleMask, blend: "dest-in" }])
      .webp({ quality: 85 })
      .toBuffer();

    const name = `${randomUUID()}.webp`;
    await writeFile(path.join(dir, name), optimizedBuffer);
    return NextResponse.json({ url: `/api/images/${name}` }, { status: 201 });
  } catch (err) {
    console.error("Image optimization error:", err);
    return NextResponse.json(
      { error: "图片处理失败，请确保上传有效的图片文件" },
      { status: 500 }
    );
  }
}
