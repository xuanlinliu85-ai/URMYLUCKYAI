# Analyst Dream Team for Codex

## 项目工程规则

- 采用根因修复，以正确逻辑直接覆盖相关实现。
- 使用肯定句表达规则、结论与行动。

本项目包含8个 Agent Skills：

- analyst-dream-team-router
- canghai-yitugou-analyst
- tantu-macro-analyst
- kevin-strategy-research
- wisburg-mikko-analyst
- spread-trading-analyst
- yiyuzhongde-zhangyu-analyst
- qinhan-fixed-income-analyst

## 默认行为

当任务属于宏观、市场、跨资产、A股/港股/美股、美债、黄金、美元流动性、AI投资研究时：

1. 优先使用 `analyst-dream-team-router`；
2. Router自动选择1-3个子Skill；
3. 先统一最新数据口径；
4. 再做多框架研究；
5. 最后形成总控结论。

若用户明确点名某位分析师，则直接使用对应 Skill。

## 事实规则

- 最新数据必须重新查询，不得从历史文章直接继承。
- 官方数据优先于媒体；媒体用于即时市场和事件报道。
- 同一指标出现不同口径时，必须标注来源与时间。
- 分析师历史观点是“框架”，不是当前事实。

## 研究原则

不要机械投票。
不要为了“全面”每次全开四个分析师。
不要模仿博主文风。
不要复制完整付费内容。


## 后续扩展

当用户要求新增分析师、公众号、研究机构或策略框架时：
- 必须读取根目录 `EXTENDING.md`
- 必须按标准扩展流程执行
- 必须优先使用 `EXTENSION_KIT/skill-template`
- 必须更新 `ANALYST_REGISTRY.json`
- 必须更新 Router
- 必须更新 `manifest.json` 和 `CHANGELOG.md`
- 不得只创建孤立 Skill 后结束


## Corpus Gate v2.1

新增或重炼任何分析师前，必须先读取根目录 `CORPUS_POLICY.md` 并通过 `Corpus Audit`。不得用少量近期文章直接生成稳定 DNA；短文、标题页、翻译、嘉宾内容必须降权。
