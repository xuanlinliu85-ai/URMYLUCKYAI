# Earnings Analyst OS V1.4 — Research First

## 目标

一句话触发：

```text
帮我分析 NVIDIA 最新一季财报。
```

系统自动：

```text
找财报 / 数据
→ 数据完整性校验
→ 程序化财务计算
→ Earnings Analyst 财报分析
→ 调用现有分析师天团
→ Research Council
→ Targeted Challenge
→ 输出严谨研究报告
```

## 默认行为

默认只生成研究报告。

如果用户明确说：

```text
生成 PPT
```

才继续：

```text
Research Memo
→ SlideSpec
→ 现有 PPT Skill
→ PPTX
```

V1.4 不包含视频生成。

## 默认研究问题

系统必须回答：

1. 这份财报哪里好？
2. 哪里不好？
3. 哪些指标是真正的变化，哪些只是表面变化？
4. 最大预期差是什么？
5. 管理层 Guidance 与市场预期怎么变？
6. 电话会 Q&A 暴露了什么？
7. 管理层过去的兑现度如何？
8. 原分析师天团如何解释这些变化？
9. Bull / Bear 各自最强论点是什么？
10. 未来 2–4 个季度最关键变量是什么？
11. 哪个假设一旦错了，会推翻当前判断？

## 原则

研究准确性 > 输出形式。

不为了“Agent 数量”增加复杂度。
不为了“自动化完整”加入低质量视频。
