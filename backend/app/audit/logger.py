"""Audit trail writer.

Every MCP tool invocation, retrieval, and authorization decision is
written here. This is what lets a security reviewer answer "who saw what,
when, and under what authorization" after the fact — the actual point of
D5's "audit record per tool invocation" requirement.
"""
from __future__ import annotations

import time
import uuid
from contextlib import asynccontextmanager
from typing import Any

from app.db.models import AuditEvent
from app.db.session import session_scope
from app.logging_config import get_logger

logger = get_logger("audit")


async def record_audit_event(
    *,
    correlation_id: str,
    user_id: str | None,
    actor: str,
    event_type: str,
    resource: str,
    decision: str,
    detail: dict[str, Any] | None = None,
    latency_ms: int | None = None,
) -> None:
    detail = detail or {}
    logger.info(
        "audit_event",
        correlation_id=correlation_id,
        actor=actor,
        event_type=event_type,
        resource=resource,
        decision=decision,
        latency_ms=latency_ms,
    )
    async with session_scope() as session:
        session.add(
            AuditEvent(
                correlation_id=correlation_id,
                user_id=uuid.UUID(user_id) if user_id else None,
                actor=actor,
                event_type=event_type,
                resource=resource,
                decision=decision,
                detail=detail,
                latency_ms=latency_ms,
            )
        )


@asynccontextmanager
async def audit_span(*, correlation_id: str, user_id: str | None, actor: str, event_type: str, resource: str, detail: dict | None = None):
    """Context manager that always emits exactly one audit row, recording
    'allow' on clean exit or 'error' if the wrapped operation raises."""
    start = time.perf_counter()
    decision = "allow"
    error_detail: dict[str, Any] = {}
    try:
        yield
    except PermissionError as exc:
        decision = "deny"
        error_detail = {"reason": str(exc)}
        raise
    except Exception as exc:  # noqa: BLE001 - we want to audit and re-raise everything
        decision = "error"
        error_detail = {"error": str(exc)}
        raise
    finally:
        latency_ms = int((time.perf_counter() - start) * 1000)
        await record_audit_event(
            correlation_id=correlation_id,
            user_id=user_id,
            actor=actor,
            event_type=event_type,
            resource=resource,
            decision=decision,
            detail={**(detail or {}), **error_detail},
            latency_ms=latency_ms,
        )
