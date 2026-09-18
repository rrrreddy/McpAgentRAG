"""Data Agent (D6): certified metrics/records via db-mcp only.

Never runs raw SQL and never invents a metric definition — it discovers
what's answerable by calling db-mcp's own list_metrics tool, then asks a
small model only to *extract* which allowlisted metric/period(s) the
question refers to (structured extraction, not free reasoning about the
data itself).
"""
from __future__ import annotations

import json

from app.agents.state import AgentState
from app.analytics.chart_builder import build_chart_and_table
from app.gateway.model_gateway import get_model_gateway
from app.logging_config import get_logger
from app.mcp_servers.client import MCPToolError, call_tool

logger = get_logger("data_agent")


async def _extract_query_plan(question: str, metrics: list[dict]) -> dict:
    metric_list = "\n".join(f"- {m['name']}: {m['description']}" for m in metrics)
    system_prompt = (
        "You translate a user's question into a call against ONE of these certified metrics:\n"
        f"{metric_list}\n\n"
        'Respond with ONLY compact JSON: {"metric_name": string|null, '
        '"intent": "single"|"timeseries"|"compare", "period": string|null, '
        '"period_a": string|null, "period_b": string|null}. '
        "Periods look like 'YYYY-MM' or 'YYYY-Qn'. metric_name MUST be one of the "
        "names listed above, or null if none clearly matches — never invent a metric name."
    )
    gateway = get_model_gateway()
    try:
        result = await gateway.complete(
            system=system_prompt, messages=[{"role": "user", "content": question}],
            workload="small", max_tokens=200, temperature=0.0,
        )
        return json.loads(result.text.strip())
    except Exception as exc:  # noqa: BLE001
        logger.warning("data_extraction_failed", error=str(exc))
        return {"metric_name": None, "intent": "single", "period": None}


async def data_agent_node(state: AgentState) -> AgentState:
    user = state["user"]
    correlation_id = state["correlation_id"]
    question = state["question"]

    try:
        metrics_result = await call_tool("data", "list_metrics", {}, user=user, correlation_id=correlation_id)
    except MCPToolError as exc:
        logger.warning("data_agent_list_metrics_failed", error=str(exc))
        return {**state, "evidence": [], "denial_reason": "The metrics catalog is currently unavailable."}

    plan = await _extract_query_plan(question, metrics_result["metrics"])
    metric_name = plan.get("metric_name")
    if not metric_name:
        return {
            **state,
            "evidence": [],
            "route": "clarify",
            "route_reason": "no certified metric in the catalog matches this question",
        }

    intent = plan.get("intent", "single")
    tool_name = "get_metric"
    args: dict = {"metric_name": metric_name, "period": plan.get("period") or "latest"}
    if intent == "timeseries":
        tool_name, args = "get_metric_timeseries", {"metric_name": metric_name}
    elif intent == "compare" and plan.get("period_a") and plan.get("period_b"):
        tool_name, args = "compare_periods", {"metric_name": metric_name, "period_a": plan["period_a"], "period_b": plan["period_b"]}

    try:
        result = await call_tool("data", tool_name, args, user=user, correlation_id=correlation_id)
    except MCPToolError as exc:
        logger.info("data_agent_denied_or_missing", tool=tool_name, error=str(exc))
        return {
            **state,
            "evidence": [],
            "denial_reason": f"You are not authorized to view '{metric_name}', or that period has no certified data ({exc}).",
        }

    chart_spec, table_data = build_chart_and_table(tool_name, result)
    evidence = [
        {
            "source_type": "datahub",
            "title": metric_name.replace("_", " ").title(),
            "reference": metric_name,
            "excerpt": json.dumps(result)[:500],
        }
    ]
    return {**state, "evidence": evidence, "tool_results": [result], "chart_spec": chart_spec, "table_data": table_data}
