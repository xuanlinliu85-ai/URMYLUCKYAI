# Kevin策略研究分析引擎

安装：把整个 `kevin-strategy-research` 目录放入 Codex / Agent 的 skills 目录。

典型调用：

- `$kevin-strategy-research 现在港股反弹还有多少空间？`
- `$kevin-strategy-research 分析美债实际利率上涨为什么压制AI和黄金`
- `$kevin-strategy-research 当前AI是泡沫破裂还是拥挤去杠杆？`
- `$kevin-strategy-research A股科技高拥挤后是否应该高切低？`
- `$kevin-strategy-research 拆一下主动外资、被动外资和南向对港股的影响`

核心流程：
`分子/分母 → 市场计入 → 估值/情绪/仓位 → 资金流 → 拥挤 → 赔率/胜率 → 配置`
