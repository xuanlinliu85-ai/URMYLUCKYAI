# Earnings Call Intelligence

Treat the call as a source of forward information, not a sentiment toy.

## Compare four layers

1. Prepared remarks
2. CEO answers
3. CFO answers
4. Analyst Q&A

## Extract

- key forward-looking claims
- explicit guidance
- assumptions behind guidance
- analyst question topics
- repeated questions
- follow-up questions
- deflected/partially answered questions
- newly emerging topics
- recurring topics
- dropped topics
- CEO/CFO disagreement or emphasis gap
- quarter-on-quarter wording changes

## Q&A heatmap

For each topic:

```yaml
topic:
questions:
follow_ups:
management_response:
  clear | partial | deflected | unresolved
trend:
  new | rising | stable | declining | dropped
```

Interpretation:

```text
many questions alone != bearish
many questions + repeated follow-up + deflection = high research priority
```

## Tone analysis

Prefer directional changes over raw sentiment.

Examples:

```text
specific → vague
narrow range → wide range
direct → conditional
"will" → "expect"
"clear visibility" → "monitoring"
```

Do not equate confident language with credibility.

Cross-check with Management Credibility history.
