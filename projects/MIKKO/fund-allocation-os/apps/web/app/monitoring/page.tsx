import { PageIntro, Panel, Shell, StatStrip, Status } from "../_components/Shell";

const events = [
  ["PortfolioDrawdown5", "周先生·成长组合", "高", "待诊断"],
  ["FundRatingDowngrade", "候选基金甲", "中", "已识别 3 个组合"],
  ["AllocationDeviation", "林女士·主组合", "中", "待生成草案"],
  ["QuarterlyReview", "7 位客户", "低", "待联系"],
];

const jobs = [
  ["全市场 Universe 更新", "工作日 02:00", "已完成", "1 / 3"],
  ["组合回撤检查", "工作日 18:00", "已完成", "1 / 3"],
  ["配置偏离检查", "工作日 18:30", "重试中", "2 / 3"],
  ["经理变更监控", "每 4 小时", "待运行", "0 / 3"],
];

export default function Monitoring() {
  return <Shell active="/monitoring" eyebrow="ADVISOR CONSOLE · EVENT ENGINE" title="监控与事件">
    <PageIntro label="DETERMINISTIC TRIGGERS" title="异常先成为事件，再进入受控 Workflow。" body="六类幂等任务监控 Universe、季报、经理、回撤、配置偏离与评级变化；系统自动建待办，不自动交易或发送建议。" />
    <StatStrip items={[["开放事件", "16", "当前"], ["高严重度", "3", "优先处理"], ["自动化任务", "6", "全部启用"], ["Dead-letter", "0", "当前为空"]]} />
    <Panel label="AUTOMATION JOBS" title="调度与重试">
      <div className="data-table">
        <div className="table-head"><span>任务</span><span>计划</span><span>状态</span><span>尝试</span><span>边界</span></div>
        {jobs.map(([job, schedule, state, attempts]) => <div className="table-row" key={job}>
          <strong>{job}<small>幂等键已记录</small></strong><span>{schedule}</span>
          <Status tone={state === "已完成" ? "green" : state === "重试中" ? "amber" : "gray"}>{state}</Status>
          <span>{attempts}</span><span>仅建人工待办</span>
        </div>)}
      </div>
    </Panel>
    <Panel label="EVENT QUEUE" title="事件队列">
      <div className="data-table">
        <div className="table-head"><span>事件</span><span>主体</span><span>严重度</span><span>状态</span><span>操作</span></div>
        {events.map(([event, subject, severity, state]) => <div className="table-row" key={event}>
          <strong>{event}<small>规则 v1</small></strong><span>{subject}</span>
          <Status tone={severity === "高" ? "red" : severity === "中" ? "amber" : "gray"}>{severity}</Status>
          <span>{state}</span><a href="/workflows">追踪 →</a>
        </div>)}
      </div>
    </Panel>
  </Shell>;
}
