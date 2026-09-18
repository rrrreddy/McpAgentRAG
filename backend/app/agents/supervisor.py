"""Supervisor / router agent (D6).

Routing is deterministic-first, per the spec's explicit TIP: "Keep routing
rule-based/deterministic at its core ... production systems combine
deterministic rules, a lightweight classifier, and policy checks rather
than trusting the LLM to pick the right tool every time."

Order of operations:
  1. Keyword rules (fast, free, fully auditable — no model call at all for
     the common case).
  2. If no rule matches: a single small-model classification call,
     constrained to emit exactly one of a fixed label set.
  3. Policy check: even if routing picked an agent, the caller's role must
     be entitled to use it (D3's "API -> Agents" boundary) — this can
     downgrade any route to "denied".
"""
from __future__ import annotations

import json

from app.agents.state import AgentState
from app.gateway.model_gateway import get_model_gateway
from app.logging_config import get_logger

logger = get_logger("supervisor")

VALID_ROUTES = {"knowledge", "data", "lineage", "clarify"}

_KEYWORD_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("lineage", ("mapping", "transform", "informatica", "workflow", "etl", "lineage", "powercenter", "session log")),
    ("knowledge", ("policy", "definition", "guideline", "glossary", "sharepoint", "wiki", "process for", "what is our")),
    ("data", ("metric", "record", "current", "headcount", "balance", "deposit", "delinquency", "compare", "trend", "chart", "graph", "plot")),
]

_CLASSIFIER_SYSTEM_PROMPT = (
    "You are a strict intent classifier for an enterprise data assistant. "
    "Given a user question, respond with EXACTLY one lowercase word from this "
    "set and nothing else: knowledge, data, lineage, clarify. "
    "'knowledge' = policy/definition/process questions answerable from SharePoint docs. "
    "'data' = a request for a certified metric, record, or comparison from the DataHub warehouse. "
    "'lineage' = a question about Informatica PowerCenter mappings/workflows/transformation rules. "
    "'clarify' = anything else, or too ambiguous to route safely."
)


def rule_based_route(question: str) -> str | None:
    lowered = question.lower()
    for route, keywords in _KEYWORD_RULES:
        if any(kw in lowered for kw in keywords):
            return route
    return None


async def classifier_route(question: str) -> str:
    gateway = get_model_gateway()
    try:
        result = await gateway.complete(
            system=_CLASSIFIER_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": question}],
            workload="small",
            max_tokens=8,
            temperature=0.0,
        )
        label = result.text.strip().lower().strip(".")
        if label in VALID_ROUTES:
            return label
    except Exception as exc:  # noqa: BLE001 - degrade to safe default on any gateway failure
        logger.warning("classifier_route_failed", error=str(exc))
    return "clarify"


async def supervisor_node(state: AgentState) -> AgentState:
    question = state["question"]
    user = state["user"]

    route = rule_based_route(question)
    reason = "keyword_rule"
    if route is None:
        route = await classifier_route(question)
        reason = "small_model_classifier"

    if route != "clarify" and not user.can_use_agent(route):
        logger.info("route_denied_by_policy", user_id=user.id, role=user.role, attempted_route=route)
        return {**state, "route": "denied", "route_reason": f"role '{user.role}' is not entitled to the '{route}' agent"}

    return {**state, "route": route, "route_reason": reason}


def route_edge(state: AgentState) -> str:
    return state["route"]
