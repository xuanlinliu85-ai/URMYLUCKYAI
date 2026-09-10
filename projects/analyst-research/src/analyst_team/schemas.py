from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class IdentityEvidence(BaseModel):
    url: str
    claim: str


class AccountCandidate(BaseModel):
    analyst_id: str
    display_name: str
    wechat_name: str
    wechat_public_id: str
    wechat_mp_id: str | None = None
    verified_article_url: str | None = None
    verified: bool = False
    identity_evidence: list[IdentityEvidence] = Field(default_factory=list)


class MarketView(BaseModel):
    target: str
    direction: Literal["bullish", "neutral", "bearish"]
    horizon: str


class ArticleDistillation(BaseModel):
    article_id: str
    title: str
    published_at: datetime | None = None
    core_thesis: list[str]
    drivers: list[str]
    causal_chains: list[list[str]]
    market_views: list[MarketView]
    evidence: list[str]
    invalidators: list[str]
    historical_analogies: list[str]


class EvidenceBackedRule(BaseModel):
    rule: str
    supporting_articles: list[str] = Field(min_length=1)


class AnalystDNA(BaseModel):
    core_variables: list[EvidenceBackedRule]
    analysis_starting_points: list[EvidenceBackedRule]
    causal_reasoning_patterns: list[EvidenceBackedRule]
    asset_mapping_patterns: list[EvidenceBackedRule]
    historical_analogy_patterns: list[EvidenceBackedRule]
    contrarian_patterns: list[EvidenceBackedRule]
    invalidation_patterns: list[EvidenceBackedRule]
    signature_frameworks: list[EvidenceBackedRule]


class SourceArticle(BaseModel):
    article_id: str
    title: str
    url: str | None = None


class AnalystAnswer(BaseModel):
    historical_views: list[str]
    core_framework: list[str]
    current_mapping: list[str]
    model_inference: list[str]
    invalidation_conditions: list[str]
    sources: list[SourceArticle]
