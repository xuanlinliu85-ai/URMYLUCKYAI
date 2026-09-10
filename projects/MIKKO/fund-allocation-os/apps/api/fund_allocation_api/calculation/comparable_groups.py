from __future__ import annotations

from dataclasses import dataclass


TAXONOMY_VERSION = "cn-public-fund-peer-groups-v1"


@dataclass(frozen=True)
class GroupResolution:
    code: str | None
    name: str | None
    taxonomy_version: str
    matched_rule: str | None
    quality_status: str


RULES: tuple[tuple[tuple[str, ...], str, str], ...] = (
    (("货币",), "money-market", "货币市场基金"),
    (("短债", "短期纯债"), "short-bond", "短期纯债基金"),
    (("中长期纯债", "纯债"), "core-bond", "中长期纯债基金"),
    (("一级债", "混合债券一级"), "bond-plus-low-equity", "一级债基/低权益固收+"),
    (("二级债", "混合债券二级", "固收+"), "bond-plus", "二级债基/固收+"),
    (("普通股票", "股票型"), "active-equity", "主动股票型基金"),
    (("偏股混合",), "equity-biased-hybrid", "偏股混合型基金"),
    (("灵活配置",), "flexible-allocation", "灵活配置型基金"),
    (("平衡混合", "股债平衡"), "balanced-hybrid", "股债平衡型基金"),
    (("增强指数",), "enhanced-index", "增强指数基金"),
    (("被动指数", "指数型", "ETF"), "passive-index", "被动指数基金"),
    (("QDII", "海外"), "overseas", "海外/QDII基金"),
    (("黄金",), "gold", "黄金基金"),
    (("商品",), "commodity", "商品基金"),
    (("FOF",), "fof", "基金中基金"),
    (("REIT",), "reit", "公募REITs"),
)


def resolve_comparable_group(investment_type: str | None, fund_name: str | None = None) -> GroupResolution:
    text = " ".join(part for part in (investment_type, fund_name) if part).upper()
    for keywords, code, name in RULES:
        for keyword in keywords:
            if keyword.upper() in text:
                return GroupResolution(code, name, TAXONOMY_VERSION, keyword, "mapped")
    return GroupResolution(None, None, TAXONOMY_VERSION, None, "unmapped")

