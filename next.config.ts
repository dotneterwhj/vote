import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["ioredis"],
  allowedDevOrigins: [
    ...(process.env.DEV_ORIGINS?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? []),
    "192.168.*",
    "10.*",
    "172.16.*",
  ],
  outputFileTracingRoot: path.resolve(__dirname),
};

export default nextConfig;
