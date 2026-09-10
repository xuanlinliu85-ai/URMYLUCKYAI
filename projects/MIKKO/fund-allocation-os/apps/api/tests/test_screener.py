from fund_allocation_api.calculation.screener import FundCandidate, screen_fund_universe


def test_screener_only_ranks_within_comparable_group() -> None:
    output = screen_fund_universe(
        [
            FundCandidate("000001.OF", "active-equity", 2e9, 1500, 0.18, 0.20, 0.25, 0.80),
            FundCandidate("000002.OF", "active-equity", 2e9, 1500, 0.12, 0.16, 0.20, 0.65),
            FundCandidate("000003.OF", "active-equity", 2e9, 1500, 0.05, 0.30, 0.45, 0.10),
            FundCandidate("000004.OF", "bond", 2e9, 1500, 0.05, 0.03, 0.04, 1.10),
            FundCandidate("000005.OF", "bond", 2e9, 1500, 0.04, 0.02, 0.03, 1.00),
            FundCandidate("000006.OF", "active-equity", None, 1500, 0.20, 0.20, 0.20, 1.00),
        ]
    )
    rows = {row["fund_code"]: row for row in output["results"]}
    assert rows["000001.OF"]["rank"] == 1
    assert rows["000004.OF"]["rank"] in {1, 2}
    assert rows["000006.OF"]["eligible"] is False
    assert "missing:aum" in rows["000006.OF"]["flags"]
    assert output["eligible_funds"] == 5

