# Phase 4｜Client Portal 与 Advisor Console 交付说明

交付日期：2026-08-18

## Client Portal

- `/onboarding`：风险画像与投资约束；只形成画像草案。
- `/my-portfolio`：持仓、风险指标与组合诊断。
- `/recommendation`：建议版本、审核状态和风险披露。
- `/funds`：基金研究事实层与标准化评价。
- `/fund-radar`：全市场同类候选与角色说明。
- `/reports`：版本化客户报告。
- `/companion`：事件驱动、只解释批准事实的投后内容。

## Advisor Console

- `/dashboard`：风险、待办、基金池与 Workflow 概览。
- `/clients`：客户画像更新和服务队列。
- `/fund-screener`：Universe 筛选漏斗与数据质量门禁。
- `/fund-pool`：角色桶、成员状态和版本。
- `/portfolios`：SAA 偏离、集中度与诊断结论。
- `/monitoring`、`/events`：事件引擎与受影响主体。
- `/recommendations`、`/compliance`：Recommendation 审批队列。
- `/workflows`：Workflow/Skill/DataSource 审计入口。
- `/workbench`：自然语言任务入口与执行前路由预览。

## 视觉与交互

- 深森林绿、暖白与琥珀色构成机构投顾风格。
- 桌面端固定导航，窄屏自动切换为单列布局。
- 页面优先呈现结论、证据、风险和下一步。
- 状态颜色只作为辅助，所有状态同时保留文字。

## 验证

- Vinext/Sites 生产构建成功。
- 19 个路由全部编译。
- Dashboard、Client Fund Radar、Advisor Fund Screener 服务端渲染测试通过。
- 本地预览返回 HTTP 200，并已在 Codex 内打开。
- 专属社交分享卡因图像服务网络错误未生成；未使用通用占位图。

