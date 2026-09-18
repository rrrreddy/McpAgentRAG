"""Role/scope model.

Roles are coarse (who the person is); security_groups are fine-grained
entitlements (what data/documents they may see) enforced as hard gates in
the RAG retriever and db-mcp — never left to the LLM's judgment, per D4.2's
"ACL filtering ... never by asking the model to only use documents the user
is allowed to see."

AGENT_CAPABILITIES encodes D3's "API -> Agents" boundary: which agents
(and therefore which MCP servers) a role is even permitted to route to.
"""
from __future__ import annotations

# role -> agents that role may invoke
AGENT_CAPABILITIES: dict[str, set[str]] = {
    "analyst": {"knowledge", "data", "lineage"},
    "data_steward": {"knowledge", "data", "lineage", "governance"},
    "admin": {"knowledge", "data", "lineage", "governance", "admin"},
}


def role_can_use_agent(role: str, agent_name: str) -> bool:
    return agent_name in AGENT_CAPABILITIES.get(role, set())


def is_admin(role: str) -> bool:
    return role == "admin"
