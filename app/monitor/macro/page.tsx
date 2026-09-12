"use client";

// 宏观高频监测工作台 · 站点入口
//
// 设计取舍（避免两套前端漂移）：
// 工作台本身是 scripts/macro-workbench.mjs 产出的**单一自包含页面**
// （public/macro-workbench.html，数据与 ECharts 全部内联、可离线打开）。
// 这里不再用 React 重写一套同功能面板，而是把它嵌进站点，
// 保证「页面看到的数」与「交付给别人的文件」永远是同一份。
import { useEffect, useState } from "react";
import Link from "next/link";

export default function MacroMonitorPage() {
  const [meta, setMeta] = useState<{ asOf?: string; label?: string; composite?: number | null; generatedAt?: string } | null>(null);

  useEffect(() => {
    fetch("/macro-snapshot.json", { cache: "no-store" })
      .then(response => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then(data => setMeta(data.headline ? { ...data.headline, asOf: data.asOf, generatedAt: data.generatedAt } : null))
      .catch(() => setMeta(null));
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#f5f6f8" }}>
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between",
        padding: "10px 18px", background: "#fff", borderBottom: "1px solid #e5e7eb",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <strong style={{ fontSize: 15 }}>宏观高频监测</strong>
          <span style={{ color: "#6b7280", fontSize: 12.5 }}>
            {meta?.asOf ? `数据截止 ${meta.asOf}` : "加载中…"}
            {meta?.composite !== undefined && meta?.composite !== null ? ` · 综合状态分 ${meta.composite}（${meta.label}）` : ""}
          </span>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <a href="/macro-workbench.html" target="_blank" rel="noreferrer"
            style={{ fontSize: 12.5, color: "#2563eb", textDecoration: "none", border: "1px solid #dbeafe",
              background: "#eff6ff", borderRadius: 7, padding: "4px 11px" }}>
            独立窗口打开
          </a>
          <a href="/macro-daily-report.md" target="_blank" rel="noreferrer"
            style={{ fontSize: 12.5, color: "#2563eb", textDecoration: "none", border: "1px solid #dbeafe",
              background: "#eff6ff", borderRadius: 7, padding: "4px 11px" }}>
            当日汇报 Markdown
          </a>
          <a href="/macro-snapshot.json" target="_blank" rel="noreferrer"
            style={{ fontSize: 12.5, color: "#374151", textDecoration: "none", border: "1px solid #e5e7eb",
              borderRadius: 7, padding: "4px 11px" }}>
            原始快照 JSON
          </a>
          <Link href="/" style={{ fontSize: 12.5, color: "#374151", textDecoration: "none", border: "1px solid #e5e7eb",
            borderRadius: 7, padding: "4px 11px" }}>
            返回复盘台
          </Link>
        </div>
      </div>
      <iframe
        src="/macro-workbench.html"
        title="宏观高频监测工作台"
        style={{ flex: 1, width: "100%", border: 0, display: "block" }}
      />
    </div>
  );
}
