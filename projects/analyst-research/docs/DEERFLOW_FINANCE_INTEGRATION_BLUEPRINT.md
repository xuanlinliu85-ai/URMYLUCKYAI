# DeerFlow Finance × 现有 Codex 项目整合蓝图

Audit date: 2026-09-09  
Scope: Codex 中现有 8 个项目、已安装金融 Skills、`DEERFLOW_FINANCE_INSTALL_PACK_V3_0.md`  
Status: integration design ready; DeerFlow repository and V3 ZIP pending

## 总控结论

当前系统已经具备安装包所覆盖的三类核心能力：每日复盘、财报研究、分析框架综合。当前效率瓶颈来自能力按项目分散、多个路由器职责重叠、研究与输出引擎边界模糊。

目标形态采用“一个生产中枢 + 一套能力注册表 + 多个专项引擎”：

```text
用户 / 定时任务
        ↓
DeerFlow Finance Lead（唯一生产编排器）
        ↓
Capability Registry（按能力路由）
        ├─ 数据：iFinD + Web + 官方一手来源
        ├─ 研究：Mikko 主框架 / 分析师天团 / MATT
        ├─ 专项：每日复盘 / 财报 / 基金 / 催化剂 / 论点跟踪
        └─ 输出：公众号 / 一图流 / PPT Factory
```

Codex 负责开发、测试、升级与质量门禁；DeerFlow 负责日常生产运行、调度、上下文与产物管理。

## 现有项目的正式定位

| Codex 项目 | 正式定位 | 进入 DeerFlow 的方式 | 优化动作 |
| --- | --- | --- | --- |
| 分析师天团 | 多框架研究库和路由器 | `analyst-dream-team-router` | 作为多框架问题的唯一路由器 |
| MIKKO+KEVIN | 个人默认宏观研究操作系统 | `mikko-kevin-research-system` | 用于“按我的框架”与宏观到资产的主链分析 |
| 叙事判断 | A 股主题与公司执行镜头 | `urmylucky-narrative-judgment` | 用于 payer、预算、订单、估值、反证和执行条件 |
| 每日复盘更新 | A 股数据管道与市场快照产品 | `market-daily-review` 的底层服务 | 保留现有数据更新脚本、归因规则、快照和网站 |
| 财报PPT计划 | 财报研究素材、图像与成品生成工作区 | `earnings-analysis` + 输出适配器 | 将研究合同与视觉产物分层保存 |
| PPT | 独立 PPT 渲染与 QA 引擎 | artifact adapter | 接收标准 Research Artifact，继续保持唯一 PPT 编排器 |
| 基金经理 | 基金数据接入与研究原型 | `fund-research` 候选模块 | 补齐 README、输入输出合同、数据口径与测试 |
| AA20 | 独立娱乐产品 | 独立运行 | 保持与金融研究系统的权限和依赖边界 |

## V3 安装包三个 Skill 的处理决策

### `market-daily-review`

定位为编排层，调用“每日复盘更新”已有能力。现有项目继续持有数据拉取、分类、快照、网站和历史结果。Skill 负责交易日确认、数据质量门禁、市场时间线、催化与反证、产物路由。

### `earnings-research`

将安装包中的“最大预期差”规则合并到已安装的 `earnings-analysis`，并复用 `fundamental-review`。系统保留一个财报入口，内部通过标准合同区分 Actual、Consensus Gap、Guidance、Reaction、Thesis Impact。

### `analyst-consensus`

其职责与 `analyst-dream-team-router` 重合。正式实现采用已有 Router 作为唯一框架选择器，并将 Claim / Mechanism / Variables / Assumptions / Horizon / Evidence / Falsification 作为 Router 的统一综合合同。安装时使用同名兼容别名时，别名直接委托 Router。

## 唯一的能力分层

| 层 | 负责内容 | 正式资产 |
| --- | --- | --- |
| Data | 数值、时间、口径、来源、原始证据 | iFinD MCP、官方数据、Web |
| Research | 框架、机制、情景、证伪 | Mikko、分析师天团、MATT、财报研究 |
| Decision | 时间范围、置信度、观察点、失效条件 | Finance Lead |
| Artifact | 可复用中间产物 | `RESEARCH_ARTIFACT.json` |
| Presentation | 公众号、一图流、PPT、网站 | 输出适配器 |

研究层产出同一份 Research Artifact，各输出引擎直接消费该产物。这使公众号、一图流和 PPT 共享同一组事实、结论和来源。

## 标准 Research Artifact

```json
{
  "artifact_version": "1.0",
  "as_of": "ISO-8601 with timezone",
  "scope": {},
  "source_manifest": [],
  "facts": [],
  "data_quality": {},
  "expectation_gaps": [],
  "frameworks_used": [],
  "mechanisms": [],
  "scenarios": [],
  "conclusion": {},
  "watchpoints": [],
  "falsifiers": [],
  "output_hints": {}
}
```

## 三条高价值生产流

### A 股收盘复盘

```text
调度 → 交易日门禁 → iFinD/备用数据 → 数据 QA
→ market-daily-review → 分析师天团（按需） → MATT（按需）
→ Research Artifact → 公众号 / 一图流 / 复盘网站
```

### 财报研究

```text
公司公告与电话会 → iFinD 一致预期 → 财年与口径 QA
→ earnings-analysis → fundamental-review
→ Mikko/分析师天团/MATT（按问题路由）
→ Research Artifact → 财报更新 / PPT / 一图流
```

### 基金跟踪

```text
净值、持仓、披露与经理言论 → 数据 QA
→ 风格和业绩归因 → thesis-tracker + catalyst-calendar
→ Research Artifact → 周报 / 月报 / 客户沟通材料
```

## 工作效率的根因优化

1. **固定单一生产入口**：日常金融任务从 DeerFlow Finance Lead 进入，项目名称只用于维护资产。
2. **按能力路由**：Skill 声明需要的“分钟行情、一致预期、财务报表”等能力，Tool Layer 选择实际工具。
3. **固定事实截止时间**：每个任务开始时写入时区、交易日、`as_of`、频率与复权口径。
4. **一次研究，多端输出**：研究完成后冻结 Research Artifact，后续格式转换继承该产物。
5. **一个框架选择器**：分析师天团 Router 负责多框架路由；Mikko 和 MATT 作为明确领域的可选镜头。
6. **建立产物级 QA**：数据 QA、研究 QA、格式 QA 分层运行，每层生成结果与失败原因。
7. **保持独立产品边界**：PPT Factory、MATT 网站、每日复盘网站继续独立部署，DeerFlow 通过合同调用它们。
8. **建立版本基线**：分析师天团仓库先形成初始可追溯提交，后续整合按里程碑提交。

## 实施顺序

### Phase 0 — 冻结基线

- 为“分析师天团”建立首个 Git 基线提交。
- 确认每个 Skill 的源目录和安装目录。
- 使用 `config/finance-capability-registry.json` 作为整合清单。

### Phase 1 — 建立 DeerFlow 生产底座

- 将 DeerFlow 建成独立 Codex 项目，项目名使用“金融研究中枢”。
- 保留 upstream，在 custom/config/knowledge 扩展点实现金融能力。
- 确认 Sandbox、Memory、Web、Python 和调度链路。

### Phase 2 — 连接真实 iFinD MCP

- 发现 transport、工具名、输入 schema、返回 schema、权限与超时。
- 将真实工具映射到能力注册表。
- 对行情、分钟数据、财报、一致预期和基金数据运行 Smoke Test。

### Phase 3 — 合并三个核心 Skill

- 接入 `market-daily-review`。
- 将 `earnings-research` 规则合并到正式财报入口。
- 将 `analyst-consensus` 合并到分析师天团 Router 的综合合同。
- 运行 Trigger Evals 和端到端案例。

### Phase 4 — 打通产物链

- 落地 `RESEARCH_ARTIFACT.json` schema。
- 打通公众号、一图流、PPT Factory 和复盘网站。
- 增加 08:00 隔夜、11:35 午盘、15:10 收盘和周报调度。

## 验收门禁

- 输出带有完整 `as_of`、来源、口径和数据 QA 状态。
- 分钟数据能力由真实工具 schema 证明。
- 一致预期保留来源、样本和截止时间。
- Router 默认选择 1–3 个互补框架。
- 同一件事实在公众号、一图流和 PPT 中保持一致。
- 输出引擎只转换产物，研究层统一管理结论变更。
- 每个定时任务保存执行记录、输入版本、产物版本和失败原因。

## 当前阻塞项

1. 下载目录中只有 `DEERFLOW_FINANCE_INSTALL_PACK_V3_0.md`，`DEERFLOW_FINANCE_SKILLS_V3_0.zip` 尚未进入本地文件系统。
2. Codex 项目列表中尚未建立 DeerFlow 仓库项目。
3. iFinD 的真实 MCP schema 需要在 DeerFlow 环境中完成能力发现。
4. “分析师天团”仓库当前处于零提交状态，全部文件为未跟踪文件。

