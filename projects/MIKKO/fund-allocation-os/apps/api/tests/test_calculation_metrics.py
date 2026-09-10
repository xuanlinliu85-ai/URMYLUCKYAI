from datetime import date

import pytest

from fund_allocation_api.calculation.metrics import (
    MetricInputError,
    NavPoint,
    calculate_nav_metrics,
    concentration_metrics,
    holding_overlap,
    pearson_correlation,
)


def test_nav_metrics_fixed_drawdown_and_recovery() -> None:
    points = [
        NavPoint(date(2025, 1, 1), 1.00),
        NavPoint(date(2025, 4, 1), 1.20),
        NavPoint(date(2025, 7, 1), 0.90),
        NavPoint(date(2026, 1, 1), 1.20),
    ]
    result = calculate_nav_metrics(points)
    assert result["total_return"] == pytest.approx(0.20)
    assert result["max_drawdown"] == pytest.approx(0.25)
    assert result["drawdown_peak_date"] == date(2025, 4, 1)
    assert result["drawdown_trough_date"] == date(2025, 7, 1)
    assert result["recovery_date"] == date(2026, 1, 1)
    assert result["recovery_days"] == 184


def test_nav_metrics_rejects_bad_or_duplicate_observations() -> None:
    with pytest.raises(MetricInputError):
        calculate_nav_metrics([NavPoint(date(2026, 1, 1), 1.0)])
    with pytest.raises(MetricInputError):
        calculate_nav_metrics(
            [NavPoint(date(2026, 1, 1), 1.0), NavPoint(date(2026, 1, 1), 1.1)]
        )


def test_diversification_metrics() -> None:
    concentration = concentration_metrics([0.5, 0.3, 0.2], top_n=2)
    assert concentration["hhi"] == pytest.approx(0.38)
    assert concentration["top_n_weight"] == pytest.approx(0.8)
    assert pearson_correlation([1, 2, 3], [2, 4, 6]) == pytest.approx(1.0)
    assert holding_overlap({"A": 0.6, "B": 0.4}, {"A": 0.2, "C": 0.8}) == pytest.approx(0.2)

