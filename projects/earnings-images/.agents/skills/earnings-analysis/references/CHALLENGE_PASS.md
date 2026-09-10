# Targeted Challenge Pass

The objective is not to produce more caveats. It is to test whether the conclusion survives.

## Step 1 — Identify load-bearing claims

Pick the 1–3 claims that carry the final view.

A claim is load-bearing if:
> If this is false, would the conclusion materially change?

## Step 2 — Attack each claim

Ask:
1. Assume the claim is false. What would the world look like?
2. What is the strongest counter-evidence?
3. Is this a fact, estimate, or inference?
4. Which single input is most capable of flipping the view?
5. Is any stated future invalidation trigger already partly true?

## Step 3 — Check method

Challenge:
- peer set
- sector routing
- period alignment
- normalization choices
- cyclicality
- valuation sensitivity

## Step 4 — Disposition

Use exactly one:

```text
UPHELD
  challenge succeeded; original claim fails

WEAKENED
  claim survives with reduced force / wider range

REJECTED
  challenge considered and does not hold

UNRESOLVED
  evidence is insufficient
```

Never resolve an UNRESOLVED challenge in favor of the thesis by default.

## Output

```yaml
claim:
why_load_bearing:
counter_evidence:
single_input_sensitivity:
disposition:
impact_on_final_view:
```

If a material claim is UPHELD or strongly WEAKENED, revise the report.
