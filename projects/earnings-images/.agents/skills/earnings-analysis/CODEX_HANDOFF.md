# Codex Direct Handoff — V1.5

把整个文件夹放入你的 Codex 项目 Skill 目录后，直接给 Codex：

```text
请安装并启用 earnings-company-research Skill。

我的最终目标非常简单：
以后我只需要说“分析一下某公司最新财报”，系统就自动找到正确报告期和数据，严格比较财报实际值、财报公布前的一致预期、公司原有 Guidance 和新的 Guidance，找出真正的预期差，同时分析公司的业务、行业、财务质量、估值和未来关键变量，并调用我现有的分析师天团形成最终研究结论。

默认只生成严谨研究报告。
如果我明确要求 PPT，再调用我已有 PPT Skill 生成。

开始前请：
1. 验证 Skill Bundle；
2. discovery 我现有的 iFinD MCP；
3. discovery 我已有的分析师天团 Skill；
4. discovery 我已有 PPT Skill；
5. 安装/检查免费开源 EdgarTools 作为美股 SEC 官方数据适配器（若未安装）；
6. 不要引入新的付费金融数据 API；
7. 不要重建已有能力。

iFinD MCP 的具体 tool name 必须从真实 schema 映射，不允许猜。

特别注意：
- “预期差”必须优先使用财报发布前的 consensus snapshot；
- 不允许用财报后已经被分析师修正过的一致预期去反推 beat/miss；
- GAAP / non-GAAP、合并/单体、币种/单位、报告期必须匹配；
- 所有重要数字必须有 Evidence ID 或 Calculation ID；
- 财报专业分析负责 WHAT，现有分析师天团负责 SO WHAT；
- 最终报告必须同时回答“财报哪里好/哪里差/最大的预期差/公司整体怎么看/未来2–4季度看什么/什么情况会推翻判断”。

先完成 capability discovery 和 dry run。
然后用 NVIDIA 与贵州茅台各跑一个真实 smoke test。
```
