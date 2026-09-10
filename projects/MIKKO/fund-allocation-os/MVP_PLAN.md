# Fund Allocation OS｜MVP Plan

## 1. 目标与范围

MVP 同时完成两条闭环：

1. 从中国公募基金全市场发现同类长期相对优秀且角色互补的 Core Fund Pool。
2. 让一个客户完成登录、风险测评、持仓录入、组合诊断、SAA、适配候选、再平衡建议、报告与事件陪伴。

在这两条闭环完成前，不扩展到私募、税务优化、复杂优化模型或自动真实交易。

## 2. Phase 0｜审计（已完成）

交付：`SKILL_AUDIT.md`、`ARCHITECTURE.md`、`DOMAIN_MODEL.md`、`MVP_PLAN.md`。

完成证据：93 个 Skill 目录清点；13 个核心 Skill 均存在；缺失 `fund-universe-screener`；41 个 Python 文件静态语法通过；数据源与结构化契约缺口已记录。

## 3. Phase 1｜Domain Model 与工程骨架（已完成）

任务：

- 建立 monorepo、FastAPI、Pydantic、SQLAlchemy/Alembic、SQLite。
- 实现核心实体、枚举、状态机和数据库约束。
- 建立 `DataSourceSnapshot`、`WorkflowRun`、`SkillRun`、`AuditLog`。
- 定义 `FundDataProvider`；iFinD Provider 已先行接入，后续补 FakeProvider 与 Python 服务桥接。
- 加入 `.env.example`，不写真实密钥。

退出条件：

- 数据库可从零迁移；核心 schema 序列化测试通过。
- 未审核 Recommendation 无法进入 approved/sent 状态。
- Provider 不可用时明确返回 unavailable，而不是空数据冒充成功。

## 4. Phase 2｜Calculation Engine 与 Skill Adapter（已完成）

优先迁移：收益、年化、波动、最大回撤、回撤恢复、Sharpe、Sortino、Calmar、集中度、相关性、持仓重叠。

随后接入 13 个核心 Skill + 新建 `fund-universe-screener`。每个 Adapter 都要有输入/输出 schema、版本、错误码、来源和契约测试。

退出条件：

- 金融指标通过固定样例、边界值和缺失数据测试。
- 同一输入、版本和数据快照产生相同确定性结果。
- Skill 返回 Markdown 时必须同时通过结构化输出校验。

## 5. Phase 3｜五条 Workflow（已完成）

实施顺序：

1. E 全市场发现：先用小型可审计样本跑通。
2. A 单基金研究：只对候选池调用深度 AI。
3. B 客户组合诊断：形成第一份可审核 Recommendation。
4. D 基金池维护：评级变更影响组合。
5. C 投后陪伴：模拟市场下跌事件。

退出条件：完整案例能从输入追溯到每个 DataSource、SkillRun、WorkflowStep、Recommendation 版本。

## 6. Phase 4｜双端 UI（已完成）

Client Portal：`/`, `/onboarding`, `/my-portfolio`, `/recommendation`, `/funds`, `/fund-radar`, `/reports`, `/companion`。

Advisor Console：Dashboard、Clients、Fund Universe、Fund Screener、Fund Research、Fund Pool、Portfolios、Monitoring、Events、Recommendations、Reports、Compliance、Workflow Runs、Skill Runs、Data Sources、Settings。

退出条件：Client 看不到其他客户数据或内部未审核结论；后台可查看来源、证据、风险和下一步。

## 7. Phase 5｜合规、安全与审计（已完成）

- Authentication、RBAC、secure session、输入校验、限流。
- Consent、数据导出、账户删除、敏感日志脱敏。
- Research/Analysis/Recommendation/Communication 明确标签。
- Human approval、版本替代关系、风险披露模板。

退出条件：权限矩阵、越权测试、审核状态测试和审计回放通过。

完成记录：签名身份令牌、六角色 RBAC、actor 身份绑定、审批职责分离、Consent 审计、敏感操作限流和安全回归测试均已落地。

## 8. Phase 6｜监控与自动化（已完成）

- 定时 Universe 更新、季报、经理变更、回撤、偏离和评级变化。
- 幂等任务、重试、dead-letter 状态、数据源健康告警。
- 自动创建待办，不自动下单或自动发送未经审核的建议。

完成记录：六类任务均已注册，JobRun 使用唯一幂等键，失败写入可重试状态并在三次后进入 dead-letter；成功只创建去重 Event 与人工待办。

## 9. 同花顺 MCP 接入验收

在真实连接可用后，按以下顺序验收：

1. 鉴权、权限范围、许可与并发/频率限制。
2. 基金代码与份额类别唯一标识。
3. 全市场列表、存续状态、成立日、类型、基准。
4. 日净值、复权/分红口径、交易日与缺失值。
5. 基金经理任期、规模、持仓、行业和资产配置。
6. 历史字段修订、as-of 语义、请求 ID 和错误码。
7. 与法定披露源做抽样一致性验证。

基础连接、工具清单、单基金基本资料与复权净值已通过；Universe 实测返回 27,625 个份额类别、29 个投资类型。只有进一步完成产品/份额合并、唯一性、存续状态、经理任期、规模报告期、持仓和报告期字段验收后，基金主数据 Provider 才能整体标记 `healthy`。

## 10. 第一条端到端验收案例

固定一个可重复的脱敏客户与小型基金 Universe：

- 输入：风险等级、目标、期限、流动性、最大回撤、当前基金持仓。
- 系统：画像 → SAA → 基金识别 → 研究/评价 → 角色 → 组合诊断 → 重复暴露 → 再平衡草案 → 适当性/合规 → 建议书。
- 事件：模拟 `PortfolioDrawdown5`。
- 输出：针对客户状态的解释、是否需要行动、审核队列。
- 审计：保存完整 Workflow、Skill、DataSource、Recommendation 和 Communication 记录。

## 11. 近期实施批次

### Batch 1（Phase 1）

- 工程骨架、数据库、核心 schema、状态机、FakeProvider、基础测试。

### Batch 2（Phase 2A）

- 计算引擎、Data Quality、Comparable Group 与 Hard Filter。

### Batch 3（Phase 2B/3）

- `fund-universe-screener`、相似度、基金评价 Adapter、Workflow E/A。

### Batch 4（Phase 3/4）

- 客户旅程、Workflow B/C/D、双端关键页面。

## 12. 风险与决策记录

| 风险 | 当前决策 |
|---|---|
| 同花顺 MCP 使用 HTTP SSE | 开发可用；生产前必须升级 HTTPS、专线或可信隧道 |
| 上游网页抓取不稳定 | 仅作为回退和字段映射参考 |
| 评级口径未完全量化 | Phase 2 版本化规则；任何模型变更保留历史 |
| AI 输出不可复现 | 保存模型版本、prompt hash、输入和证据；决策指标确定性执行 |
| 客户侧合规风险 | 未审核内容不发送；AI 不新增行动建议 |
| 范围膨胀 | 以两条 MVP 闭环和端到端案例为唯一扩展门禁 |
