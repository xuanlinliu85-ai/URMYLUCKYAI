# Phase 3｜五条 MVP Workflow 交付说明

交付日期：2026-08-17

## 已实现 Workflow

### E｜全市场基金发现

`Fund Universe → Data Quality → Comparable Groups → Universe 持久化 → Quant Screener → Candidate Pool`

- 基金来源通过 `source_snapshot_id` 强制关联 DataSourceSnapshot。
- 重复、无效代码和关键字段错误在入库前隔离。
- 未映射类别不得进入正常同类排名。
- 筛选结果落入 `FundScreeningResult`，而不是直接产生客户建议。

### A｜单基金研究

`Candidate → Deep Research → FundResearch → Standardized Evaluation → FundEvaluation`

- 深度研究只对候选基金运行。
- 研究与评价分别保存。
- 输出明确 `recommendation_created=false`。

### B｜客户组合诊断

`ClientProfile + Portfolio + SAA → Portfolio Analysis → Rebalance Proposal → Suitability → Draft Recommendation`

- 当前持仓、目标权重和资产类别必须完整。
- 再平衡结果只保存为 Proposal。
- Recommendation 初始状态固定为 `draft`。
- 适当性结果不会自动转为合规批准。

### D｜基金池维护

`FundEvaluation → Human Pool Decision → Membership Version → Impacted Portfolios → Event`

- D 级基金不能新增或升级为有效成员。
- 历史 Membership 通过 `valid_to` 关闭，不原地覆盖。
- 降级、暂停或剔除会创建影响事件并列出受影响组合。

### C｜投后陪伴

`Approved Recommendation + Event → Approved Facts Renderer → Draft ClientCommunication`

- 非 `approved` Recommendation 不能进入流程。
- Renderer 只能使用 `approved_facts` 和既有风险披露。
- 最终只创建 `draft` 沟通，不自动审核或发送。

## Workflow Engine

每次运行记录：

- Workflow 名称、版本、输入哈希、主体、发起人、起止时间和状态；
- 每一步的输入快照、结构化输出、错误码、尝试次数和输出引用；
- 嵌套 SkillRun 复用同一 Workflow ID，不会提前结束父 Workflow；
- 失败步骤会使 Workflow 明确进入 `failed`。

## iFinD 真实接入

新增统一数据命令，支持：

- `universe`：全市场基金清单；
- `snapshots`：基金基本资料、规模、经理和基准；
- `nav`：区间复权净值。

2026-08-17 真实验证：状态 `ready`，Universe 共 27,625 条；5 条预览覆盖偏股混合、灵活配置、纯债、被动指数和一级债基。

## 验证结果

- Python 自动化测试：24/24 通过。
- 五条 Workflow REST 路由均进入 OpenAPI。
- 固定样例完成 E → A → B → D → C 的关键状态与审计验证。
- Alembic 版本：`20260817_0004`。

