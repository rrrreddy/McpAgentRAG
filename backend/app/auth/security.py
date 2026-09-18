"""Password hashing and JWT issuance/verification.

Access tokens are short-lived (default 30 min) and carry the user's role
and security_groups as claims so downstream authorization checks (D3:
"API -> Agents: only authorized agent capabilities for that user's scopes
are invocable") never need a database round-trip on the hot path. Refresh
tokens are long-lived, opaque-by-jti, and checked against a server-side
allowlist (RefreshToken table) so they can be revoked.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from passlib.context import CryptContext

from app.config import get_settings

settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(*, user_id: str, email: str, role: str, security_groups: list[str]) -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": user_id,
        "email": email,
        "role": role,
        "groups": security_groups,
        "type": "access",
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_expire_minutes),
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_refresh_token(*, user_id: str) -> tuple[str, str, datetime]:
    """Returns (token, jti, expires_at). Caller persists jti server-side."""
    now = datetime.now(timezone.utc)
    jti = str(uuid.uuid4())
    expires_at = now + timedelta(minutes=settings.refresh_token_expire_minutes)
    payload = {"sub": user_id, "type": "refresh", "iat": now, "exp": expires_at, "jti": jti}
    token = jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    return token, jti, expires_at


class TokenError(Exception):
    pass


def decode_token(token: str, *, expected_type: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError as exc:
        raise TokenError("token_expired") from exc
    except jwt.InvalidTokenError as exc:
        raise TokenError("token_invalid") from exc
    if payload.get("type") != expected_type:
        raise TokenError("token_type_mismatch")
    return payload
