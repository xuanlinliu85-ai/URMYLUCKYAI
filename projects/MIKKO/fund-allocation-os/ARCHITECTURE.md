# Fund Allocation OS｜Architecture

## 1. 架构目标

构建一个模块化单体 MVP：客户可登录的 Client Portal + 专业 Advisor Console + 可审计的工作流后端。第一阶段不做微服务，不自动执行真实交易。

## 2. 逻辑架构

```text
Client Portal                 Advisor Console
    │                                │
    └──────────── Web / BFF ─────────┘
                         │
                    FastAPI API
                         │
      ┌──────────────────┼──────────────────┐
      │                  │                  │
 Identity/RBAC      Workflow Engine      Query/Report
      │                  │                  │
      │       ┌──────────┼──────────┐       │
      │       │          │          │       │
      │  Rule Engine  Calculation  Skill Adapter
      │       │          Engine         │
      │       │          │         AI/OPC Skills
      │       └──────────┼──────────┘
      │                  │
      │           Data Provider Layer
      │      THS MCP → Disclosures → fallbacks
      │                  │
      └────────── PostgreSQL / SQLite ──────────
                         │
                 Event + Audit Outbox
```

## 3. 技术选择

| 层 | MVP 选择 | 理由 |
|---|---|---|
| Web | Next.js + TypeScript | 同一代码库支持客户前台、后台、服务端渲染与权限路由 |
| API | Python 3.12 + FastAPI + Pydantic | 金融计算与现有 Python 资产兼容，契约清晰 |
| ORM / Migration | SQLAlchemy 2 + Alembic | SQLite/PostgreSQL 双环境，迁移可审计 |
| Database | SQLite（本地开发）/ PostgreSQL（共享环境） | MVP 简单，同时保留生产迁移路径 |
| Jobs | 数据库任务表 + worker | 先保证可追踪，不引入复杂消息系统 |
| Calculation | NumPy/Pandas 纯函数模块 | 确定性、可测试、可复现 |
| AI | Provider-neutral `SkillAdapter` | 模型和 Skill 可替换，不与 UI 绑定 |
| Test | pytest + contract tests + Playwright | 覆盖金融口径、Provider 契约与关键客户旅程 |

## 4. 建议目录

```text
fund-allocation-os/
├── apps/
│   ├── web/                    # Client Portal + Advisor Console
│   ├── api/                    # FastAPI
│   └── worker/                 # ingestion / events / reports
├── packages/
│   ├── domain/                 # Pydantic/domain enums
│   ├── calculations/           # 纯计算
│   ├── workflows/              # A-E 工作流
│   ├── providers/              # THS/disclosure/fallback adapters
│   ├── skills/                 # Skill registry/adapters
│   └── compliance/             # suitability/rules/approval
├── config/
│   ├── comparable-groups.yaml
│   ├── screening-rules.yaml
│   ├── rebalance-rules.yaml
│   └── data-source-policy.yaml
├── migrations/
├── tests/
├── docs/
└── upstream/OPC-skill/         # read-only, gitignored
```

## 5. 数据 Provider 设计

统一接口示例：

```python
class FundDataProvider(Protocol):
    def health(self) -> ProviderHealth: ...
    def list_funds(self, as_of: date) -> list[FundUniverseRecord]: ...
    def get_nav(self, fund_id: str, start: date, end: date) -> NavSeries: ...
    def get_holdings(self, fund_id: str, periods: int) -> list[HoldingSnapshot]: ...
    def get_manager_history(self, fund_id: str) -> list[ManagerTenure]: ...
    def get_aum_history(self, fund_id: str) -> list[AumSnapshot]: ...
```

路由规则：

1. 首先调用 `THSProvider`（同花顺 MCP/iFinD）。
2. 对公告、经理变更、定期报告等关键事实调用 `DisclosureProvider` 校验。
3. 缺失字段按字段级策略降级，不允许整条记录静默换源。
4. 每个字段保留 lineage；同一字段冲突进入 `DataQualityIssue`，不做无依据平均。
5. Provider 未连接时返回 `unavailable`，Workflow 可进入 `waiting_for_data` 或带缺失标志继续。

当前状态：已从独立的“每日复盘更新”工程定位并复用 iFinD SSE 接入方式。2026-08-17 实测 19 个 MCP 工具可用，基金样本 `519702.OF` 的基本资料与复权净值可返回；新项目已建立独立 `IfindFundProvider`。全市场 Universe 由 `THS_WCQuery` 获取，正式入库前仍需执行数量、唯一性、存续状态与份额类别质量门禁。

安全提示：现有 MCP 地址为 HTTP。开发环境可以沿用已验证连接；生产环境上线前必须确认 HTTPS、专线或可信隧道方案，避免认证信息明文传输。

## 6. Skill Adapter

```text
run_skill(skill_name, structured_input, context, workflow_run_id)
    → validate input
    → resolve version
    → execute deterministic prerequisites
    → invoke Skill/LLM if needed
    → validate structured output
    → persist SkillRun + sources + warnings
    → return SkillResult
```

`SkillResult` 最少包含：status、structured_output、narrative_output、warnings、sources、started_at、finished_at、skill_version、model_version、prompt_hash、input_hash。

Skill 分三种执行类型：

- `deterministic`：筛选、指标、评级规则、再平衡、适当性。
- `hybrid`：先计算/检索，后由 AI 解释，例如基金研究。
- `render_only`：将已批准对象转为报告或客户话术。

## 7. 五条 MVP Workflow

### A 单基金研究

`FundId → Provider Snapshot → Research → Manager Research → Diagnosis → Evaluation → Role → Pool Decision`

### B 客户组合诊断

`ClientProfile → SAA → Holdings Resolution → Fund Evaluations → Portfolio Evaluation → Rebalance Draft → Compliance → Recommendation`

### C 投后陪伴

`Monitoring Snapshot → Event → Client State → Contact Decision → Approved Facts → Communication Draft → Review/Send Queue`

### D 基金池维护

`Scheduled Refresh → Data Changes → Re-evaluation → Membership Decision → Impacted Portfolios → Rebalance Queue`

### E 全市场基金发现

`Universe → Data Quality → Comparable Groups → Hard Filters → Quant Ranking → Similarity → Candidate Pool → Deep Evaluation → Core Pool`

每一步必须幂等；以 `workflow_run_id + step_key + input_hash` 避免重复执行。

## 8. Event Engine

MVP 使用规则表和定时 worker：

- 权重偏离：默认目标权重 ±5%，配置化。
- 风险预算、单基金集中度、评级下降、经理变化、风格漂移。
- 客户回撤阈值、目标变化、目标收益达成。
- 季度复核与数据源异常。

Event 只触发诊断/提案，不直接产生交易。状态机：`detected → validated → action_required/no_action → proposal_created → reviewed → closed`。

## 9. 安全、权限与合规

- RBAC：Client、Advisor、Researcher、Compliance、Admin。
- Client 只能访问自己的 Profile、Portfolio、Recommendation、Report、Communication。
- 敏感字段不写普通日志；日志存 ID、哈希和脱敏摘要。
- 密钥仅在环境变量或密钥服务中；前端永不持有数据源/API 密钥。
- Recommendation 默认 `draft`；必须通过 suitability 和 compliance 状态门禁。
- 所有修改记录 actor、before/after、reason、timestamp、request_id。
- 账户删除使用可审计的软删除 + 法规允许范围内的清理流程。

## 10. 非目标

- MVP 不自动下单、不代替持牌投顾审批。
- 不做微服务、复杂多租户、Black-Litterman/Risk Parity/Monte Carlo。
- 不把 93 个 Skill 全接入；先完成 13+1 个核心能力和一条端到端生命周期。
