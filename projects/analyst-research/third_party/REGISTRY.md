# Third Party Registry

V1 applies **REUSE BEFORE BUILD**. Runtime code integrates these upstreams through thin adapters.

| Repo | Purpose | License | Pinned Version | How We Use It | Local Wrapper | Replacement Option |
|---|---|---|---|---|---|---|
| [halohazhang/wechat-mp-obsidian-archiver](https://github.com/halohazhang/wechat-mp-obsidian-archiver) | WeChat identity resolution, history/incremental sync, full text, Markdown and deduplication | MIT | `1578159ef9c3208ca9ee6cf1ca1cc2a6e3652a20` | Installed into `.third_party/wechat-mp-obsidian-archiver`; invoked as an external command. A trusted WeWe-RSS-compatible endpoint is the active source. | `analyst_team.upstreams.WechatArchiver` | Another lawful archive source implementing the same manifest/Markdown contract |
| [wechat-article/wechat-article-exporter](https://github.com/wechat-article/wechat-article-exporter) | Import compatibility for HTML archives produced before upstream shutdown | MIT | `a7bffa6e481a188510a701d30b399b76573434e5` | Historical fallback only. Upstream stopped maintenance on 2026-07-30 after its core WeChat API closed, so V1 does not present live export as available. | Archiver's upstream HTML importer | User-supplied lawful HTML export |
| [HKUDS/LightRAG](https://github.com/HKUDS/LightRAG) | Per-analyst article retrieval and knowledge graph | MIT | `e721548fde2c5f7325db3c019c4c9787c3548aec` | Python package with one working directory per analyst. | `analyst_team.retrieval.LightRAGIndex` | Any namespace-isolated retriever implementing `index/query` |
| [openai/openai-agents-python](https://github.com/openai/openai-agents-python) | Structured distillation, DNA synthesis and analyst runtime | MIT | `89c02c828ee8510fe9a84ee6675608193aa13b02` | Official `Agent` + `Runner` runtime using structured Pydantic outputs. | `analyst_team.llm` | Direct Responses API adapter |

## Existing GitHub alternatives review

### Collection

1. `cooderl/wewe-rss` — archived upstream.
2. `wechat-article/wechat-article-exporter` — live history API closed on 2026-07-30.
3. `halohazhang/wechat-mp-obsidian-archiver` — already provides the required orchestration and import adapters.

Decision: reuse the archiver. The project contains no crawler implementation.

### Retrieval

1. LightRAG
2. Graphiti
3. custom vector store

Decision: reuse LightRAG. Graphiti and a custom retrieval engine are outside V1.

### Agent runtime

1. OpenAI Agents SDK
2. LangGraph
3. custom agent loop

Decision: reuse OpenAI Agents SDK. V1 needs one analyst and a later manager-style comparison, which the SDK already supports.

