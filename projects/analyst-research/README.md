# 分析师天团 V1

把长期公开研究文章转化为有证据、可检索、可调用的 Analyst。V1 只跑通 #001「沧海一土狗」。

## 主链路

```text
公众号身份确认
  -> wechat-mp-obsidian-archiver
  -> Markdown Article Lake
  -> LightRAG namespace
  -> Article Distillation
  -> evidence-backed Analyst DNA
  -> OpenAI Agents SDK Analyst
```

项目自己实现的能力只有观点蒸馏、DNA 合成和后续的团队分歧比较。采集、RAG 与 Agent runtime 全部通过上游适配器复用。

## 当前外部前置条件

1. 一个由你信任的 WeWe-RSS 兼容服务地址，写入 `.env.local` 的 `WECHAT_ARCHIVER_BASE_URL`。
2. 「沧海一土狗」的一篇真实 `mp.weixin.qq.com` 分享链接，用于首次身份确认。
3. 对该服务进行一次微信扫码登录。上游会把敏感凭证保存在自己的用户配置目录。

`wechat-article-exporter` 的实时历史接口于 2026-07-30 关闭，当前只保留既有 HTML 归档导入兼容性。

## 命令

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -e ".[dev]"
analyst-team upstream install
analyst-team account resolve "沧海一土狗"
analyst-team account confirm canghai-yitugou "https://mp.weixin.qq.com/s/..." canghaiyitugou
analyst-team collect --analyst-id canghai-yitugou
analyst-team index --analyst-id canghai-yitugou
analyst-team eval-retrieval --analyst-id canghai-yitugou
analyst-team distill --analyst-id canghai-yitugou --limit 100
analyst-team dna --analyst-id canghai-yitugou
analyst-team ask "按照沧海一土狗过去的研究框架，怎么看当前中国股债关系？"
analyst-team status --analyst-id canghai-yitugou
```

第三方版本、许可证、替换路线与复用判断见 `third_party/REGISTRY.md`。
