import type { ReactNode } from "react";

const nav = [
  ["/", "总览"], ["/clients", "客户中心"], ["/fund-radar", "基金雷达"],
  ["/fund-screener", "全市场筛选"], ["/portfolios", "组合中心"],
  ["/monitoring", "监控与事件"], ["/recommendations", "建议与合规"], ["/workflows", "运行审计"],
];

export function Shell({ active, eyebrow, title, children }: { active: string; eyebrow: string; title: string; children: ReactNode }) {
  return <main className="shell">
    <aside className="sidebar">
      <a className="brand" href="/"><span>FA</span><div>Fund Allocation<small>OPERATING SYSTEM</small></div></a>
      <nav aria-label="主导航">{nav.map(([href, label]) => <a className={active === href ? "active" : ""} href={href} key={href}>{label}</a>)}</nav>
      <div className="source-card"><i />iFinD 主数据源<strong>READY · 19 TOOLS</strong></div>
    </aside>
    <section className="workspace">
      <header className="topbar"><div><p>{eyebrow}</p><h1>{title}</h1></div><div className="asof">数据时间<strong>2026-08-18 00:00 CST</strong></div></header>
      {children}
    </section>
  </main>;
}

export function PageIntro({ label, title, body, actions }: { label: string; title: string; body: string; actions?: ReactNode }) {
  return <section className="page-intro"><div><span>{label}</span><h2>{title}</h2><p>{body}</p></div>{actions && <div className="intro-actions">{actions}</div>}</section>;
}

export function StatStrip({ items }: { items: Array<[string, string, string]> }) {
  return <section className="metric-grid">{items.map(([label, value, note]) => <article key={label}><span>{label}</span><strong>{value}</strong><em>{note}</em></article>)}</section>;
}

export function Panel({ label, title, children, action }: { label: string; title: string; children: ReactNode; action?: ReactNode }) {
  return <article className="panel"><div className="panel-head"><div><span>{label}</span><h3>{title}</h3></div>{action}</div>{children}</article>;
}

export function Status({ tone = "green", children }: { tone?: "green" | "amber" | "red" | "gray"; children: ReactNode }) {
  return <span className={`status ${tone}`}>{children}</span>;
}
