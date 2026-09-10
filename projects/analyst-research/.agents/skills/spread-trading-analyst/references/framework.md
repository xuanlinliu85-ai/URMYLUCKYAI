# Spread Trading Framework Reference

版本：3.0.0  
Corpus：Grade A（2022-03—2026-08）  
长期规则证据见 `analyst-dna.md`；时间演化见 `framework-evolution.md`；最近观点见 `data/analysts/spread-trading/current-view.json`。

## 核心总模型

`Regime → Pricing anchor → Cross-asset confirmation → Positioning → Catalyst → Relative value → Trade`

---

## 1. Rates & Curve

2022公开文章《聊聊美债收益率曲线》已经系统关注：
- 2Y与10Y
- 2s10s倒挂
- 历史衰退
- 曲线持续时间

后续框架升级：
不能只把曲线理解成衰退指标，而要加入：
- fiscal regime
- term premium
- central-bank credibility
- global cross-market transmission

---

## 2. Fiscal dominance / term premium

2026《只有加息才能救长端利率？》明确把全球长端问题从单一政策利率框架升级为：

`persistent fiscal expansion + rigid rollover + inflation uncertainty + central-bank independence risk → term premium`

并强调：
不同国家长端通过：
- FX
- carry
- foreign holdings
- risk appetite
形成联动。

---

## 3. Debt system

《全球债务系统与其重置机制》强调：

`Debt liability on one balance sheet = financial asset on another`

因此债务分析必须看债权人。

这与单纯“债务/GDP过高”的叙事不同。

---

## 4. Dollar

2026《聊聊支撑美元的三股力量》把美元韧性拆成：
-制度信用
- AI对美国国际收支融资方式的改变
- 欧洲相对竞争力弱化

因此美元是：
`relative institutional + financial + productivity asset`

而不仅是：
`rate differential asset`

---

## 5. AI

2026两篇核心文章：

### 《你还在盯着市盈率炒AI？》
重点：
- PE可能被利润质量扭曲
- PB/PS/现金流/融资结构重新重要
- investment income vs operating income
- forward estimates depend on strong assumptions

### 《AI后半场，该关注什么？》
核心升级：
AI上半场看CapEx；
AI下半场看ROI。

`CapEx is upstream revenue but downstream cost`

---

## 6. Macro hedge / crowding

《随笔：从宏观对冲视角，聊聊科技过山车》
强调：
- crowded unwind
- rebalancing
- Gamma Squeeze
- dividend/high-dividend seasonality

因此价格风格切换可来自资金结构，不必等同宏观趋势反转。

---

## 7. Strategic commodities

《美国“百万吨”铜库存棋局与系统脆弱性》
核心：
- strategic inventory
- De-risk
- national-security procurement
- exchange inventory migration
- critical minerals
- public-private credit mechanisms

商品框架从：
`China cycle / global cycle`
升级到：
`security + strategic stockpile + capex`

---

## 8. Geopolitical chokepoints

《物理版SWIFT：能源独立与海峡控制的“武器化”》
核心框架：

`energy self-sufficiency + chokepoint influence → asymmetric macro vulnerability`

传导：
`energy/logistics → growth/inflation/BOP → USD/rates/credit → fiscal/political realignment`

---

## 9. US exceptionalism

2024《聊聊“美国例外主义”》
公开内容强调：
- ROIC
- revenue growth
- margins
- valuation
- fiscal deficit/private surplus
是美国资产长期相对表现的重要框架。

---

## 10. Valuing long-duration dreams

《基于SpaceX，聊聊如何给“梦想”估值》
思路：
不要把所有业务塞进单一multiple。

分成：
- current business
- infrastructure growth
- long-duration optionality

本质上接近：
`sum of assets with different duration × probability`

---

## 核心交易模板

### Macro view
一句话。

### Anchor
真正定价变量。

### Confirmation
至少两个其他资产是否验证。

### RV
最值得交易的相对关系。

### Catalyst
什么时候发生。

### Falsification
什么发生就退出。
