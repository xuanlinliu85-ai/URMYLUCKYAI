import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from fund_allocation_api.database import Base
from fund_allocation_api import models  # noqa: F401
from fund_allocation_api.config import get_settings
from fund_allocation_api.security import Principal, create_access_token, rate_limiter


@pytest.fixture(autouse=True)
def clear_rate_limiter() -> None:
    rate_limiter.clear()


@pytest.fixture
def auth_headers():
    def build(role: str = "admin", user_id: str = "auth-user") -> dict[str, str]:
        token = create_access_token(
            Principal(user_id=user_id, role=role, email=f"{role}@example.test"),
            get_settings().auth_signing_secret,
        )
        return {"Authorization": f"Bearer {token}"}

    return build


@pytest.fixture
def session() -> Session:
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _foreign_keys(dbapi_connection, _connection_record) -> None:
        dbapi_connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as db:
        yield db
