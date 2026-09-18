"""governance-mcp: entitlements, classification policy, and audit lookup
(D5). This server GRANTS NOTHING — it only reports on entitlements and
records/queries audit events. Actual access decisions are still made and
enforced by knowledge-mcp/db-mcp at the moment of retrieval; governance-mcp
exists so the Governance Agent (and human reviewers) can answer "is this
person even supposed to be able to ask that" and "what did they actually
see" without embedding that logic in every other server.
"""
from __future__ import annotations

import uvicorn
from mcp.server.fastmcp import FastMCP
from sqlalchemy import select

from app.config import get_settings
from app.db.models import AuditEvent
from app.db.session import SessionLocal
from app.mcp_servers.base import audited_tool, build_secured_app, get_caller_context

settings = get_settings()
mcp = FastMCP("governance-mcp", host="0.0.0.0", port=9104)

CLASSIFICATION_POLICY = {
    "PUBLIC": {"description": "No restriction.", "requires_group": None},
    "INTERNAL": {"description": "Bank employees only.", "requires_group": None},
    "CONFIDENTIAL": {"description": "Requires an explicit security group grant.", "requires_group": "varies by document"},
    "RESTRICTED": {"description": "Requires data-steward or admin role plus explicit grant.", "requires_group": "varies by document"},
}


@mcp.tool()
@audited_tool("governance_mcp")
async def check_user_entitlement(security_group: str) -> dict:
    """Report whether the CALLING user (never an arbitrary target user —
    this cannot be used to enumerate someone else's entitlements) holds a
    given security group."""
    ctx = get_caller_context()
    return {"security_group": security_group, "granted": security_group in ctx.security_groups, "user_id": ctx.user_id}


@mcp.tool()
@audited_tool("governance_mcp")
async def classification_policy(classification: str) -> dict:
    """Explain what a data classification label means and what it takes
    to access it — used by the Governance Agent to explain a denial."""
    policy = CLASSIFICATION_POLICY.get(classification.upper())
    if policy is None:
        raise ValueError(f"unknown classification '{classification}'; allowed: {list(CLASSIFICATION_POLICY)}")
    return {"classification": classification.upper(), **policy}


@mcp.tool()
@audited_tool("governance_mcp")
async def audit_event(event_type: str, resource: str, detail_note: str = "") -> dict:
    """Record a governance-relevant event explicitly raised by an agent
    (e.g. "user asked for data outside their entitlement, was denied and
    given an explanation"). Distinct from the automatic per-tool-call audit
    trail — this is for agent-level narrative events."""
    ctx = get_caller_context()
    from app.audit.logger import record_audit_event  # local import avoids a cycle with base.py's own audit call

    await record_audit_event(
        correlation_id=ctx.correlation_id,
        user_id=ctx.user_id,
        actor=ctx.actor,
        event_type=f"agent.{event_type}",
        resource=resource,
        decision="allow",
        detail={"note": detail_note[:500]},
    )
    return {"recorded": True}


@mcp.tool()
@audited_tool("governance_mcp")
async def get_recent_audit_events(limit: int = 20) -> dict:
    """Return the CALLING user's own recent audit trail (self-service
    transparency — "what has this assistant looked up on my behalf").
    Never returns another user's events."""
    ctx = get_caller_context()
    if ctx.user_id is None:
        return {"events": []}
    async with SessionLocal() as session:
        result = await session.execute(
            select(AuditEvent).where(AuditEvent.user_id == ctx.user_id).order_by(AuditEvent.created_at.desc()).limit(min(limit, 100))
        )
        rows = result.scalars().all()
    return {
        "events": [
            {"event_type": r.event_type, "resource": r.resource, "decision": r.decision, "created_at": r.created_at.isoformat()}
            for r in rows
        ]
    }


def create_app():
    return build_secured_app(mcp, shared_secret=settings.mcp_shared_secret)


if __name__ == "__main__":
    uvicorn.run(create_app(), host="0.0.0.0", port=9104)
