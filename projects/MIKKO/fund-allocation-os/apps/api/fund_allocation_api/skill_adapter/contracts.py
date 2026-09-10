from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class SourceReference(BaseModel):
    source: str
    snapshot_id: str | None = None
    as_of: datetime | date | None = None
    quality_status: str = "unverified"


class SkillContext(BaseModel):
    subject_type: str = "adhoc"
    subject_id: str | None = None
    actor_id: str | None = None
    workflow_id: str | None = None
    data_snapshot_ids: list[str] = Field(default_factory=list)
    source_references: list[SourceReference] = Field(default_factory=list)


class SkillPayload(BaseModel):
    structured_output: dict[str, Any]
    narrative_output: str | None = None
    warnings: list[str] = Field(default_factory=list)
    sources: list[SourceReference] = Field(default_factory=list)
    model_version: str | None = None
    prompt_hash: str | None = None


class SkillResult(BaseModel):
    status: Literal["success", "warning", "failed", "unavailable"]
    skill_name: str
    skill_version: str
    structured_output: dict[str, Any] | None = None
    narrative_output: str | None = None
    warnings: list[str] = Field(default_factory=list)
    sources: list[SourceReference] = Field(default_factory=list)
    started_at: datetime
    finished_at: datetime
    input_hash: str
    model_version: str | None = None
    prompt_hash: str | None = None
    error_code: str | None = None
    workflow_run_id: str
    skill_run_id: str


class RunSkillRequest(BaseModel):
    skill_name: str
    input: dict[str, Any]
    context: SkillContext = Field(default_factory=SkillContext)

