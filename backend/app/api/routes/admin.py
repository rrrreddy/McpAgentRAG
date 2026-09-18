"""Admin endpoints: entitlement management and audit-log review.

These are the human controls behind the automated ACL/RLS enforcement
elsewhere in the system — a data steward grants/revokes the
security_groups that everything else (RAG retrieval, db-mcp row/column
security) checks against.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import CurrentUser, require_role
from app.db.models import AuditEvent, User
from app.db.session import get_db_session
from app.gateway.model_gateway import get_model_gateway

router = APIRouter(prefix="/api/admin", tags=["admin"])


class EntitlementUpdateRequest(BaseModel):
    security_groups: list[str]


class AuditEventOut(BaseModel):
    id: uuid.UUID
    correlation_id: str
    actor: str
    event_type: str
    resource: str
    decision: str
    latency_ms: int | None
    created_at: str


@router.patch("/users/{user_id}/entitlements", status_code=status.HTTP_200_OK)
async def update_entitlements(
    user_id: uuid.UUID,
    payload: EntitlementUpdateRequest,
    current_user: CurrentUser = Depends(require_role("admin", "data_steward")),
    session: AsyncSession = Depends(get_db_session),
):
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.security_groups = payload.security_groups
    await session.commit()
    return {"user_id": str(user.id), "security_groups": user.security_groups}


@router.get("/audit-log", response_model=list[AuditEventOut])
async def get_audit_log(
    limit: int = Query(default=50, le=200),
    event_type: str | None = None,
    current_user: CurrentUser = Depends(require_role("admin", "data_steward")),
    session: AsyncSession = Depends(get_db_session),
):
    stmt = select(AuditEvent).order_by(AuditEvent.created_at.desc()).limit(limit)
    if event_type:
        stmt = stmt.where(AuditEvent.event_type == event_type)
    result = await session.execute(stmt)
    rows = result.scalars().all()
    return [
        AuditEventOut(
            id=r.id, correlation_id=r.correlation_id, actor=r.actor, event_type=r.event_type,
            resource=r.resource, decision=r.decision, latency_ms=r.latency_ms, created_at=r.created_at.isoformat(),
        )
        for r in rows
    ]


@router.get("/gateway/health")
async def gateway_health(current_user: CurrentUser = Depends(require_role("admin"))):
    gateway = get_model_gateway()
    return await gateway.health()
