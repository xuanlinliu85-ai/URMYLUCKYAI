---
name: canghai-yitugou-analyst
description: >-
  Use the “沧海一土狗” analytical framework to analyze China/US macro, liquidity, PPI, interest rates, Treasury issuance, Fed/Treasury interaction, gold, oil, USD, cross-border capital, A-share style, AI capex, property and asset allocation. Trigger when the user asks for 沧海一土狗视角、制度/剩余价值/流动性/市场摩擦H分析、宏观资产映射，或要求把最新市场事件按该博主的方法论拆解。 Do not imitate the author's prose or reproduce full articles; reconstruct the analytical method, verify current facts with fresh data, and always state falsification conditions.
---

# Corpus Status

`STABLE_ANALYST_DNA` — Corpus Grade A，DNA/Corpus/Skill v3.0.0。

证据窗口为 2023-06-17 至 2026-08-29：发现 280 篇，可核验正文 75 篇，长文 66 篇，覆盖 13 个季度。调用时长期 DNA 与最近观点分离；短文和标题索引只承担时间线权重。


# 沧海一土狗分析引擎

把作者文章视为“分析框架语料”，不是实时事实数据库，也不是文风模仿器。

## 固定原则

1. 先加载 `references/framework.md`。
2. 需要引用长期 DNA 规则时，加载 `../../../data/analysts/canghai-yitugou/analysis/DNA_V3.md`。
3. 涉及作者历史观点或框架演化时，加载 `references/source-map.md` 和 `references/framework-evolution.md`。
4. 涉及新增文章结构化时，加载 `references/article-schema.json`。
5. 所有实时市场结论重新查询最新数据；历史文章中的价格、利率、政策状态只作为当时语境。
6. 明确区分：`作者框架`、`当前事实`、`综合推演`。
7. 每条长期 DNA 规则保留 supporting articles、contradictions、quarters seen、weighted support 和 confidence。
8. 保存标题、时间、来源、摘要、核心命题、因果链、反证条件和必要的极短摘录。

## 固定分析顺序

### 1. 制度目标 R
判断当前政策和制度试图解决什么：稳增长、降融资成本、化解债务/金融风险、产业升级、扩消费、去地产杠杆、维护货币体系、改变资本市场融资/投资功能。

### 2. 硬约束
中国优先：PPI、汇率与跨境资本、银行息差、房地产、地方财政、社融/信用、央行数量条件。
美国优先：通胀与就业、Fed利率、Fed资产负债表/准备金/RRP、Treasury发行/回购/TGA、2Y/10Y/30Y、美债期限溢价、财政信用、美元、私人部门Capex。

### 3. 拆分价格与数量
禁止只写“流动性宽松/紧缩”。
价格：政策利率、国债、信用利率、实际利率。
数量：准备金、央行资产负债表、TGA、RRP、银行信用、社融。
允许出现加息+扩表、降息+缩表、高利率+宽金融条件、低利率+弱信用。

### 4. 财政与期限结构 F
美国问题必须额外判断：
`赤字 → 发债规模 → 短债/长债结构 → 承接能力 → 期限溢价 → 长端利率 → 资产估值`
不要把长债完全解释成Fed。

### 5. 剩余价值与部门利益 S
问：谁获得定价权？谁承担成本？谁被允许拥有更高利润率？PPI变化把利润转移给上游、制造、消费还是科技？基建/公用事业是在实现利润，还是承担全社会降成本功能？

### 6. 资本开支 C
重点看AI/数据中心、芯片、光通信、存储、电力、电网、冷却、制造设备、基建、地产。
AI拆成两个阶段：短期Capex/融资/就业/需求/中性利率；中长期生产率/单位劳动成本/潜在供给。

### 7. 市场状态 H
H是“基本面进入价格的传导状态”。考虑：杠杆、成交集中度、ETF/被动资金、公募仓位、资金抱团、IPO/再融资/减持制度、锁定期、交易成本、做市/流动性、监管、波动率、风格拥挤。
提醒：基本面正确，不代表买点正确。

### 8. 资产映射 P
依次映射短端利率、长端利率、汇率、原油/商品、黄金、股票指数、股票风格与产业链、房地产、高波动资产。

### 9. 反证条件
每个核心结论必须写出：`出现什么数据，就说明这个判断需要降低置信度或推翻。`
至少给出一个第一反证指标。

## 推荐输出

1. 一句话结论（最多两句）。
2. 作者框架：说明本题调用R/M/F/S/C/H/P哪些模块。
3. 当前事实：只写最新数据与政策状态，标注日期和来源。
4. 因果链：`制度 → 财政/货币 → 利益分配 → Capex → H → 资产价格`。
5. 资产影响：只展开用户真正关心的资产。
6. 第一反证条件。
7. 与传统框架的差异：有必要时说明为何不同于“经济强弱/降息涨黄金/美债=美元”等简单叙事。

## 关键禁令

- 不模仿作者措辞或人格。
- 不把作者历史预测包装成当前预测。
- 不用单一宏观数据解释全部资产。
- 不把政策利率等同于金融条件。
- 不把美元和美债视为同一信用资产。
- 不把相关性当因果。
- 不在无最新数据时给出“截至今天”的数值。
- 不隐藏冲突证据。
