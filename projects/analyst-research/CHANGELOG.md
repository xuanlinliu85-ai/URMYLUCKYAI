# CHANGELOG

## v3.3.0 — 2026-09-09

- Kevin 策略研究新增 8 条刘刚署名核验全文，达到 184 条发现、44 条全文、60 条长文和 19 个季度，升级为 Corpus Gate B 与 `STABLE_ANALYST_DNA`
- 智堡Mikko 新增 2 条作者级公开全文，达到 185 条发现、34 条原创、28 条原创全文和 27 条作者级高质量全文，版本升级到 3.3.0并保持作者过滤 Grade C
- Mikko DNA 新增“数据质量—反应函数—价格分层”规则，并保存 2020 年通胀方向误判作为反证
- 沧海一土狗、坦途宏观、Spread Trading、张瑜、覃汉完成 2026-09-02 至 2026-09-09 独立增量扫描；有效材料分别进入独立增量账
- 根 Registry、Manifest 与 Corpus 总审计同步到 3.3.0

## v3.2.0 — 2026-09-07

- Kevin 策略研究完成作者归属公共全文补强：发现 176 条、核验全文 36 条、长文 52 条，维持 Corpus Gate C，距离 Grade B 还需 4 条全文
- 智堡Mikko 完成作者过滤语料升级：发现 181 条、Mikko 原创 32 条、原创全文 26 条、原创长文 17 条、16 个原创季度，维持作者级 Grade C
- Kevin 与智堡Mikko 分别更新 Framework Evolution、DNA Evidence、Corpus Audit 与版本清单，继续保持独立证据边界
- 根清单、总审计和自检入口同步到 3.2.0

## v3.1.0 — 2026-09-01

- 新增并独立注册 `yiyuzhongde-zhangyu-analyst` 与 `qinhan-fixed-income-analyst`
- 张瑜 Corpus 达到 Grade A：196篇收录、142篇正文、118篇长文、13季度
- 覃汉 Corpus 达到 Grade B：125篇独立记录、44篇正文、42篇长文、14季度
- 张瑜与覃汉分别维护 Corpus、DNA Evidence、Framework Evolution 和版本清单
- 沧海一土狗升级到 Grade A，坦途宏观升级到 Grade A
- Spread Trading 升级到 Grade A：176篇结构化记录、76篇正文、67篇长文、16季度
- Kevin 与智堡Mikko 按作者边界继续独立强化，保持真实 Grade C
- Router 新增 China Rates、China Bond Trading、China Stock-Bond 与 Global Rates Crosscheck 组合
- Router 完成七位分析师规模文案、展示元数据与 Mikko 黄金证据边界校正
- Registry、根清单、Corpus 总审计和自检流程同步升级

## v3.0.0 — 2026-08-30

- 整理为 Codex 可直接启动的完整框架
- 新增 `CODEX_START_HERE.md`
- 新增整体架构 `FRAMEWORK.md`
- 新增可持续扩展契约 `EXTENSION_API.md`
- 保留并强化 Corpus Gate
- Extension Kit 新增 framework-evolution / corpus-audit 模板
- 重写 Windows/macOS/Linux 安装脚本
- 新增 `tools/self_check.py`
- 保留现有五位分析师及 Router
- 后续新增接口不绑定单一爬虫、数据源或存储实现

## v2.1.0 — 2026-08-30

- 新增统一 `CORPUS_POLICY.md`
- 强制2-3年跨周期语料优先
- 目标每位分析师发现≥100篇，高质量正文≥60，有效长文≥40
- <300字文章权重降至0.05，不进入DNA
- 翻译/嘉宾/调查/标题索引大幅降权
- 长期 Analyst DNA 与 Current View 分离
- 新增 DNA 支持文章/反例/跨季度证据门槛
- 新增 `CORPUS_AUDIT_V2.1.json`
- 对现有5位分析师统一重审：除沧海已有较强长文基础外，其余均明确标为 PROVISIONAL，等待Codex继续补足结构化历史语料
- 后续新增分析师必须先过 Corpus Gate，再生成 Skill

## v2.0.0 — 2026-08-30

- 建立分析师天团 Router
- 集成沧海一土狗
- 集成坦途宏观
- 集成 Kevin策略研究
- 集成智堡Mikko
- 集成 Spread Trading
- 新增标准扩展协议 `EXTENDING.md`
- 新增 `ANALYST_REGISTRY.json`
- 新增 `EXTENSION_KIT/skill-template`
- 明确后续新增分析师时必须更新 Router、Registry、Manifest、Changelog

## 后续版本规则

- 新增分析师：2.1.0、2.2.0...
- Router大改：3.0.0
- 小修：2.0.1
