# Expectation Gap Playbook

## Objective

Identify the information in an earnings release that is most likely to change professional estimates, valuation assumptions, or the market's understanding of the business.

## Build an expectation matrix

Required columns when available:

```text
Metric
Actual
Pre-earnings Consensus
Prior Guidance
New Guidance
Post-earnings Consensus
Surprise %
Consensus As-of
Source
```

## Four layers

### 1. Headline Surprise
Revenue / EPS / headline profit beat or miss.

### 2. Fundamental Surprise
A business KPI, margin driver, segment trend, working-capital item, or cash-flow detail that changes the interpretation of the quarter.

### 3. Forward Surprise
New guidance or management commentary that changes future estimates.

### 4. Hidden / Underappreciated Surprise
Information that is not the headline but may change the medium-term thesis.

## Professional expectation discipline

Prefer a consensus snapshot timestamped before the earnings release.

When available, collect:
- mean
- median
- high
- low
- analyst count
- dispersion
- revision trend

A narrow consensus makes a modest surprise potentially more meaningful.
A wide consensus means the same numeric beat may contain little information.

## Contamination rule

Never call this:

```text
Actual vs consensus downloaded after analysts revised estimates
```

a pre-earnings surprise.

If historical snapshot is unavailable, mark:

```text
pre_earnings_consensus_unavailable
```

and use prior guidance / other pre-release evidence carefully.

## Guidance bridge

Build:

```text
Prior Guidance
→ Actual Delivery
→ New Guidance
→ Pre-print Consensus
→ Post-print Analyst Revision
```

## Final question

The most important expectation gap is not necessarily the largest percentage beat.

Ask:

> Which piece of new information changes the next 2–4 quarters of earnings estimates or the valuation framework the most?
