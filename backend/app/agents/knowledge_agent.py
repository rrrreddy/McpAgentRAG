"""Knowledge Agent (D6): SharePoint/wiki retrieval via knowledge-mcp only.

Never touches the vector store or database directly — everything goes
through the typed MCP tool, so the ACL hard-gate in app.rag.retrieval is
always in the path regardless of which agent is asking.
"""
from __future__ import annotations

from app.agents.state import AgentState
from app.logging_config import get_logger
from app.mcp_servers.client import MCPToolError, call_tool

logger = get_logger("knowledge_agent")


async def knowledge_agent_node(state: AgentState) -> AgentState:
    user = state["user"]
    correlation_id = state["correlation_id"]
    question = state["question"]

    try:
        result = await call_tool("knowledge", "search_policy", {"query": question, "top_k": 5}, user=user, correlation_id=correlation_id)
    except MCPToolError as exc:
        logger.warning("knowledge_agent_denied", error=str(exc))
        return {**state, "evidence": [], "denial_reason": "You are not authorized to view any documents matching this question."}

    hits = result.get("results", [])
    evidence = [
        {
            "source_type": "sharepoint",
            "document_id": h["document_id"],
            "title": h["title"],
            "source_url": h["source_url"],
            "classification": h["classification"],
            "excerpt": h["excerpt"],
            "relevance_score": h["relevance_score"],
        }
        for h in hits
    ]
    return {**state, "evidence": evidence, "tool_results": [result]}
