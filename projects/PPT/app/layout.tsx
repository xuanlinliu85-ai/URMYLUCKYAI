import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PPT Factory / Style OS",
  description: "Reference-driven and prompt-driven editable PowerPoint production"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
