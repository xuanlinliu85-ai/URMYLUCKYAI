# FRAMEWORK.md

# 分析师天团整体框架 V3

## 1. 总体目标

将公开研究员/公众号的长期研究方法炼化成独立 Agent Skills，并通过 Router 形成一个可扩展的研究委员会。

系统不是：
- 文章摘要库
- 作者文风模仿器
- 多人投票器

系统是：

`历史语料 → Article Distillation → Analyst DNA → Analyst Skill → Router → Unified Fact Base → Disagreement Map → CIO Judgment`

---

## 2. 当前五位分析师

### 沧海一土狗
核心层：
`制度 → 货币/财政 → 剩余价值 → 资本开支 → 市场状态H → 资产价格`

最适合：
- 中国宏观
- PPI
- 产业利润分配
- A股结构
- 中国资产定价
- 制度/产业变化

### 坦途宏观
核心层：
`机制 → 数据拆解 → 历史比较 → 情景树 → 资产映射 → 反证`

最适合：
- Fed / FOMC
- 美国财政
- 美债
- 期限溢价
- 美元流动性量化
- 全球宏观情景

### Kevin策略研究
核心层：
`宏观 → 分子/分母 → 已定价预期 → 估值/情绪/仓位 → 资金流 → 拥挤 → 赔率/胜率 → 配置`

最适合：
- 海外策略
- 港股
- 实际利率
- 主动/被动外资
- 南向
- 估值/拥挤
- AI资产定价

### 智堡Mikko
核心层：
`货币层级 → 资产负债表 → 对手方 → 融资工具 → 抵押品 → 监管约束 → 跨境流动 → 价格 → 资产`

最适合：
- Money View
- 美元流动性
- Repo
- FX Swap / XCCY
- Eurodollar
- 银行/非银资产负债表
- 央行资产负债表
- 黄金货币属性

### Spread Trading
核心层：
`Macro Regime → Pricing Anchor → Cross-Asset Confirmation → Positioning/Flow → Catalyst → Trade Expression → Hedge/Falsification`

最适合：
- 收益率曲线
- Relative Value
- 财政主导交易
- AI CapEx → ROI
- PE/PB/PS/现金流质量
- Gamma / 再平衡
- 商品安全
- 交易表达

---

## 3. Router

Router 不充当第六位分析师。

Router 做六件事：

1. 重写用户问题
2. 拆出核心变量/时间周期/资产
3. 选 1–3 位互补分析师
4. 建立统一事实底稿
5. 找出真实分歧
6. CIO 裁决

### 默认调用数量

- 单一领域：1位
- 一般跨层：2位
- 复杂跨资产：3位
- 系统危机：3–4位
- 全体：仅用户明确要求

---

## 4. 统一事实底稿

任何当前市场问题，观点讨论前先统一：

- 数据截止时间
- 政策原文
- 利率
- 汇率
- 商品
- 股指
- 资金流
- 关键估值/信用指标

每个指标尽量使用一个主定义。

必须区分：

### A 历史原观点
作者真实说过，有来源。

### B 框架推演
系统使用作者框架推演当前情况。

### C CIO判断
多框架综合后的系统结论。

---

## 5. 冲突处理

分歧分成：

1. 数据口径冲突
2. 时间周期冲突
3. 因果权重冲突
4. 真正方向冲突

CIO 不按人数投票。

考虑：

`Domain Match × Evidence Quality × Corpus Reliability × Current Data × Priced-in × Falsifiability`

---

## 6. 语料原则

长期 DNA 必须主要来自：
- 2–3年跨度
- 长文
- 原创
- 方法论密度高
- 跨周期反复出现

Current View 主要来自：
- 最近3–6个月
- 最新文章
- 最新公开讲话/研究

短文、标题索引、翻译、嘉宾、调查必须降权。

详见 `CORPUS_POLICY.md`。

---

## 7. 输出模板

默认：

### 核心结论
一句话。

### 本次调用
主分析师 / 辅助分析师 / 第三视角。

### 共同事实底稿
最新事实。

### 分析师视角
各自只解释自己负责的层，不重复。

### 分歧在哪里
解释因果，不做“多/空”罗列。

### CIO裁决
- 第一驱动
- 第二驱动
- 市场已定价什么
- 哪类资产优先
- 最大风险
- 第一反证指标

### 下一步观察
最多5项。

---

## 8. 扩展接口

新增分析师必须经过：

`Account Resolve → 24–36M Corpus → Corpus Audit → Weighting → Distillation → Framework Evolution → DNA → Skill → Router → Registry → Tests`

接口文件：
- `EXTENDING.md`
- `CORPUS_POLICY.md`
- `ANALYST_REGISTRY.json`
- `EXTENSION_KIT/`

---

## 9. 最终原则

> 不让所有分析师重复解释同一件事。

> 不拿历史观点代替最新事实。

> 不以作者名气代替证据。

> 不因为短期观点改变长期 DNA。

> 不靠投票形成最终投资判断。

> 让不同研究框架解释同一事实的不同层。
