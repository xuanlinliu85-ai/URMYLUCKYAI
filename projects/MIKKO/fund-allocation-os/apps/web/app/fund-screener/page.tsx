import { PageIntro, Panel, Shell, StatStrip, Status } from "../_components/Shell";

export default function FundScreener() {
  return <Shell active="/fund-screener" eyebrow="ADVISOR CONSOLE · UNIVERSE" title="全市场筛选">
    <PageIntro label="WORKFLOW E" title="27,625 只份额，逐层缩小到可研究候选。" body="硬过滤与量化排名全部确定性执行；模型不会逐只扫描全市场，深度研究只用于候选池。" actions={<button className="primary-button">新建筛选运行</button>} />
    <StatStrip items={[["原始 Universe", "27,625", "100%"], ["质量通过", "25,806", "93.4%"], ["硬过滤通过", "4,218", "15.3%"], ["深研候选", "128", "0.46%"]]} />
    <div className="content-grid"><Panel label="FILTER FUNNEL" title="筛选漏斗"><div className="funnel"><div style={{width:"100%"}}>Universe <b>27,625</b></div><div style={{width:"82%"}}>同类可比 <b>22,690</b></div><div style={{width:"54%"}}>规模与历史 <b>14,912</b></div><div style={{width:"26%"}}>风险收益 <b>7,184</b></div><div style={{width:"12%"}}>候选池 <b>128</b></div></div></Panel><Panel label="QUALITY GATE" title="数据质量"><div className="rule-list"><p><Status>通过</Status>基金代码与份额唯一性</p><p><Status>通过</Status>净值日期与正值检查</p><p><Status tone="amber">复核</Status>38 条规模报告期缺失</p><p><Status tone="red">隔离</Status>12 条无法映射可比组</p></div></Panel></div>
  </Shell>;
}
