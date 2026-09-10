# 安装到 Codex

这个压缩包已经按“项目内 Skill”方式组织。

解压以后，你会看到：

```text
analyst-dream-team-codex/
├── AGENTS.md
└── .agents/
    └── skills/
        ├── analyst-dream-team-router/
        ├── canghai-yitugou-analyst/
        ├── tantu-macro-analyst/
        ├── kevin-strategy-research/
        ├── wisburg-mikko-analyst/
        └── spread-trading-analyst/
```

## 方案A：放入一个具体 Codex 项目

把：
- `.agents/`
- `AGENTS.md`

复制到你的项目根目录。

然后重新打开/刷新该 Codex 项目。

适合：
- 你的“分析师天团”独立项目；
- 希望这个项目天然加载投研规则。

## 方案B：作为用户级 Skills

如果你希望所有 Codex 项目都能调用这些 Skills，可以在 Codex 的 Skills 管理界面导入各个 Skill 文件夹/压缩包，或按你当前 Codex 环境支持的用户级 Skill 目录安装。

OpenAI 2026年的公开说明确认：
- Skill以 `SKILL.md + supporting resources/scripts` 的文件夹形式存在；
- Codex可以显式调用指定Skill，也能基于description自动选择；
- Skills遵循Agent Skills格式，可以跨支持该格式的OpenAI工具导入使用。

由于不同Codex客户端/版本的UI和用户级目录可能变化，本包不硬编码一个机器路径。

# 推荐用法

普通问题：

> 用分析师天团分析目前美国30年美债新高、黄金上涨与AI继续上涨为什么可以同时发生。

Codex应自动使用：
- 坦途
- Kevin
- 可能加Mikko

点名：

> 用Kevin策略研究分析当前港股。

> 用Mikko解释现在的美元流动性。

> 用沧海一土狗分析中国PPI回升对A股风格的影响。

# 显式调用

如果你的Codex环境支持 `$skill-name`：

```text
$analyst-dream-team-router
分析当前美债、黄金、AI和美元之间的关系。
```

或：

```text
$wisburg-mikko-analyst
分析Fed扩表是否意味着广义美元流动性宽松。
```

# 推荐第一个测试题

安装完成后输入：

> 使用分析师天团。分析当前“美国30年美债收益率处于高位、黄金强势、AI科技仍有韧性”这一组合。自动选择分析师，数据必须更新到最新美国市场收盘，先统一数据口径，再给出分歧和最终裁决。

如果输出包含：
- 本次调用的分析师
- 共同事实底稿
- 各分析师不同分工
- 分歧
- 总控裁决
- 反证指标

说明Router正常工作。


# Spread Trading 新增测试

```text
$analyst-dream-team-router
分析当前30年美债收益率上升与AI科技股高位共存。
除了宏观解释，请让Spread Trading给出最合适的相对价值表达、催化剂、对冲和反证条件。
```
