# Phase 2｜Calculation Engine 与 Skill Adapter 交付说明

交付日期：2026-08-17

## 计算引擎

已实现收益、年化收益、波动率、最大回撤、回撤恢复、Sharpe、Sortino、Calmar、历史 VaR、集中度、相关性和持仓重叠。所有算法为无网络依赖的纯函数，并带输入门禁、边界测试和版本号。

## 全市场基础能力

- `fund-universe-quality-v1`：基金代码、重复、名称、类型、规模和净值质量检查。
- `cn-public-fund-peer-groups-v1`：版本化中国公募基金可比组映射；未知类别显式返回 `unmapped`。
- `fund-universe-screener-v1`：硬过滤后只在同类组内评分排名。
- `ComparableGroup` 已进入数据库和 Alembic 迁移。

## Skill Adapter

统一入口：

```text
run_skill(skill_name, input, context, workflow_id)
  -> SkillResult
```

`SkillResult` 固定包含状态、结构化输出、叙述输出、警告、来源、起止时间、Skill 版本、模型版本、Prompt/Input Hash、错误码、WorkflowRun ID 和 SkillRun ID。

已注册并可运行 14 个 Adapter：

1. `fund-metrics`
2. `fund-universe-screener`
3. `financial-plan`
4. `client-review`
5. `r9-fund-deep-research`
6. `fund-manager-deep-research`
7. `fund-diagnosis-3.10`
8. `bond-plus-fund-evaluation`
9. `fund-r9alpha-evaluation`
10. `fund-advisor-strategy`
11. `portfolio-rebalance`
12. `investment-proposal`
13. `post-investment-companion`
14. `fund-market-volatility-script`

研究、评价、客户建议和沟通的边界由输出中的 `decision_scope` 与审核状态门禁共同保证。三个客户沟通 Renderer 不能接受未批准 Recommendation。

## 来源与降级

- 数据快照保存 Provider、Dataset、请求、as-of、schema version、质量状态和原始响应哈希。
- Skill 声明不存在的 Snapshot ID 时以 `DATA_SNAPSHOT_NOT_FOUND` 失败，禁止静默继续或猜数。
- 输入校验失败记录为 `INPUT_VALIDATION_ERROR`。
- 运行异常记录为 `SKILL_EXECUTION_ERROR`。

## 验证结果

- Python 自动化测试：19/19 通过。
- REST API 可列出 14 个 Adapter，并通过统一接口执行。
- 当前 SQLite 已升级到 Alembic `20260817_0003`。

