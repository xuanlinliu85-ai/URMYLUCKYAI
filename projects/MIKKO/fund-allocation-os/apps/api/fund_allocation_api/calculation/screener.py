from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from statistics import fmean, pstdev
from typing import Any, Iterable


SCREENER_VERSION = "fund-universe-screener-v1"


@dataclass(frozen=True)
class FundCandidate:
    fund_code: str
    peer_group: str
    aum: float | None
    history_days: int | None
    annualized_return: float | None
    annualized_volatility: float | None
    max_drawdown: float | None
    sharpe: float | None
    data_quality_status: str = "verified"


@dataclass(frozen=True)
class ScreeningRules:
    minimum_aum: float = 100_000_000
    minimum_history_days: int = 730
    maximum_drawdown: float = 0.50
    allowed_quality_statuses: tuple[str, ...] = ("verified", "validated")
    minimum_group_size: int = 2


def _hard_filter(candidate: FundCandidate, rules: ScreeningRules) -> list[str]:
    reasons: list[str] = []
    required = {
        "aum": candidate.aum,
        "history_days": candidate.history_days,
        "annualized_return": candidate.annualized_return,
        "annualized_volatility": candidate.annualized_volatility,
        "max_drawdown": candidate.max_drawdown,
        "sharpe": candidate.sharpe,
    }
    missing = [name for name, value in required.items() if value is None]
    if missing:
        reasons.append(f"missing:{','.join(sorted(missing))}")
    if candidate.data_quality_status not in rules.allowed_quality_statuses:
        reasons.append("data_quality_not_eligible")
    if candidate.aum is not None and candidate.aum < rules.minimum_aum:
        reasons.append("aum_below_minimum")
    if candidate.history_days is not None and candidate.history_days < rules.minimum_history_days:
        reasons.append("history_too_short")
    if candidate.max_drawdown is not None and candidate.max_drawdown > rules.maximum_drawdown:
        reasons.append("drawdown_above_maximum")
    if not candidate.peer_group.strip():
        reasons.append("missing_peer_group")
    return reasons


def _z_scores(values: list[float], *, higher_is_better: bool) -> list[float]:
    dispersion = pstdev(values)
    if dispersion == 0:
        return [0.0] * len(values)
    direction = 1.0 if higher_is_better else -1.0
    average = fmean(values)
    return [direction * (value - average) / dispersion for value in values]


def screen_fund_universe(
    candidates: Iterable[FundCandidate], rules: ScreeningRules | None = None
) -> dict[str, Any]:
    active_rules = rules or ScreeningRules()
    candidate_list = list(candidates)
    filter_reasons = {item.fund_code: _hard_filter(item, active_rules) for item in candidate_list}
    eligible = [item for item in candidate_list if not filter_reasons[item.fund_code]]
    grouped: dict[str, list[FundCandidate]] = defaultdict(list)
    for item in eligible:
        grouped[item.peer_group].append(item)

    results: list[dict[str, Any]] = []
    for candidate in candidate_list:
        reasons = filter_reasons[candidate.fund_code]
        if reasons:
            results.append(
                {
                    "fund_code": candidate.fund_code,
                    "peer_group": candidate.peer_group,
                    "eligible": False,
                    "rank": None,
                    "percentile": None,
                    "quantitative_score": None,
                    "flags": reasons,
                }
            )

    for peer_group, members in sorted(grouped.items()):
        if len(members) < active_rules.minimum_group_size:
            for item in members:
                results.append(
                    {
                        "fund_code": item.fund_code,
                        "peer_group": peer_group,
                        "eligible": False,
                        "rank": None,
                        "percentile": None,
                        "quantitative_score": None,
                        "flags": ["peer_group_too_small"],
                    }
                )
            continue

        metric_specs = (
            ("annualized_return", True, 0.35),
            ("sharpe", True, 0.30),
            ("max_drawdown", False, 0.20),
            ("annualized_volatility", False, 0.15),
        )
        scores = [0.0] * len(members)
        for field, higher_is_better, weight in metric_specs:
            values = [float(getattr(item, field)) for item in members]
            for index, z_score in enumerate(_z_scores(values, higher_is_better=higher_is_better)):
                scores[index] += z_score * weight

        ordering = sorted(range(len(members)), key=lambda index: (-scores[index], members[index].fund_code))
        ranks = {member_index: rank for rank, member_index in enumerate(ordering, start=1)}
        denominator = max(len(members) - 1, 1)
        for index, item in enumerate(members):
            rank = ranks[index]
            percentile = 1 - (rank - 1) / denominator
            results.append(
                {
                    "fund_code": item.fund_code,
                    "peer_group": peer_group,
                    "eligible": True,
                    "rank": rank,
                    "percentile": percentile,
                    "quantitative_score": scores[index],
                    "flags": [],
                }
            )

    results.sort(key=lambda item: (item["peer_group"], not item["eligible"], item["rank"] or 10**9, item["fund_code"]))
    return {
        "screener_version": SCREENER_VERSION,
        "total_funds": len(candidate_list),
        "eligible_funds": sum(1 for item in results if item["eligible"]),
        "results": results,
    }

