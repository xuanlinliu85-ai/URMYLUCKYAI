import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MATT · A股研究操作系统",
  description: "从事实、叙事与量价，到风险预算与行动协议的私有 A 股研究中枢。",
  openGraph: {
    title: "MATT · A股研究操作系统",
    description: "从事实、叙事与量价，到风险预算与行动协议。",
    images: ["/matt-signal-pipeline.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
