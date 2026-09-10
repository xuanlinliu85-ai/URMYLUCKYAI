# Fund Allocation OS｜Skill Audit

## 1. 审计基线

| 项目 | 值 |
|---|---|
| 上游仓库 | `r9412460971-cloud/OPC-skill` |
| 分支 / Commit | `main` / `e7803189a81d7f2cf927feaaeea882f4143b3430` |
| 审计日期 | 2026-08-17（Asia/Shanghai） |
| Skill 数量 | 93 |
| Python 文件 | 41；静态语法检查 0 个错误 |
| 审计范围 | 全量目录；基金投研、财富管理、OPC Agent、KYC、数据层重点逐项核对 |
| 项目关系 | 新项目；上游仓库只读，不直接改写原 Skill |

## 2. 结论先行

上游库可以作为专业方法论与局部计算代码的来源，但不能直接充当 Fund Allocation OS。它目前本质上是 93 个松耦合 Skill 的集合，缺少统一领域对象、可复现 Workflow、数据库、事件引擎、权限、审核和双端产品。

可直接利用的资产主要有三类：

1. **研究框架**：基金、经理、固收+、季报诊断、客户陪伴的分析维度较完整。
2. **确定性代码雏形**：`fund-r9alpha-evaluation`、`fund-advisor-strategy`、`fund-active-research`、`fund-diagnosis-3.10` 中存在数据抓取、指标计算、持仓分析和报告脚本。
3. **组织与合规框架**：OPC Agent 系列定义了 Research、Advisory、Compliance、Operations 的职责边界，可转成系统权限和审批队列。

关键缺口是：

- 没有全市场 `FundUniverse`、可比组、批量 Hard Filter 和 Quant Screener。
- 没有 `FundSimilarity`，无法防止核心池高度同质化。
- Skill 之间主要传递 Markdown，不传稳定、版本化的结构化对象。
- 研究、评价、推荐和客户沟通在部分 Skill 内混合，违反分层原则。
- 没有可持久化的 WorkflowRun、SkillRun、DataSource、Recommendation 审计链。
- 没有 Client Portal、Advisor Console、RBAC、Consent 与客户数据隔离。
- 上游数据默认优先级与本项目“同花顺优先”不一致，且当前会话没有暴露可调用的同花顺 MCP。

## 3. MVP 核心 Skill 适配评估

评级含义：A=代码可较直接复用；B=框架可复用、需结构化改造；C=主要是提示词/模板；D=缺失。

| Skill | 评级 | 已有能力 | 主要问题 | MVP 处理 |
|---|---:|---|---|---|
| `r9-workbench` | C | 意图路由、组合调用思路 | 文档自称 87/72 个 Skill，与实际 93 不一致；无注册表和运行日志 | 改为数据库驱动 Router，不硬编码数量 |
| `financial-plan` | C | 目标、现金流、风险规划框架 | 无 `ClientProfile` schema，无适当性规则版本 | 转成 Onboarding Workflow + 确定性评分 |
| `client-review` | C | 客户回顾清单 | 输入输出为叙述文本，无客户状态快照 | 输出 `ClientReview` 结构体 |
| `r9-fund-deep-research` | B | 深度研究与横纵比较框架 | 成本高、无统一输入，不能用于全市场逐只扫描 | 仅用于候选池，保存证据引用 |
| `fund-manager-deep-research` | B | 经理时间轴、竞品、言行一致性 | 输出超长文本，缺少标准特征和置信度 | 拆成事实提取 + 研究叙事 |
| `fund-diagnosis-3.10` | B | 季报、持仓稳定性、行业与调仓诊断；有 Python 雏形 | 分类与阈值硬编码；数据抓取未统一 | 保留算法，输入改为标准持仓快照 |
| `bond-plus-fund-evaluation` | B | 固收+收益、回撤修复、债券/权益归因 | 研究、评价、销售话术混在同一 Skill | 拆为 Research / Evaluation / Communication |
| `fund-r9alpha-evaluation` | A- | 东方财富抓取、Excel/Markdown 输出、风险与持仓字段 | 强绑定网页抓取和模板；未形成稳定 `FundEvaluation` | 抽取计算内核；数据由 Provider 注入 |
| `fund-advisor-strategy` | A- | 组合指标计算、报告脚本、且慢客户端雏形 | API 可用性未验收；策略、数据和呈现耦合 | 复用指标函数，移除数据源硬绑定 |
| `portfolio-rebalance` | C | Drift、税务与调仓原则 | 偏海外税务语境；无中国公募交易约束 | 重写为约束式提案引擎 |
| `investment-proposal` | C | 投资建议书结构 | 无 Recommendation 版本/审核状态 | 仅做模板渲染器 |
| `post-investment-companion` | B | 投后节奏、回撤沟通框架和参考资料 | 非事件驱动，无客户动态状态 | 由 Event + ClientState 驱动 |
| `fund-market-volatility-script` | C | 客群分层话术 | 可能直接生成建议，缺少批准内容边界 | 仅解释已批准的结构化结论 |
| `fund-universe-screener` | D | 不存在 | MVP 核心缺口 | 新建确定性 Engine/Skill |

## 4. 邻近能力与重复冲突

### 4.1 基金研究重复

`fund-active-research`、`r9-fund-deep-research`、`fund-r9alpha-evaluation`、`fund-diagnosis-3.10` 都会输出“值不值得买/投资建议”。应改成：

- `FundResearch`：事实、收益/风险来源、风格、经理行为。
- `FundEvaluation`：标准化评分、评级、风险旗标、适用角色。
- `FundPoolDecision`：进入/升级/降级/暂停/剔除及原因。
- `Recommendation`：在客户适当性、SAA 和组合约束后形成。

### 4.2 组合与调仓重复

`fund-advisor-strategy`、`portfolio-rebalance`、`fund-portfolio-rebalancing-launch` 均涉及调仓。后者是内容生产工具，不可进入决策链。MVP 只保留：

- `PortfolioEvaluationEngine`：确定性指标与问题识别。
- `RebalanceEngine`：触发条件、约束、候选交易清单。
- `CommunicationRenderer`：把已审核提案翻译成客户语言。

### 4.3 客户沟通重复

`post-investment-companion`、`cmb-fyf-companion-service`、`fund-market-volatility-script`、`client-review`、`client-report` 的素材可合并为模板库，但触发逻辑必须由 Event Engine 与客户状态决定。

### 4.4 Agent 定位

OPC 系列适合映射为系统角色与工作队列，不适合每个角色各自保存一套数据：

- Atlas / Research → 研究、评价、基金池提案。
- Mira / Advisory → 客户画像、SAA、组合与交付。
- Sage / Compliance → 适当性、披露、审核、审计。
- Vega / Operations → 数据任务、事件任务、报告任务、运行监控。
- Luce / CEO → Dashboard 与审批汇总，不直接计算或选基金。

## 5. 数据源审计

### 5.1 当前上游状态

- `china-market-data` 把 AKShare 设为默认首选，和本项目要求冲突。
- 多个基金脚本直接抓取东方财富网页/API，存在接口变更、反爬、字段漂移和使用条款风险。
- `fund-advisor-strategy` 含且慢 REST/MCP 客户端，但端点、权限和字段覆盖尚未验收。
- 多个 Skill 文字上提到 Wind/iFinD，却没有统一 Provider、健康检查、字段映射或缓存策略。
- 已在 `C:\Users\urmylucky\Documents\每日复盘更新` 找到既有 iFinD MCP SSE 客户端。2026-08-17 重新执行兼容性探针：19 个工具齐全，字段参考、实时样本和历史样本均通过；基金 `519702.OF` 的基本资料、规模、经理代码、业绩基准和复权净值已实测返回。

### 5.2 本项目数据优先级

| 优先级 | 数据源 | 用途 | 规则 |
|---:|---|---|---|
| P0 | 同花顺 MCP / iFinD | Universe、净值、基金经理、规模、持仓、分类、风险指标 | 首选；上线前做字段覆盖、许可与限流验收 |
| P0 | 法定披露源（基金公司、证监会/基金业协会、交易所、巨潮等适用来源） | 公告、定期报告、经理变更、合规事件 | 事实冲突时作为原始证据优先 |
| P1 | 用户提供的持牌数据文件 | 补充专业字段 | 保存文件哈希、口径、as-of |
| P2 | Wind/Choice/且慢（已获授权时） | 交叉验证或补缺 | 必须经 Provider 接入，不得散落调用 |
| P3 | Tushare/AKShare | 开发、回退、低敏公共数据 | 标记为降级源，不能静默替换 |
| P4 | 东方财富等公开网页 | 最后回退与原型验证 | 必须标明非主源和抓取时间 |

所有数据写入 `DataSourceSnapshot`：provider、dataset、field、source_timestamp、ingested_at、license_scope、quality_status、raw_hash、request_id。字段缺失返回 `missing`，禁止补猜。

## 6. 可复用代码清单

| 上游资产 | 可复用部分 | 处理方式 |
|---|---|---|
| `fund-r9alpha-evaluation/scripts/eastmoney_fetcher.py` | 基金字段映射、净值/持仓抓取经验 | 仅作为回退 Provider 参考；增加超时、重试、契约测试 |
| `fund-r9alpha-evaluation/scripts/generate-fund-evaluation.py` | 指标整理、底稿生成 | 拆出纯函数；输入改为 canonical DTO |
| `fund-advisor-strategy/scripts/fund_analysis.py` | 收益、波动、回撤、Sharpe、组合分析 | 迁入 Calculation Engine 并补单元测试 |
| `fund-active-research/scripts/*analyzer.py` | 持仓历史、调仓、同类对比算法 | 复核定义后复用，不保留网页耦合 |
| `fund-diagnosis-3.10/fund_diagnosis.py` | 诊断数据结构与规则雏形 | 阈值配置化；行业分类改为版本化映射 |
| `r9-opc-memory` | 归档、索引与追踪思路 | 不复用本地文件记忆；迁移到数据库审计模型 |
| 报告生成脚本 | Word/PDF/Excel 版式经验 | 后置为 Renderer，不进入决策计算 |

41 个 Python 文件静态语法均通过，但仓库没有覆盖上述金融计算的统一测试套件；“可编译”不代表口径正确。

## 7. 完整 Skill Inventory（93）

### 基金、财富管理与客户服务（25）

`bond-plus-fund-evaluation`, `bond-plus-tracker`, `client-report`, `client-review`, `cmb-fyf-companion-service`, `community-voc-analysis`, `financial-plan`, `fund-active-research`, `fund-advisor-strategy`, `fund-diagnosis-3.10`, `fund-manager-deep-research`, `fund-market-volatility-script`, `fund-phone-sales`, `fund-portfolio-rebalancing-launch`, `fund-r9alpha-evaluation`, `fund-sales-rookie`, `investment-proposal`, `optical-module-tracker`, `portfolio-rebalance`, `post-investment-companion`, `r9-fund-deep-research`, `tax-loss-harvesting`, `kyc-doc-parse`, `kyc-rules`, `nav-tieout`.

### OPC 组织、路由与基础设施（24）

`audit-xls`, `china-market-data`, `clean-data-xls`, `competitive-analysis`, `ppt-template-creator`, `pptx-author`, `r9-opc-advisory`, `r9-opc-advisory-content`, `r9-opc-advisory-delivery`, `r9-opc-advisory-strategy`, `r9-opc-advisory-success`, `r9-opc-ceo`, `r9-opc-compliance`, `r9-opc-memory`, `r9-opc-operations`, `r9-opc-research`, `r9-opc-research-asset`, `r9-opc-research-fund`, `r9-opc-research-macro`, `r9-opc-research-portfolio`, `r9-opc-research-sector`, `r9-workbench`, `skill-creator`, `xlsx-author`.

### 权益研究、内容与通用研究（17）

`catalyst-calendar`, `daily-market-hotspot`, `earnings-analysis`, `earnings-preview`, `hv-analysis`, `idea-generation`, `initiating-coverage`, `khazix-writer`, `model-update`, `morning-note`, `sector-overview`, `static-page-builder`, `thesis-tracker`, `weibo-finance-daily`, `3-statement-model`, `comps-analysis`, `dcf-model`.

### 投行、私募、运营与其他（27）

`accrual-schedule`, `ai-readiness`, `break-trace`, `buyer-list`, `cim-builder`, `datapack-builder`, `dd-checklist`, `dd-meeting-prep`, `deal-screening`, `deal-sourcing`, `deal-tracker`, `deck-refresh`, `gl-recon`, `ib-check-deck`, `ic-memo`, `lbo-model`, `merger-model`, `pitch-deck`, `portfolio-monitoring`, `process-letter`, `returns-analysis`, `roll-forward`, `strip-profile`, `teaser`, `unit-economics`, `value-creation-plan`, `variance-commentary`.

## 8. Phase 0 门禁结论

可以进入 Phase 1，但必须满足以下约束：

1. 不把上游 Skill 直接暴露给前端。
2. 先定义 canonical schemas，再接 Skill。
3. 同花顺 Provider 已接入；继续补齐 Universe 质量门禁、基金持仓/经理任期字段验收和契约测试。
4. 全市场筛选器从确定性批量计算开始，不调用 LLM 扫全市场。
5. 所有建议默认 `draft`，未经合规/人工审核不得成为正式客户输出。
