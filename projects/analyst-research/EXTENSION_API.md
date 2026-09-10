# EXTENSION_API.md

# 扩展接口规范

本接口用于未来继续增加：
- 新分析师
- 新公众号
- 新研究机构
- 新数据源
- 新抓取 Adapter
- 新资产类别
- 新评分模块

## A. Analyst Plugin Contract

每个新分析师最低必须生成：

```text
.agents/skills/<skill-name>/
├── SKILL.md
├── agents/openai.yaml
├── references/
│   ├── framework.md
│   ├── framework-evolution.md
│   ├── source-map.md
│   ├── article-schema.json
│   └── corpus-audit.json
└── scripts/
    └── normalize_article.py
```

然后注册到：

```text
ANALYST_REGISTRY.json
```

并更新：

```text
analyst-dream-team-router/references/routing-matrix.md
```

## B. Source Adapter Contract

未来若新增公众号抓取器、网页、RSS、数据库或其他连接器，只要能输出统一 Article Record 即可。

标准 Article Record：

```json
{
  "analyst_id": "",
  "title": "",
  "published_at": "",
  "source_url": "",
  "source_type": "",
  "authorship_type": "",
  "fulltext_status": "",
  "text_length": 0,
  "raw_text_ref": "",
  "content_hash": "",
  "source_quality": 0.0
}
```

上层炼化逻辑不得依赖某个单一爬虫。

## C. Distillation Contract

统一输出：

```json
{
  "core_thesis": [],
  "causal_chain": [],
  "important_variables": [],
  "asset_mapping": [],
  "historical_analogy": [],
  "falsification": [],
  "framework_change": "",
  "evidence_quotes": []
}
```

## D. Data Provider Contract

当前事实层可以替换数据源，但输出必须统一：

```json
{
  "metric": "",
  "value": null,
  "unit": "",
  "timestamp": "",
  "definition": "",
  "source": "",
  "quality": ""
}
```

原则：
- 官方优先
- 一个指标只设一个主定义
- 衍生计算注明公式
- 数据源失效可替换，不影响 Analyst Skill

## E. Future Module Slots

预留：
- `commodity-cycle-analyst`
- `china-fiscal-policy-analyst`
- `quant-market-state`
- `credit-analyst`
- `ai-industry-chain`
- `portfolio-construction`
- `tail-risk-manager`

这些只是接口位，不代表必须开发。

## F. Backward Compatibility

新模块不得破坏：
- Router 默认调用原则
- Historical / Framework Inference / CIO 三层区分
- Corpus Gate
- 反证机制
- 统一事实底稿

若新模块与已有 Skill 重复度过高，优先合并，不新增。
