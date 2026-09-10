# Install — Earnings & Company Research Skill V1.5

## Install

Copy the entire folder into the Codex project skill directory.

Then run:

```bash
python scripts/validate_bundle.py
python scripts/preflight.py
```

## First task

Read:

```text
CODEX_HANDOFF.md
```

and execute it.

## Intended daily usage

The user should not need to know the internal pipeline.

Normal prompt:

```text
分析一下 <公司> 最新财报。
```

The system should automatically:
- resolve latest reported period;
- retrieve official facts;
- retrieve pre-earnings professional consensus when available;
- build Fact / Expectation / Company Baseline packs;
- verify data;
- calculate metrics;
- analyze earnings and company context;
- call existing Analyst TianTuan;
- challenge the key thesis;
- return a rigorous PPT-ready research report.

PPT is only generated on explicit request.
