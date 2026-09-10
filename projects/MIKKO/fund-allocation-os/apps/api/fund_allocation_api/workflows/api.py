from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_session
from ..security import Principal, enforce_actor, mutation_rate_limit, require_permission
from .companion import CompanionWorkflowInput, run_companion_workflow
from .discovery import DiscoveryWorkflowInput, run_discovery_workflow
from .engine import WorkflowExecutionError
from .fund_research import FundResearchWorkflowInput, run_fund_research_workflow
from .pool_maintenance import PoolMaintenanceWorkflowInput, run_pool_maintenance_workflow
from .portfolio_diagnosis import PortfolioDiagnosisWorkflowInput, run_portfolio_diagnosis_workflow


router = APIRouter(prefix="/api/v1/workflows", tags=["workflows"])


def _execute(session: Session, operation):
    try:
        result = operation()
        session.commit()
        return result
    except WorkflowExecutionError as exc:
        session.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/fund-discovery")
def fund_discovery(
    request: DiscoveryWorkflowInput,
    session: Session = Depends(get_session),
    principal: Principal = Depends(require_permission("workflow:discovery")),
    _rate_limit: None = Depends(mutation_rate_limit),
):
    request = request.model_copy(update={"actor_id": enforce_actor(principal, request.actor_id)})
    return _execute(session, lambda: run_discovery_workflow(session, request))


@router.post("/fund-research")
def fund_research(
    request: FundResearchWorkflowInput,
    session: Session = Depends(get_session),
    principal: Principal = Depends(require_permission("workflow:research")),
    _rate_limit: None = Depends(mutation_rate_limit),
):
    request = request.model_copy(update={"actor_id": enforce_actor(principal, request.actor_id)})
    return _execute(session, lambda: run_fund_research_workflow(session, request))


@router.post("/portfolio-diagnosis")
def portfolio_diagnosis(
    request: PortfolioDiagnosisWorkflowInput,
    session: Session = Depends(get_session),
    principal: Principal = Depends(require_permission("workflow:portfolio")),
    _rate_limit: None = Depends(mutation_rate_limit),
):
    request = request.model_copy(update={"actor_id": enforce_actor(principal, request.actor_id)})
    return _execute(session, lambda: run_portfolio_diagnosis_workflow(session, request))


@router.post("/fund-pool-maintenance")
def fund_pool_maintenance(
    request: PoolMaintenanceWorkflowInput,
    session: Session = Depends(get_session),
    principal: Principal = Depends(require_permission("fund_pool:approve")),
    _rate_limit: None = Depends(mutation_rate_limit),
):
    request = request.model_copy(update={"actor_id": enforce_actor(principal, request.actor_id)})
    return _execute(session, lambda: run_pool_maintenance_workflow(session, request))


@router.post("/post-investment-companion")
def post_investment_companion(
    request: CompanionWorkflowInput,
    session: Session = Depends(get_session),
    principal: Principal = Depends(require_permission("workflow:companion")),
    _rate_limit: None = Depends(mutation_rate_limit),
):
    request = request.model_copy(update={"actor_id": enforce_actor(principal, request.actor_id)})
    return _execute(session, lambda: run_companion_workflow(session, request))
