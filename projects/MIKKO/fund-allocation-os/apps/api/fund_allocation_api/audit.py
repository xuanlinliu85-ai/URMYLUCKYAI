import hashlib
import json
from typing import Any

from sqlalchemy import inspect
from sqlalchemy.orm import Session

from .models import AuditLog


def model_snapshot(instance: Any) -> dict[str, Any]:
    mapper = inspect(instance).mapper
    return {column.key: getattr(instance, column.key) for column in mapper.column_attrs}


def snapshot_hash(snapshot: dict[str, Any] | None) -> str | None:
    if snapshot is None:
        return None
    encoded = json.dumps(snapshot, ensure_ascii=False, sort_keys=True, default=str).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def append_audit_log(
    session: Session,
    *,
    actor_id: str | None,
    action: str,
    object_type: str,
    object_id: str,
    before: dict[str, Any] | None,
    after: dict[str, Any] | None,
    reason: str | None = None,
    request_id: str | None = None,
) -> AuditLog:
    entry = AuditLog(
        actor_id=actor_id,
        action=action,
        object_type=object_type,
        object_id=object_id,
        before_hash=snapshot_hash(before),
        after_hash=snapshot_hash(after),
        reason=reason,
        request_id=request_id,
    )
    session.add(entry)
    return entry

