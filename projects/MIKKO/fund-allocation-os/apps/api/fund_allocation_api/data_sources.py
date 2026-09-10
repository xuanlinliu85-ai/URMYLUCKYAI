from __future__ import annotations

import hashlib
import json
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import DataSource, DataSourceSnapshot


def payload_hash(payload: Any) -> str:
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def record_data_snapshot(
    session: Session,
    *,
    provider: str,
    dataset: str,
    request: dict[str, Any],
    raw_payload: Any,
    as_of: datetime,
    schema_version: str,
    quality_status: str,
    license_scope: str | None = None,
    priority: int = 100,
    storage_ref: str | None = None,
) -> DataSourceSnapshot:
    source = session.scalar(
        select(DataSource).where(DataSource.provider == provider, DataSource.dataset == dataset)
    )
    if source is None:
        source = DataSource(
            provider=provider,
            dataset=dataset,
            license_scope=license_scope,
            priority=priority,
            active=True,
        )
        session.add(source)
        session.flush()
    snapshot = DataSourceSnapshot(
        source_id=source.id,
        request_json=request,
        as_of=as_of,
        raw_hash=payload_hash(raw_payload),
        storage_ref=storage_ref,
        schema_version=schema_version,
        quality_status=quality_status,
    )
    session.add(snapshot)
    session.flush()
    return snapshot

