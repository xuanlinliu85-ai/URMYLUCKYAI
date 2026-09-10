# MACRO_REUSE_INVENTORY

> 依据：`DEERFLOW_FINANCE_MACRO_HIGH_FREQ_MONITOR_V1_0`（Implementation Spec，54 节）
> 生成日期：2026-09-10
> 状态：**Inventory 完成，等待实施许可**
> 原则：Search before create / Extend before duplicate / Config before code / Existing owner before new owner

---

## 0. 三项已定决策

| 决策项 | 结论 | 影响 |
|---|---|---|
| 项目归属 | **挂进 `Documents/每日复盘更新`** | 符合 DeerFlow Finance V3.1 已确立的 singleOwner 原则——该项目是唯一市场数据 owner |
| 图表方案 | **引入 ECharts** | 承认它是**第一个**图表库，不是第二个（实测现为零图表库） |
| 调度入口 | **WorkBuddy 定时任务** | 工作日收盘后触发；仓库内不新增任何 scheduler 代码 |

---

## 1. 前置事实：合并层已存在

`Documents/ChatGPT/公众号炼化/` 中已有 **DeerFlow Finance V3.1** 完整集成成果：

- `config/finance-capability-registry.json` 的 `singleOwners` 已为每个能力指定唯一 owner
- 八项目分工已定型：分析师天团 = 唯一路由；**每日复盘更新 = 唯一市场数据 owner**；财报 = canonical `earnings-analysis`；PPT = artifact 消费端
- `RESEARCH_ARTIFACT` 1.0.0 协议已通过验证（market 13 facts / earnings 111 facts）
- DeerFlow 2.0 本体位于 `Documents/DeerFlow`，`skills/public` 含 20 个通用 skill

**结论：本模块不需要新建任何"合并层"。** Spec 第 52 节的原则与 V3.1 是同一套哲学，本模块是其延续。

---

## 2. 能力复用清单（Spec §43 主表）

| 能力 | 现有位置 | 是否复用 | 是否需要修改 |
|---|---|---|---|
| Skill 发现 / 编排 | `Documents/DeerFlow`（DeerFlow 2.0） | YES | 否，新增 skill 目录即可 |
| 能力注册 | `公众号炼化/config/finance-capability-registry.json` | YES | 新增 1 条 macro owner 条目 |
| MCP Client | `每日复盘更新/scripts/ifind-mcp-client.mjs` | YES | 否（已含 `runIfindCompatibilityAudit`） |
| 数据源封装 | `每日复盘更新/scripts/ifind-primary-source.mjs` | YES | 否（`createIfindPrimarySource()` 可直接复用） |
| 现有采集主脚本 | `每日复盘更新/scripts/update-snapshots.mjs`（63KB） | YES | **否**，宏观另起脚本，不污染 A 股链路 |
| Knowledge Store | `每日复盘更新/db/schema.ts`（drizzle + SQLite/D1） | YES | **新增 1 张表** |
| 迁移机制 | `每日复盘更新/drizzle/` | YES | 追加 1 个迁移文件 |
| Stats / 标准化 | `update-snapshots.mjs` 内 `standardize()` | 部分 | 抽为共享 util（最小改动） |
| Chart | **不存在** | NO | **新增 ECharts**（首个图表库） |
| Dashboard | `每日复盘更新/app/page.tsx`（446 行单页） | YES | 新增 route + 面板组件 |
| Research Artifact | `每日复盘更新/artifacts/RESEARCH_ARTIFACT.*.json` | YES | **扩展** `task_type`，不新建协议 |
| API 路由 | `每日复盘更新/app/api/{kline,market,refresh}` | YES | 新增 1 个 macro 只读路由 |
| Scheduler | **不存在**（仅 `scripts/*.ps1` 手工脚本） | NO | 由 WorkBuddy 定时任务承担，仓库内零代码 |
| 消息 / PPT / 公众号 | 现有 artifact 消费链 | YES | 不改，只增消费类型 |

---

## 3. 三处实测缺口与处置

> 这三处是 Spec 假设存在、实测不存在的真实空位。**本模块的真实工作量主要在这里，而非 60 个指标配置。**

### 缺口 1：无时序存储

- **现状**：`db/schema.ts` 仅 4 张表——`source_snapshots` / `rank_rows` / `pipeline_runs` / `refresh_requests`，全部是「每日一次截面 + 榜单」导向
- **Spec 第 25 节假设**：「已有通用时序表 → 增加 `indicator_id` 即可」→ **不成立**
- **处置**：在 `db/schema.ts` 内**追加** `macroObservations` 表（同一文件扩展，不新建 schema 文件）
- **字段**：`indicatorId` / `observationDate` / `releaseDate` / `fetchedAt` / `value` / `frequency` / `source` / `sourceField` / `versionHash`
- **唯一约束**：`unique(indicatorId, observationDate, releaseDate)` —— 允许宏观数据修订产生多 vintage，但禁止月度数据被每日重复写入
- **索引**：`index(indicatorId, observationDate)`
- **master 表不建**：指标主数据由 `indicator_registry.yaml` 承担（符合 Spec §17），少一张表

### 缺口 2：零图表库

- **现状**：`app/page.tsx` 中 K 线为手写 `<canvas>` 2D 绘制；涨跌分布用 CSS 高度条
- **Spec 第 24 节假设**：「复用已有 ECharts/Plotly/Recharts/Highcharts 之一，禁止装第二套」→ **前提不成立，该约束为伪约束**
- **处置**：引入 **ECharts**，按需引入 `bar` / `line` / `heatmap` / `visualMap` 组件
- **收益**：Spec §24 要求的热力图 + 可视化映射、§22.3 的宏观热力图、§22.4 高频趋势图可直接落地
- **边界**：现有 canvas K 线**保持不动**，不做迁移（避免扩大故障域）

### 缺口 3：无调度器

- **现状**：无 `cron` / `node-cron` / `APScheduler`；仅 `scripts/update-local-review.ps1`、`scripts/start-local-review.ps1` 两个手工脚本
- **Spec 第 26 节假设**：「加入现有 Daily Review Scheduler」→ **不成立**
- **处置**：由 **WorkBuddy 定时任务**承担触发，工作日收盘后执行
- **仓库内零新增**：不写任何 scheduler 代码，只暴露一个可被调用的入口脚本
- **任务划分**（Spec §26 的 job 定义映射为自动化任务）：
  - `macro_market_daily` —— 日频市场（利率/汇率/商品/指数）
  - `macro_release_check` —— 按发布日历判断官方宏观是否需刷新（Spec §27：不每日无脑全量拉取）
  - `macro_snapshot_daily` —— 生成 macro snapshot

---

## 4. 新增文件清单

> Spec RULE 10：每个新文件必须说明现有文件为何无法承载该职责。

| 新文件 | 职责 | 为何现有文件不能承载 |
|---|---|---|
| `skills/macro-high-frequency-monitor/SKILL.md` | 唯一运行时 Skill（Spec §31） | 现有 `market-daily-review` skill 边界是 A 股复盘，宏观语义完全不同 |
| `.../references/indicator_registry.yaml` | 指标语义 + 频率 + 变换 + 信号方向 | 硬编码进 SKILL.md 会违反 Spec §32 |
| `.../references/signal_rules.yaml` | 数值阈值配置化 | 同上；Spec §18 明确禁止把规则写进 Prompt |
| `.../references/interpretation_framework.md` | 解读框架 | 与数值配置分离，便于单独迭代 |
| `scripts/macro-probe-fields.mjs` | 字段探针（一次性） | 需独立产出可用性矩阵，混入主链路无法单独重跑 |
| `scripts/macro-collect.mjs` | 宏观采集 + 落库 | `update-snapshots.mjs` 已 63KB 且服务 A 股收盘链路，混入会放大故障域 |
| `scripts/macro-snapshot.mjs` | 六维评分 + snapshot 产出 | 同上，且 Spec §40 要求独立 snapshot 契约 |
| `app/monitor/macro/page.tsx` | 宏观首页（Spec §22 五块） | `app/page.tsx` 已是 446 行 A 股单页，混入会破坏既有边界 |
| `app/monitor/macro/components/*.tsx` | 面板组件（Pulse / Movers / Heatmap / Charts / Brief） | 图表逻辑与页面骨架分离 |
| `app/api/macro/route.ts` | 宏观只读 API | 现有 3 个路由职责已固定 |
| `drizzle/0002_macro_observation.sql` | 迁移 | drizzle 机制要求独立迁移文件 |

**不新增**（Spec §49 禁止清单）：`macro_app/` `macro_backend/` `macro_scheduler/` `macro_database/` `macro_chart_engine/`

---

## 5. 字段探针计划（对调 Spec 执行顺序）

**修正**：Spec §45 为 `STEP 4 创建 registry → STEP 5 解析字段`，**建议对调**。

**理由**：账号已知存在权限边界（财报前一致预期历史快照、基金实时估值均受限）。L2 层 24 个高频候选指标「理论上有用」≠「账号内有」。先写 registry 再发现一半不可用，配置将全部作废。

**探针输出**：每个候选指标标注

```
AVAILABLE / PERMISSION_LIMITED / NO_FIELD / NEEDS_ALT_FIELD
```

**流程**（Spec §6）：

```
indicator name → lookup_field_reference → 候选字段 → get_guide（必要时）
→ 实测查询 → 写入 registry（verified: true / verified_at）
```

**未验证字段**一律 `verified: false` + `status: FIELD_LOOKUP_REQUIRED`。

**禁止**推测 iFinD 字段代码。

**优先级**（Spec §48）：先跑 LP1/L3 那 20 个路径明确的，再探测 L2。

---

## 6. 本模块边界（Spec §2）

**负责**：宏观指标体系 / 高频指标定义 / 指标方向 / 频率与新鲜度 / 标准化 / 变化率 / 宏观信号 / 异常识别 / 状态解释

**不负责**：网页框架 / 数据库底层 / 定时器 / 通用图表组件 / iFinD SDK 重写 / 新闻搜索 / PPT 生成 / 公众号排版

---

## 7. V1 不做什么（Spec §46）

复杂 GDP Nowcast、自动交易、组合优化、预测股市涨跌、大量 Sub-Agent、独立宏观数据库平台、新 BI 平台、新 Workflow Engine、新图表系统、新消息系统、新 Scheduler。

**Sub-Agent 默认不用**（Spec §35）：V1 走 `Lead Agent + 数据 Artifact + 一次综合解释`。仅专题研究（如"地产是否信用周期反转"）才并行。

---

## 8. V1 验收清单（Spec §42 / §50）

**数据**
- [ ] 所有 iFinD 字段 `verified` 有据，无猜测字段
- [ ] 日/周/月/季频率区分正确
- [ ] `observation_date` 与 `fetched_at` 分离
- [ ] 无虚假 forward-fill 写库
- [ ] 新鲜度状态正确（`FRESH`/`EXPECTED`/`STALE`/`MISSING`/`ERROR`）

**架构**
- [ ] 未新增 scheduler / MCP client / dashboard app / chart engine
- [ ] 未重复 Research Artifact 协议
- [ ] 只有一个宏观主 Skill

**页面**
- [ ] 浅色简约、中文清晰、手机可读
- [ ] 首屏可判断宏观方向、非数据墙
- [ ] 每张图有最后更新时间

**研究**
- [ ] AI 不计算 zscore / percentile / change
- [ ] AI 只解释结构化 signal
- [ ] 结论可回溯到 observation
- [ ] 异常才触发深度研究（`RESEARCH_CANDIDATE`）

**Smoke Test**（Spec §50，14 项 + 汇报一致性 1 项 + 可视化面板 1 项 = 16 项）
重点：TEST 04（月度数据不每日复制）、TEST 08（不重复拉取落库）、TEST 09（Dashboard 与 raw data 对账）、TEST 12（普通行情查询不误启动宏观链路）

---

## 9. 待确认后即可开工

Step 1 → 字段探针（`lookup_field_reference` 批量）
Step 2 → 输出 `IFIND_FIELD_MAPPING.md` + 可用性矩阵
Step 3 → 据矩阵反写 `indicator_registry.yaml`
Step 4 → 扩展 `db/schema.ts` + 迁移
Step 5 → `macro-collect.mjs` 采集落库
Step 6 → `macro-snapshot.mjs` 六维评分
Step 7 → ECharts 面板接线
Step 8 → `macro-high-frequency-monitor/SKILL.md`
Step 9 → 注册 WorkBuddy 定时任务
Step 10 → Smoke Test

**最终产出**：`IMPLEMENTATION_REPORT` / `IFIND_FIELD_MAPPING` / `TEST_REPORT` / 未解决权限清单

---

## 10. 执行进度（2026-09-10 更新）

| Step | 状态 | 产出 |
|---|---|---|
| 1 字段探针 | ✅ 完成 | 5 轮模糊检索 + 3 轮区段扫描，**49/70 指标实测可得** |
| 2 字段映射 | ✅ 完成 | `docs/IFIND_FIELD_MAPPING.md`（含参数契约与踩坑记录） |
| 3 指标注册表 | ✅ 完成 | 已写入 `Documents/DeerFlow/skills/custom/macro-high-frequency-monitor/references/` |
| 3b 信号规则 | ✅ 完成 | `signal_rules.yaml`（六维权重标记 DRAFT，未回测） |
| 3c 运行时 Skill | ✅ 完成 | `SKILL.md`（唯一 1 个，未拆分） |
| 4 数据库扩展 | ✅ 完成 | `db/schema.ts` 追加 `macroObservations`（含 vintage 唯一约束） |
| 5 采集脚本 | ✅ 完成 | `scripts/macro-collect.mjs`（支持 full/daily/release 三种模式 + 增量合并） |
| 6 评分与信号 | ✅ 完成 | `scripts/macro-snapshot.mjs`（纯代码算 z/分位/维度分/异常/背离） |
| 7 工作台前端 | ✅ 完成 | `scripts/macro-workbench.mjs` + `app/monitor/macro/page.tsx` + `public/macro-workbench.html` |
| 8 定时任务 | ✅ 完成 | WorkBuddy 两条自动化（日频 16:40 / 发布刷新 09:40），仓库内零 scheduler 代码 |
| 9 Smoke Test | ✅ 完成 | `scripts/macro-smoke-test.mjs`，**18/18 通过** |
| 10 实施报告 | ✅ 完成 | `docs/MACRO_IMPLEMENTATION_REPORT.md` |
| 11 期货全品种产业链 | ✅ 完成 | `references/futures_chains.yaml`（7 链 61 品种，60 可用）+ `scripts/macro-main-contract.mjs` + `scripts/macro-futures.mjs` |
| 12 每日汇报生成器 | ✅ 完成 | `scripts/macro-report.mjs` → `public/macro-daily-report.md`（20 章节）+ `work/macro/report.json`（工作台面板） |
| 13 可视化与宏观市场层 | ✅ 完成 | 汇报新增宏观 8 章（利率/权益汇率/货币信用/增长/通胀/地产/消费外需/全指标总表）；快照新增 `indicators` + `categories` 块；工作台新增「宏观市场走势」4 图 + 「宏观基本面走势」6 图 + 「宏观指标总表」72 项（含 SVG 迷你走势） |
| 14 入口 · 渲染健壮性 · 交互 | ✅ 完成 | 首页侧边栏 + 顶栏入口指向 `/monitor/macro`；20 张图全渲染（修 `var` 提升陷阱 + ECharts 0×0 容器，加 `chartSelfCheck` 兜底）；补「异动一览」背离条形图与「主力价差走势」（快照价差新增 `points`）；全图表加 dataZoom 缩放/平移/存图 + 榜单表格行点击联动到走势图；重建 `dist/`（含宏观资源与路由）；`build/sites-vite-plugin.ts` 改内容比对避免批量删除保护砸掉 `dist/client` |

### 实施期新增的事实（覆盖上一轮记录）

1. **注册表实际可采集 69 项**（不是 49 项）——上一轮的 49 是探针阶段口径，反写注册表时补入了同期段发现的分项。
2. **新增 `MKT_CGB_3Y`（`L001618297`）**：信用利差公式引用的减数基准，此前只写在公式文本里、不是独立指标，已补为正式条目并实测。
3. **实修两处真实缺陷**：
   - HQ 价格序列的 `0` 是「当日无成交」哨兵，此前被当有效值 → 动力煤主力（已停更）被误判为 FRESH；现按 null 处理。
   - 注册表使用 `higher_is_looser`，但 `signal_rules.yaml` 的 `direction_semantics` 未登记该标签 → M2 / 社融 / 社融增量 被静默排除出评分；现补齐 7 个方向标签的 polarity 定义。
4. **热力图改「维度内局部索引」**：原全局索引导致每行只占横轴一段、大片空洞。
5. **交易所后缀勘误**：郑商所是 `.CZC`（手册写 `.ZCE` 有误）；广期所手册未记载，实测 `.GFE`。
6. **主力连续合约不复权**：`XX00` 会卡在僵尸合约，且换月当日产生假跳空（甲醇实测假涨 +11.75%）。
   期货层改为解析真实主力月份合约 + 等比复权拼接；**宏观层的 9 个品种仍沿用 `RB00` 连续**，两层刻意分开。
7. **期货层不参与六维评分**：避免同一变量在宏观层与产业链层双重计数。同一 `field_code` 只请求一次，按 `M|` / `F|` 分组分发。
8. **`var` 提升陷阱会一次性打断整页渲染**：`PALETTE` / `MKT_CHARTS` 声明在脚本中部，而更早的面板就调用了折线绘制函数 → `undefined` 抛 TypeError → 后面 12 个面板全部空白且无可见报错。声明必须提到脚本顶部；Check 17 已做静态复检。
9. **`npm run build` 在 Windows cmd 下直接失败**（脚本带 `WRANGLER_LOG_PATH=... ` Unix 前缀），须用 `WRANGLER_LOG_PATH=.wrangler/wrangler.log npx vinext build`。
10. **`dist/.openai` 的整目录递归删除会触发沙箱批量删除保护**，且 `closeBundle` 对每个构建环境各跑一次、必然触发；触发时 `dist/client` 已被清空。插件已改为内容比对 + 覆盖写入。

### 探针产出的关键事实

1. **可用率 70%**（49/70）。Spec §47 的 V1 下限（20 官方市场 + 10 高频 + 6 维 + 1 热力图 + Top10 + Daily Brief）已满足且有余量。
2. **区段扫描是本次最重要的方法发现**：`lookup_field_reference` 模糊检索召回质量差，但 EDB 指标 ID 按区段连续分配。先找锚点再扫区段，单次把可用指标从 26 项提升到 49 项。
3. **郑商所期货后缀实测为 `.CZC`**，手册记载的 `.ZCE` 全部返回 `-4210`。
4. **EDB 返回值自带 `time`（观测期）与 `rtime`（发布时刻）** —— 原生满足 Spec §12/§14 的 vintage 分离要求，无需自行推导。
5. **盈利预测一致预期不可用**：手册明示 `ths_west_*` / `ths_pred_*` 均 `-209`。⚠️ 与既有认知冲突，**「预期差」不得作为 V1 设计前提**。
6. **6 项第三方高频数据判为 `NO_FIELD`**：高炉开工率、轮胎开工率、30 城成交、土地成交、票房、地铁客运 —— iFinD EDB 不覆盖。
7. **4 项总量指标 ID 待补**：固定资产投资、制造业投资、基建投资、新增人民币贷款。已确认其分行业子项所在区段，总量 ID 应紧邻。

