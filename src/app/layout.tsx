import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "实时投票系统",
  description: "现场实时投票：管理后台 / 手机 H5 / 大屏可视化",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
