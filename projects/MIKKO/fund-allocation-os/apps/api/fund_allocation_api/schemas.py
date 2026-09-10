from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ApiHealth(BaseModel):
    status: str
    service: str
    version: str


class ProviderHealth(BaseModel):
    status: str
    compatible: bool
    source: str = "iFinD MCP"
    checkedAt: datetime | None = None
    message: str | None = None
    details: dict[str, Any] = Field(default_factory=dict)


class TransitionRequest(BaseModel):
    target_status: str
    actor_id: str
    reason: str = Field(min_length=1, max_length=2000)
    request_id: str | None = None


class RecommendationView(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    client_id: str
    status: str
    compliance_status: str
    reviewer_id: str | None
    version: int


class ConsentRequest(BaseModel):
    consent_type: str = Field(min_length=1, max_length=64)
    document_version: str = Field(min_length=1, max_length=32)
    granted: bool
    evidence_ref: str | None = Field(default=None, max_length=512)


class ConsentView(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    consent_type: str
    document_version: str
    granted: bool
    granted_at: datetime | None
    revoked_at: datetime | None
