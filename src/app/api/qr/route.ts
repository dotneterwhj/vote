import QRCode from "qrcode";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const text = url.searchParams.get("text");
  const size = Math.min(
    Math.max(parseInt(url.searchParams.get("size") ?? "240", 10) || 240, 80),
    1024
  );
  if (!text) {
    return new Response("missing text", { status: 400 });
  }
  const buf = await QRCode.toBuffer(text, {
    type: "png",
    width: size,
    margin: 2,
    color: { dark: "#0f172a", light: "#ffffff" },
  });
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
    },
  });
}
