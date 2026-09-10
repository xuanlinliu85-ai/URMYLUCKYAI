from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import threading
import time
from collections import defaultdict, deque
from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from .config import Settings, get_settings


SUPPORTED_ROLES = {"admin", "advisor", "research", "compliance", "operations", "client"}

ROLE_PERMISSIONS: dict[str, set[str]] = {
    "admin": {"*"},
    "advisor": {
        "provider:read", "skill:read", "skill:run", "workflow:discovery",
        "workflow:research", "workflow:portfolio", "workflow:companion",
        "recommendation:review", "consent:self",
    },
    "research": {
        "provider:read", "skill:read", "skill:run", "workflow:discovery",
        "workflow:research", "consent:self",
    },
    "compliance": {
        "recommendation:review", "recommendation:approve", "audit:read",
        "workflow:companion", "consent:self",
    },
    "operations": {
        "provider:read", "skill:read", "skill:run", "workflow:discovery",
        "automation:manage", "audit:read", "consent:self",
    },
    "client": {"consent:self"},
}


class Principal(BaseModel):
    user_id: str
    role: str
    email: str | None = None


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _b64decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def create_access_token(
    principal: Principal,
    secret: str,
    ttl_seconds: int = 3600,
    *,
    now: int | None = None,
) -> str:
    issued_at = int(time.time() if now is None else now)
    payload = {
        "sub": principal.user_id,
        "role": principal.role,
        "email": principal.email,
        "iat": issued_at,
        "exp": issued_at + ttl_seconds,
    }
    encoded = _b64encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode())
    signature = _b64encode(hmac.new(secret.encode(), encoded.encode(), hashlib.sha256).digest())
    return f"{encoded}.{signature}"


def decode_access_token(token: str, secret: str, *, now: int | None = None) -> Principal:
    try:
        encoded, signature = token.split(".", 1)
        expected = _b64encode(hmac.new(secret.encode(), encoded.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected):
            raise ValueError("signature mismatch")
        payload = json.loads(_b64decode(encoded))
        current = int(time.time() if now is None else now)
        if int(payload["exp"]) <= current:
            raise ValueError("token expired")
        if payload["role"] not in SUPPORTED_ROLES or not payload.get("sub"):
            raise ValueError("invalid principal")
        return Principal(user_id=payload["sub"], role=payload["role"], email=payload.get("email"))
    except (KeyError, TypeError, ValueError, json.JSONDecodeError, binascii.Error) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


bearer = HTTPBearer(auto_error=False)


def get_current_principal(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Principal:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if settings.environment.lower() in {"production", "prod"} and (
        not settings.auth_signing_secret
        or settings.auth_signing_secret == "development-only-change-me"
    ):
        raise HTTPException(status_code=503, detail="Authentication is not configured")
    return decode_access_token(credentials.credentials, settings.auth_signing_secret)


def require_permission(permission: str) -> Callable:
    def dependency(
        principal: Annotated[Principal, Depends(get_current_principal)],
    ) -> Principal:
        allowed = ROLE_PERMISSIONS.get(principal.role, set())
        if "*" not in allowed and permission not in allowed:
            raise HTTPException(status_code=403, detail="Insufficient permission")
        return principal

    return dependency


def enforce_actor(principal: Principal, actor_id: str | None) -> str:
    if actor_id is not None and actor_id != principal.user_id:
        raise HTTPException(status_code=403, detail="actor_id must match authenticated identity")
    return principal.user_id


class InMemoryRateLimiter:
    def __init__(self) -> None:
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str, limit: int, window_seconds: int = 60) -> None:
        now = time.monotonic()
        with self._lock:
            events = self._events[key]
            while events and events[0] <= now - window_seconds:
                events.popleft()
            if len(events) >= limit:
                raise HTTPException(status_code=429, detail="Rate limit exceeded")
            events.append(now)

    def clear(self) -> None:
        with self._lock:
            self._events.clear()


rate_limiter = InMemoryRateLimiter()


def mutation_rate_limit(
    request: Request,
    principal: Annotated[Principal, Depends(get_current_principal)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> None:
    rate_limiter.check(
        f"{principal.user_id}:{request.url.path}",
        settings.auth_rate_limit_per_minute,
    )
