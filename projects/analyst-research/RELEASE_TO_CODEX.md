# RELEASE_TO_CODEX.md

# 最终释放版 V3

这个目录已经整理成可直接交给 Codex 的整体框架。

## 最简单的用法

1. 解压本包。
2. 把目录内容放到你的 Codex 项目根目录；或者运行安装脚本：
   - Windows：`.\install-to-project.ps1 -Target <你的项目目录>`
   - macOS/Linux：`./install-to-project.sh <你的项目目录>`
3. 把 `CODEX_START_HERE.md` 中的“第一次交给 Codex”提示词发给 Codex。
4. 开始直接提研究问题。

## 后续新增

以后只需要说：

> 按现有分析师天团流程，把“XXX”加入进来。

系统会沿用 Corpus Gate、Analyst DNA、Skill、Router、Registry 的流程扩展。

## 自检

```bash
python tools/self_check.py
```

通过应显示：

`SELF-CHECK PASSED`
