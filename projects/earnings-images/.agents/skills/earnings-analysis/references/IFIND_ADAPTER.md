# iFinD MCP Adapter

## Purpose

Use the user's existing iFinD MCP as the preferred licensed data layer for China/HK and for consensus/valuation where available.

Do not assume exact MCP function names.

## First-run discovery

1. Inspect all available iFinD MCP tools.
2. Group them by capability:
   - company resolution
   - statements
   - consensus
   - estimates/revisions
   - valuation
   - price history
   - peers
   - industry data
   - business KPI
   - announcements/documents
3. Create or update `config/ifind_tool_map.json`.

Example:

```json
{
  "company_lookup": "ACTUAL_TOOL_NAME",
  "financial_statements": "ACTUAL_TOOL_NAME",
  "consensus": "ACTUAL_TOOL_NAME",
  "valuation": "ACTUAL_TOOL_NAME",
  "price_history": "ACTUAL_TOOL_NAME"
}
```

Never invent a tool name.

## Normalized adapter contract

Map iFinD responses into:

```text
company
period
metric
value
unit
currency
basis
source
as_of
```

Keep the raw provider response or retrieval reference in run metadata when possible.

## Conflict policy

For reported financial facts:

```text
official filing > company release > iFinD > secondary sources
```

For consensus/analyst estimates:

```text
iFinD is preferred if available
```

Do not average a filing number with an iFinD number when they disagree.

Investigate the basis/period/unit first.
