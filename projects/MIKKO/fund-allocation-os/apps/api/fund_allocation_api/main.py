from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import __version__
from .automation.api import router as automation_router
from .config import Settings, get_settings
from .database import get_session
from .audit import append_audit_log, model_snapshot
from .models import Consent, Recommendation, User
from .providers.ifind import IfindBridgeError, check_ifind_health, get_ifind_universe
from .schemas import (
    ApiHealth,
    ConsentRequest,
    ConsentView,
    ProviderHealth,
    RecommendationView,
    TransitionRequest,
)
from .security import (
    Principal,
    enforce_actor,
    mutation_rate_limit,
    require_permission,
)
from .state_machine import WorkflowGuardError, transition_recommendation
from .skill_adapter.contracts import RunSkillRequest, SkillResult
from .skill_adapter.registry import registry
from .skill_adapter.service import SkillNotFoundError, run_skill
from .workflows.api import router as workflow_router


app = FastAPI(title="Fund Allocation OS API", version=__version__)
app.include_router(workflow_router)
app.include_router(automation_router)


@app.get("/health", response_model=ApiHealth)
def health(settings: Settings = Depends(get_settings)) -> ApiHealth:
    return ApiHealth(status="ok", service=settings.app_name, version=__version__)


@app.get("/api/v1/providers/ifind/health", response_model=ProviderHealth)
async def ifind_health(
    response: Response,
    settings: Settings = Depends(get_settings),
    _principal: Principal = Depends(require_permission("provider:read")),
) -> ProviderHealth:
    try:
        payload = await check_ifind_health(settings)
    except IfindBridgeError as exc:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return ProviderHealth(status="error", compatible=False, message=str(exc))

    known = {"status", "compatible", "source", "checkedAt", "message"}
    return ProviderHealth(
        status=str(payload.get("status", "error")),
        compatible=bool(payload.get("compatible", False)),
        source=str(payload.get("source", "iFinD MCP")),
        checkedAt=payload.get("checkedAt"),
        message=payload.get("message"),
        details={key: value for key, value in payload.items() if key not in known},
    )


@app.get("/api/v1/providers/ifind/universe")
async def ifind_universe_preview(
    response: Response,
    limit: int = Query(default=20, ge=1, le=200),
    settings: Settings = Depends(get_settings),
    _principal: Principal = Depends(require_permission("provider:read")),
):
    try:
        return await get_ifind_universe(settings, limit)
    except IfindBridgeError as exc:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "error", "source": "iFinD MCP", "message": str(exc), "rows": []}


@app.post(
    "/api/v1/recommendations/{recommendation_id}/transitions",
    response_model=RecommendationView,
)
def change_recommendation_status(
    recommendation_id: str,
    command: TransitionRequest,
    session: Session = Depends(get_session),
    principal: Principal = Depends(require_permission("recommendation:review")),
    _rate_limit: None = Depends(mutation_rate_limit),
) -> Recommendation:
    actor_id = enforce_actor(principal, command.actor_id)
    if command.target_status in {"approved", "rejected"}:
        # Dependency permissions are already authenticated; enforce the target-specific gate here.
        from .security import ROLE_PERMISSIONS

        permissions = ROLE_PERMISSIONS.get(principal.role, set())
        if "*" not in permissions and "recommendation:approve" not in permissions:
            raise HTTPException(status_code=403, detail="Compliance approval permission required")
    recommendation = session.get(Recommendation, recommendation_id)
    if recommendation is None:
        raise HTTPException(status_code=404, detail="Recommendation not found")
    try:
        transition_recommendation(
            session,
            recommendation,
            command.target_status,
            actor_id=actor_id,
            reason=command.reason,
            request_id=command.request_id,
        )
        session.commit()
    except WorkflowGuardError as exc:
        session.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return recommendation


@app.get("/api/v1/skills")
def list_skills(
    _principal: Principal = Depends(require_permission("skill:read")),
) -> list[dict]:
    return [
        {
            "name": item.name,
            "version": item.version,
            "execution_type": item.execution_type,
            "enabled": item.enabled,
            "source_ref": item.source_ref,
        }
        for item in registry.list()
    ]


@app.post("/api/v1/skills/run", response_model=SkillResult)
def execute_skill(
    request: RunSkillRequest,
    session: Session = Depends(get_session),
    principal: Principal = Depends(require_permission("skill:run")),
    _rate_limit: None = Depends(mutation_rate_limit),
) -> SkillResult:
    actor_id = enforce_actor(principal, request.context.actor_id)
    context = request.context.model_copy(update={"actor_id": actor_id})
    try:
        result = run_skill(session, request.skill_name, request.input, context)
        session.commit()
        return result
    except SkillNotFoundError as exc:
        session.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/v1/consents", response_model=list[ConsentView])
def list_consents(
    session: Session = Depends(get_session),
    principal: Principal = Depends(require_permission("consent:self")),
) -> list[Consent]:
    return list(
        session.scalars(
            select(Consent)
            .where(Consent.user_id == principal.user_id)
            .order_by(Consent.id.desc())
        )
    )


@app.post("/api/v1/consents", response_model=ConsentView, status_code=201)
def record_consent(
    command: ConsentRequest,
    session: Session = Depends(get_session),
    principal: Principal = Depends(require_permission("consent:self")),
    _rate_limit: None = Depends(mutation_rate_limit),
) -> Consent:
    if session.get(User, principal.user_id) is None:
        raise HTTPException(status_code=404, detail="Authenticated user is not provisioned")
    now = datetime.now(timezone.utc)
    consent = Consent(
        user_id=principal.user_id,
        consent_type=command.consent_type,
        document_version=command.document_version,
        granted=command.granted,
        granted_at=now if command.granted else None,
        revoked_at=None if command.granted else now,
        evidence_ref=command.evidence_ref,
    )
    session.add(consent)
    session.flush()
    append_audit_log(
        session,
        actor_id=principal.user_id,
        action="consent.granted" if command.granted else "consent.revoked",
        object_type="Consent",
        object_id=consent.id,
        before=None,
        after=model_snapshot(consent),
        reason=f"document_version={command.document_version}",
    )
    session.commit()
    return consent
