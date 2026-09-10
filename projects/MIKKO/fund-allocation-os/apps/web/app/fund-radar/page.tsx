import { PageIntro, Panel, Shell, StatStrip, Status } from "../_components/Shell";

const funds = [
  ["519702.OF", "交银趋势优先混合A", "主动权益 Alpha", "A", "88.4", "核心候选"],
  ["000001.OF", "华夏成长混合", "成长卫星", "B", "76.2", "观察"],
  ["001618.OF", "天弘中证电子ETF联接C", "被动指数", "B", "73.8", "备选"],
  ["001661.OF", "博时信用债纯债C", "固收底仓", "A", "86.9", "核心候选"],
];

export default function FundRadar() {
  return <Shell active="/fund-radar" eyebrow="CLIENT PORTAL · DISCOVERY" title="基金雷达">
    <PageIntro label="全市场，不追逐短期涨幅" title="先找同类优秀，再判断是否适合你。" body="基金雷达从 iFinD 全市场 Universe 出发，先完成数据质量、同类可比与量化筛选，再把候选基金放进适当性和组合角色框架。" actions={<a className="primary-button" href="/my-portfolio">结合我的组合</a>} />
    <StatStrip items={[["全市场份额", "27,625", "iFinD MCP"], ["可比组", "16", "版本 v1"], ["核心候选", "128", "人工批准基金池"], ["今日变化", "+4 / -2", "升级 / 降级"]]} />
    <Panel label="PEER-GROUP LEADERS" title="同类候选基金" action={<a href="/funds">查看研究证据</a>}>
      <div className="data-table"><div className="table-head"><span>基金</span><span>组合角色</span><span>评级</span><span>得分</span><span>状态</span></div>{funds.map(([code,name,role,rating,score,state]) => <div className="table-row" key={code}><strong>{name}<small>{code}</small></strong><span>{role}</span><b>{rating}</b><span>{score}</span><Status tone={rating === "A" ? "green" : "amber"}>{state}</Status></div>)}</div>
    </Panel>
  </Shell>;
}
