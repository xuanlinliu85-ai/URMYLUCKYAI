# Phase 1｜Domain Model 交付说明

交付日期：2026-08-17

## 已完成

- FastAPI 应用骨架和版本化 `/api/v1` 路由。
- SQLite 开发数据库、SQLAlchemy 2.x 模型和 PostgreSQL 可迁移设计。
- Alembic 初始迁移，覆盖 34 张业务表；另有 `alembic_version` 版本表。
- iFinD MCP Node Provider 到 Python API 的只读健康桥接。
- Recommendation 与 ClientCommunication 确定性状态机。
- 适当性、人工合规审核、人工沟通复核三道后端门禁。
- 所有受控状态变化写入不可替代的 AuditLog 哈希记录。
- Phase 1 数据库、API 合约和合规门禁自动化测试。

## 对象边界

系统明确分开四层对象：

1. `FundResearch` 保存事实、证据、限制和分析，不产生客户行动。
2. `FundEvaluation` 保存标准化评价、角色适配和风险标记。
3. `Recommendation` 关联客户与组合，必须经过适当性和人工合规审核。
4. `ClientCommunication` 只能解释 `approved_facts`，关联建议未批准时不能发送。

## 关键门禁

```text
Recommendation(draft)
  -> pending_compliance
  -> SuitabilityAssessment(outcome=pass)
  -> compliance_status=approved + reviewer_id
  -> approved
  -> ClientCommunication(reviewed + reviewer_id)
  -> sent
```

任何缺失步骤都会由后端状态机拒绝，而不是依赖页面按钮是否显示。

## 数据源原则

- iFinD MCP 是基金 Universe、基金静态资料和净值的首选数据源。
- Provider 结果必须保留 `source`、`as_of/checkedAt`、快照哈希和质量状态。
- 缺失、冲突或超时进入 `DataQualityIssue`，不得由模型补猜。
- 当前生产地址为 HTTP SSE；部署到正式环境前必须通过受控内网、TLS 代理或其他安全通道保护凭证和传输。

## 验证结果

- Python API/状态机测试：5/5 通过。
- Alembic：可在全新 SQLite 数据库升级至 `20260817_0001`。
- 迁移结果：35 张表（34 张业务表 + 1 张 Alembic 版本表）。
- iFinD 真实只读健康检查：`ready`，19 个工具，样例基金和 11 条复权净值记录通过。

## Phase 2 入口

下一阶段建立统一 `run_skill(skill_name, input, context, workflow_id)` Adapter，先接：

1. 全市场基金发现与批量量化初筛；
2. 数据质量和可比组；
3. 基金深度研究与标准化评价；
4. 客户画像、SAA 与组合诊断。

