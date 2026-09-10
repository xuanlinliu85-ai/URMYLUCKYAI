# CORPUS POLICY — 分析师炼化语料标准 v2.1

本文件优先级高于“快速生成 Skill”。

## 目标

Analyst Skill 不是基于几篇代表文章写 Prompt。
它必须基于**跨周期、足够长、可追溯的历史语料**构建 Analyst DNA。

默认目标：

- 时间跨度：优先最近 **3 年**；最低尽量覆盖 **2 年**
- 发现文章：目标 **≥100 篇/分析师**
- 高质量正文：目标 **≥60 篇**
- 有效长文：目标 **≥40 篇**
- 至少覆盖 **8 个不同季度**
- 至少覆盖 **3 类主题/市场状态**
- 核心 DNA 规则原则上需要 **≥3 篇独立高权重文章**支持
- Signature Framework 原则上需要跨 **≥2 个不同季度**重复出现
- 若达不到，不得假装“完整炼化”，必须标注 `PROVISIONAL`

文章数量不是唯一标准；优先保证“长文 + 跨周期 + 原创 + 方法论密度”。

---

# 1. 时间采样

默认采样窗口：

`T-36 months → today`

若作者更新历史不足3年：
使用全部可获得历史，并标注实际跨度。

采样不能只集中在最近3-6个月。

建议季度覆盖：

- 每季度至少 3 篇高质量正文（若作者有发布）
- 重大市场转折期额外增加
- 方法论文章优先保留

---

# 2. 文章长度权重

长度只作为“信息密度代理”，不是绝对质量判断。

默认：

| 有效正文长度 | Length Weight |
|---|---:|
| < 300中文字 | 0.05 |
| 300–799 | 0.20 |
| 800–1499 | 0.55 |
| 1500–2999 | 0.85 |
| ≥3000 | 1.00 |

## 短文规则

<300字：
- 不用于建立 DNA
- 不用于确认核心框架
- 只可用于时间线/观点更新提示

300–799字：
- 默认低权重
- 除非包含明确模型、预测或框架修正

---

# 3. 内容类型权重

| 类型 | Type Weight |
|---|---:|
| 原创深度研究/方法论 | 1.00 |
| 原创市场复盘/策略 | 0.85 |
| 原创短评 | 0.35 |
| 访谈中作者本人明确观点 | 0.65 |
| 团队文章且作者归属明确 | 0.70 |
| 翻译/编译 | 0.20 |
| 嘉宾观点/转载 | 0.10 |
| 调查结果 | 0.15 |
| 标题索引/摘要 | 0.05 |

翻译文章可用于识别“作者关注什么”，不能直接用于认定“作者相信什么”。

---

# 4. 综合文章权重

建议：

`ArticleWeight = LengthWeight × TypeWeight × Originality × FrameworkDensity × SourceQuality`

其中：

- Originality: 0.1–1.0
- FrameworkDensity: 0.3–1.0
- SourceQuality: 0.5–1.0

不要因为文章新就自动提高 DNA 权重。

Recency 主要用于“当前观点”，不是“长期DNA”。

---

# 5. DNA 与 Current View 分离

必须维护两套对象：

## Analyst DNA
长期稳定思考方式。
主要来自2-3年高权重语料。

## Current View
最近观点。
主要来自近3-6个月文章。

禁止用最近几篇文章重写整个 Analyst DNA。

---

# 6. DNA 证据门槛

每条 DNA Rule 保存：

- rule
- supporting_articles
- contradicting_articles
- first_seen
- last_seen
- quarters_seen
- weighted_support
- confidence

默认：
- 1篇支持：Hypothesis
- 2篇：Weak
- ≥3篇且跨2季度：Medium
- ≥5篇且跨4季度：High

若有明显反例，必须保留 contradiction。

---

# 7. Framework Evolution

每个分析师必须输出：

`references/framework-evolution.md`

按时间记录：

- 新增了什么变量
- 哪个旧框架被修正
- 哪些观点只是阶段性判断
- 哪些方法跨周期稳定

这比只做“最终总结”更重要。

---

# 8. Corpus Audit

每个 Skill 必须有：

`references/corpus-audit.json`

至少包含：

- earliest_date
- latest_date
- span_months
- discovered_articles
- fulltext_articles
- longform_articles
- short_articles
- title_only_articles
- quarters_covered
- original_articles
- translation_or_guest_articles
- effective_weighted_articles
- corpus_grade
- limitations

等级：

- A：≥30个月、≥60高质量正文、≥40长文、≥8季度
- B：≥24个月、≥40高质量正文、≥25长文、≥6季度
- C：≥12个月或有效长文不足25
- D：主要由少量文章/摘要构成

只有 A/B 才可称为“稳定 Analyst DNA”。
C/D 必须标注“暂定 Skill / PROVISIONAL”。

---

# 9. 新分析师扩展流程

以后 Codex 添加任何新分析师：

1. 先建立 Corpus
2. 先跑 Corpus Audit
3. 不合格则继续补文章
4. 再做 Article Distillation
5. 再做 Analyst DNA
6. 再生成 Skill
7. 最后加入 Router

禁止：

`搜5篇文章 → 总结 → 直接生成Skill`

---

# 10. 现有 Skill 审计结论

截至 v2.1：

- 沧海一土狗：已有一批真实长文语料，但主要集中2025-09至2026-08；已补早期公开文章，仍需系统扩充2023-2025正文后重新计算DNA。
- 坦途宏观：目前Skill来自跨年代表文章研究，但尚未形成≥100篇结构化Corpus；PROVISIONAL。
- Kevin策略研究：已有2023-2026跨年代表文章支撑主要框架，但尚未形成≥100篇结构化Corpus；PROVISIONAL。
- 智堡Mikko：核心Money View原创文章较早且平台内容混合原创/翻译/嘉宾；必须扩大样本并严格authorshop过滤；PROVISIONAL。
- Spread Trading：已确认2022至2026有跨年文章，但当前Skill对2025-2026权重偏高；必须补2022-2025长文并区分李易骏/Trading Dog/编译；PROVISIONAL。

因此 v2.1 不再把后四位标成“已完全炼化”，而标成“可用框架 Beta / 待Corpus强化”。
