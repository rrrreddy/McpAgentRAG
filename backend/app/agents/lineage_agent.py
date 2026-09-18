"""Lineage Agent (D6/D7): Informatica mapping/workflow decoding Q&A via
lineage-mcp only. Never guesses a mapping rule it hasn't actually parsed —
if the mapping/target field isn't in the lineage store, it reports that
plainly rather than fabricating a plausible-sounding transformation.
"""
from __future__ import annotations

import json

from app.agents.state import AgentState
from app.gateway.model_gateway import get_model_gateway
from app.logging_config import get_logger
from app.mcp_servers.client import MCPToolError, call_tool

logger = get_logger("lineage_agent")

_EXTRACTION_SYSTEM_PROMPT = (
    "Extract Informatica lineage query parameters from the user's question. "
    'Respond with ONLY compact JSON: {"mapping_name": string|null, '
    '"target_field": string|null, "workflow_name": string|null, '
    '"intent": "transform_rule"|"mapping_overview"|"workflow_summary"}. '
    "If the question does not name a specific mapping/workflow, set the "
    "relevant field to null rather than guessing."
)


async def _extract_params(question: str) -> dict:
    gateway = get_model_gateway()
    try:
        result = await gateway.complete(
            system=_EXTRACTION_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": question}],
            workload="small",
            max_tokens=200,
            temperature=0.0,
        )
        return json.loads(result.text.strip())
    except Exception as exc:  # noqa: BLE001
        logger.warning("lineage_extraction_failed", error=str(exc))
        return {"mapping_name": None, "target_field": None, "workflow_name": None, "intent": "mapping_overview"}


async def lineage_agent_node(state: AgentState) -> AgentState:
    user = state["user"]
    correlation_id = state["correlation_id"]
    question = state["question"]

    params = await _extract_params(question)
    intent = params.get("intent", "mapping_overview")
    mapping_name = params.get("mapping_name")
    workflow_name = params.get("workflow_name")
    target_field = params.get("target_field")

    if intent == "workflow_summary" and workflow_name:
        tool, args = "get_workflow_summary", {"workflow_name": workflow_name}
    elif intent == "transform_rule" and mapping_name and target_field:
        tool, args = "get_transform_rule", {"mapping_name": mapping_name, "target_field": target_field}
    elif mapping_name:
        tool, args = "get_mapping", {"mapping_name": mapping_name}
    else:
        return {
            **state,
            "evidence": [],
            "denial_reason": None,
            "route": "clarify",
            "route_reason": "no mapping/workflow name could be identified in the question",
        }

    try:
        result = await call_tool("lineage", tool, args, user=user, correlation_id=correlation_id)
    except MCPToolError as exc:
        logger.info("lineage_lookup_not_found", tool=tool, args=args, error=str(exc))
        return {
            **state,
            "evidence": [],
            "denial_reason": f"No decoded lineage found for that mapping/workflow ({exc}). "
            "It may not have been parsed/persisted yet, or the name doesn't match exactly.",
        }

    evidence = [
        {
            "source_type": "informatica_lineage",
            "title": mapping_name or workflow_name or "lineage",
            "reference": mapping_name or workflow_name,
            "excerpt": json.dumps(result)[:1500],
        }
    ]
    return {**state, "evidence": evidence, "tool_results": [result]}
