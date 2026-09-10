"""Auditable Fund Allocation OS workflows."""

from .discovery import DiscoveryWorkflowInput, run_discovery_workflow
from .fund_research import FundResearchWorkflowInput, run_fund_research_workflow
from .portfolio_diagnosis import PortfolioDiagnosisWorkflowInput, run_portfolio_diagnosis_workflow
from .pool_maintenance import PoolMaintenanceWorkflowInput, run_pool_maintenance_workflow
from .companion import CompanionWorkflowInput, run_companion_workflow

__all__ = [
    "DiscoveryWorkflowInput",
    "FundResearchWorkflowInput",
    "PortfolioDiagnosisWorkflowInput",
    "PoolMaintenanceWorkflowInput",
    "CompanionWorkflowInput",
    "run_discovery_workflow",
    "run_fund_research_workflow",
    "run_portfolio_diagnosis_workflow",
    "run_pool_maintenance_workflow",
    "run_companion_workflow",
]
