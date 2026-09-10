import { ClientFundAllocator } from "./_components/ClientFundAllocator";
import { Shell } from "./_components/Shell";

export const metadata = {
  title: "Fund Allocation OS｜我的基金配置",
  description: "输入资金情况、个人信息和风险承受力，生成包含具体基金与金额的个性化配置建议。",
};

export default function Home() {
  return <Shell active="/" eyebrow="CLIENT ALLOCATION PLANNER" title="我的基金配置">
    <section className="client-hero">
      <div><span>从你出发，而不是从基金排行榜出发</span><h2>告诉我你的资金和风险边界，<br />再为你筛选具体基金。</h2><p>4 步完成：资金情况 → 个人信息 → 风险评估 → 基金配置。系统以 iFinD 的 27,625 个基金份额为数据基础，结果明确到每只基金的比例、金额、组合角色和筛选理由。</p></div>
      <div className="client-hero-flow"><div><b>01</b><span>了解你</span></div><i>→</i><div><b>02</b><span>评估风险</span></div><i>→</i><div><b>03</b><span>筛基金</span></div><i>→</i><div><b>04</b><span>配金额</span></div></div>
    </section>
    <ClientFundAllocator />
  </Shell>;
}
