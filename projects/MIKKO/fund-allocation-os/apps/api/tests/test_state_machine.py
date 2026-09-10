from sqlalchemy import func, select

from fund_allocation_api.models import (
    AuditLog,
    Client,
    ClientCommunication,
    ClientProfile,
    Recommendation,
    SuitabilityAssessment,
    User,
)
from fund_allocation_api.state_machine import (
    WorkflowGuardError,
    transition_communication,
    transition_recommendation,
)


def seed_recommendation(session):
    advisor = User(email="advisor@example.test", role="advisor")
    client_user = User(email="client@example.test", role="client")
    session.add_all([advisor, client_user])
    session.flush()
    client = Client(user_id=client_user.id, advisor_id=advisor.id, client_no="C-001")
    session.add(client)
    session.flush()
    profile = ClientProfile(
        client_id=client.id,
        version=1,
        risk_level="balanced",
        investment_goal="长期稳健增值",
        horizon_months=60,
        max_acceptable_drawdown=0.15,
        questionnaire_version="v1",
    )
    recommendation = Recommendation(
        client_id=client.id,
        recommendation_type="allocation",
        created_by=advisor.id,
        reasoning_summary="基于客户目标和风险预算形成的配置建议。",
        risk_disclosure="基金净值可能波动，历史表现不代表未来。",
    )
    session.add_all([profile, recommendation])
    session.flush()
    return advisor, client, profile, recommendation


def test_recommendation_requires_suitability_and_human_compliance(session) -> None:
    advisor, _, profile, recommendation = seed_recommendation(session)
    transition_recommendation(
        session,
        recommendation,
        "pending_compliance",
        actor_id=advisor.id,
        reason="提交复核",
    )

    try:
        transition_recommendation(
            session, recommendation, "approved", actor_id=advisor.id, reason="尝试批准"
        )
    except WorkflowGuardError as exc:
        assert "适当性" in str(exc)
    else:
        raise AssertionError("approval should have been blocked")

    session.add(
        SuitabilityAssessment(
            client_profile_id=profile.id,
            recommendation_id=recommendation.id,
            rules_version="v1",
            outcome="pass",
        )
    )
    recommendation.compliance_status = "approved"
    recommendation.reviewer_id = advisor.id
    session.flush()
    transition_recommendation(
        session, recommendation, "approved", actor_id=advisor.id, reason="人工审核通过"
    )

    assert recommendation.status == "approved"
    audit_count = session.scalar(select(func.count()).select_from(AuditLog))
    assert audit_count == 2


def test_unapproved_recommendation_cannot_be_sent(session) -> None:
    advisor, client, _, recommendation = seed_recommendation(session)
    communication = ClientCommunication(
        client_id=client.id,
        recommendation_id=recommendation.id,
        channel="portal",
        template_version="v1",
        approved_facts={"recommendation_id": recommendation.id},
        content="请查看配置建议。",
        reviewer_id=advisor.id,
    )
    session.add(communication)
    session.flush()
    transition_communication(
        session, communication, "reviewed", actor_id=advisor.id, reason="内容复核"
    )

    try:
        transition_communication(
            session, communication, "sent", actor_id=advisor.id, reason="发送客户"
        )
    except WorkflowGuardError as exc:
        assert "已批准" in str(exc)
    else:
        raise AssertionError("sending should have been blocked")

