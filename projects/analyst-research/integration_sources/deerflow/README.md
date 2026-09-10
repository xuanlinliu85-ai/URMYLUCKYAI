# DeerFlow Finance Local Integration

This directory is the executable local boundary for the eight-project finance integration.

- `finance-capability-registry.json` assigns one owner to each production capability.
- `run_finance_flow.py` invokes the owner project's existing producer, validates the shared Research Artifact, and sends the unchanged artifact through the PPT consumer smoke test.
- Market and earnings flows reuse existing research outputs. The runner performs orchestration and validation only.
- The macro flow proves the Router boundary with a MIKKO+KEVIN research archive and MATT's A-share mapping as separate inputs.

Examples:

```powershell
python integrations/finance/run_finance_flow.py market --output artifacts/finance/market.json
python integrations/finance/run_finance_flow.py earnings --run-root C:\path\to\completed-run --output artifacts/finance/earnings.json
python integrations/finance/run_finance_flow.py macro --output artifacts/finance/macro.json
```
