"""Governance Agent (D6): handles the "denied" route and any specialist
denial. It NEVER grants access itself — it only explains why access was
refused (using governance-mcp's classification_policy) and records an
explicit governance narrative event for audit, so a denial is legible
to the user instead of a silent empty answer.
"""
from __future__ import annotations

from app.agents.state import AgentState
from app.logging_config import get_logger
from app.mcp_servers.client import MCPToolError, call_tool

logger = get_logger("governance_agent")


async def governance_agent_node(state: AgentState) -> AgentState:
    user = state["user"]
    correlation_id = state["correlation_id"]
    reason = state.get("route_reason") or state.get("denial_reason") or "Access to this capability is restricted for your role."

    try:
        await call_tool(
            "governance", "audit_event",
            {"event_type": "access_denied", "resource": state.get("route", "unknown"), "detail_note": reason},
            user=user, correlation_id=correlation_id,
        )
    except MCPToolError as exc:
        logger.warning("governance_audit_failed", error=str(exc))

    return {
        **state,
        "evidence": [],
        "citations": [],
        "confidence": 1.0,  # confident that this IS a correctly-enforced denial
        "answer": (
            "I can't answer that with your current access. "
            f"Reason: {reason}. If you believe this is incorrect, contact your data steward "
            "to request the relevant entitlement."
        ),
    }
