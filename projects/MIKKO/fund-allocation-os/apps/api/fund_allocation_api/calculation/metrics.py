from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from math import sqrt
from statistics import fmean, stdev
from typing import Iterable, Mapping, Sequence


CALCULATION_VERSION = "metrics-v1"


class MetricInputError(ValueError):
    pass


@dataclass(frozen=True)
class NavPoint:
    date: date
    value: float


def _validate_nav(points: Sequence[NavPoint]) -> None:
    if len(points) < 2:
        raise MetricInputError("至少需要两个净值观测点")
    previous_date: date | None = None
    for point in points:
        if point.value <= 0:
            raise MetricInputError("净值必须为正数")
        if previous_date is not None and point.date <= previous_date:
            raise MetricInputError("净值日期必须严格递增且不可重复")
        previous_date = point.date


def periodic_returns(points: Sequence[NavPoint]) -> list[float]:
    _validate_nav(points)
    return [points[index].value / points[index - 1].value - 1 for index in range(1, len(points))]


def total_return(points: Sequence[NavPoint]) -> float:
    _validate_nav(points)
    return points[-1].value / points[0].value - 1


def annualized_return(points: Sequence[NavPoint]) -> float:
    result = total_return(points)
    days = (points[-1].date - points[0].date).days
    if days <= 0:
        raise MetricInputError("年化收益需要正的日期跨度")
    if result <= -1:
        return -1.0
    return (1 + result) ** (365.25 / days) - 1


def annualized_volatility(returns: Sequence[float], periods_per_year: int = 252) -> float:
    if periods_per_year <= 0:
        raise MetricInputError("年化周期数必须为正数")
    if len(returns) < 2:
        return 0.0
    return stdev(returns) * sqrt(periods_per_year)


def drawdown_details(points: Sequence[NavPoint]) -> dict[str, object]:
    _validate_nav(points)
    peak_index = 0
    worst_peak_index = 0
    trough_index = 0
    max_drawdown = 0.0
    for index, point in enumerate(points):
        if point.value > points[peak_index].value:
            peak_index = index
        drawdown = point.value / points[peak_index].value - 1
        if drawdown < max_drawdown:
            max_drawdown = drawdown
            worst_peak_index = peak_index
            trough_index = index

    recovery_index: int | None = None
    peak_value = points[worst_peak_index].value
    for index in range(trough_index + 1, len(points)):
        if points[index].value >= peak_value:
            recovery_index = index
            break

    return {
        "max_drawdown": abs(max_drawdown),
        "peak_date": points[worst_peak_index].date,
        "trough_date": points[trough_index].date,
        "recovery_date": points[recovery_index].date if recovery_index is not None else None,
        "recovery_days": (
            (points[recovery_index].date - points[trough_index].date).days
            if recovery_index is not None
            else None
        ),
    }


def downside_deviation(
    returns: Sequence[float], minimum_acceptable_return: float = 0.0, periods_per_year: int = 252
) -> float:
    if not returns:
        return 0.0
    downside_squares = [min(value - minimum_acceptable_return, 0.0) ** 2 for value in returns]
    return sqrt(fmean(downside_squares)) * sqrt(periods_per_year)


def historical_var(returns: Sequence[float], confidence: float = 0.95) -> float:
    if not 0 < confidence < 1:
        raise MetricInputError("VaR 置信度必须在 0 与 1 之间")
    if not returns:
        return 0.0
    ordered = sorted(returns)
    position = (len(ordered) - 1) * (1 - confidence)
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    weight = position - lower
    quantile = ordered[lower] * (1 - weight) + ordered[upper] * weight
    return max(0.0, -quantile)


def calculate_nav_metrics(
    points: Sequence[NavPoint],
    *,
    risk_free_rate: float = 0.0,
    periods_per_year: int = 252,
    var_confidence: float = 0.95,
) -> dict[str, object]:
    returns = periodic_returns(points)
    annual_return = annualized_return(points)
    volatility = annualized_volatility(returns, periods_per_year)
    drawdown = drawdown_details(points)
    excess_return = annual_return - risk_free_rate
    downside = downside_deviation(returns, periods_per_year=periods_per_year)
    max_drawdown = float(drawdown["max_drawdown"])
    return {
        "calculation_version": CALCULATION_VERSION,
        "observations": len(points),
        "start_date": points[0].date,
        "end_date": points[-1].date,
        "total_return": total_return(points),
        "annualized_return": annual_return,
        "annualized_volatility": volatility,
        "max_drawdown": max_drawdown,
        "drawdown_peak_date": drawdown["peak_date"],
        "drawdown_trough_date": drawdown["trough_date"],
        "recovery_date": drawdown["recovery_date"],
        "recovery_days": drawdown["recovery_days"],
        "sharpe": excess_return / volatility if volatility > 0 else None,
        "sortino": excess_return / downside if downside > 0 else None,
        "calmar": annual_return / max_drawdown if max_drawdown > 0 else None,
        "historical_var": historical_var(returns, var_confidence),
        "var_confidence": var_confidence,
    }


def concentration_metrics(weights: Iterable[float], top_n: int = 10) -> dict[str, float]:
    normalized = [float(weight) for weight in weights]
    if any(weight < 0 for weight in normalized):
        raise MetricInputError("权重不可为负数")
    total = sum(normalized)
    if total <= 0:
        raise MetricInputError("权重合计必须为正数")
    shares = sorted((weight / total for weight in normalized), reverse=True)
    return {
        "hhi": sum(weight * weight for weight in shares),
        "top_n_weight": sum(shares[:top_n]),
        "largest_weight": shares[0],
    }


def pearson_correlation(left: Sequence[float], right: Sequence[float]) -> float | None:
    if len(left) != len(right):
        raise MetricInputError("相关性序列长度必须一致")
    if len(left) < 2:
        return None
    left_mean, right_mean = fmean(left), fmean(right)
    numerator = sum((x - left_mean) * (y - right_mean) for x, y in zip(left, right, strict=True))
    left_sum = sum((x - left_mean) ** 2 for x in left)
    right_sum = sum((y - right_mean) ** 2 for y in right)
    denominator = sqrt(left_sum * right_sum)
    return numerator / denominator if denominator > 0 else None


def holding_overlap(left: Mapping[str, float], right: Mapping[str, float]) -> float:
    if any(value < 0 for value in (*left.values(), *right.values())):
        raise MetricInputError("持仓权重不可为负数")
    left_total, right_total = sum(left.values()), sum(right.values())
    if left_total <= 0 or right_total <= 0:
        raise MetricInputError("两组持仓权重合计都必须为正数")
    securities = set(left) | set(right)
    return sum(
        min(left.get(code, 0.0) / left_total, right.get(code, 0.0) / right_total)
        for code in securities
    )

