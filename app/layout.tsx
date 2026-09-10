import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "urmylucky每日复盘 · 二代机与每日复盘",
  description: "二代机完整排名、真实K线与每日复盘的统一市场工作台",
};

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
