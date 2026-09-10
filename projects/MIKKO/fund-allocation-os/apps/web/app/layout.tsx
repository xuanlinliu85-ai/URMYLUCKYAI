import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fund Allocation OS",
  description: "面向中国公募基金全市场的可审计基金配置操作系统。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
