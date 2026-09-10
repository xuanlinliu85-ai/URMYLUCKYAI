from fund_allocation_api.calculation.comparable_groups import resolve_comparable_group
from fund_allocation_api.calculation.data_quality import validate_universe_rows


def test_universe_quality_marks_duplicates_and_missing_fields() -> None:
    result = validate_universe_rows(
        [
            {"fund_code": "000001.OF", "fund_name": "基金一", "investment_type": "偏股混合"},
            {"fund_code": "000001.OF", "fund_name": "基金一A", "investment_type": "偏股混合"},
            {"fund_code": "bad", "fund_name": "", "investment_type": ""},
        ]
    )
    assert result["invalid_rows"] == 3
    assert result["validated_rows"] == 0


def test_comparable_group_resolution_is_versioned_and_explicit_for_unknown() -> None:
    equity = resolve_comparable_group("偏股混合型")
    unknown = resolve_comparable_group("其他创新类型")
    assert equity.code == "equity-biased-hybrid"
    assert equity.quality_status == "mapped"
    assert unknown.code is None
    assert unknown.quality_status == "unmapped"

