"""LangGraph state schema (D6) — the single object threaded through the
supervisor -> specialist -> synthesis pipeline for one chat turn."""
from __future__ import annotations

from typing import Any, TypedDict

from app.auth.deps import CurrentUser


class Citation(TypedDict):
    source_type: str  # "sharepoint" | "datahub" | "informatica_lineage"
    title: str
    reference: str  # source_url, metric_name, or mapping_name
    excerpt: str | None


class AgentState(TypedDict, total=False):
    question: str
    user: CurrentUser
    recent_turns: list[dict]
    correlation_id: str

    route: str  # knowledge | data | lineage | clarify | denied
    route_reason: str

    evidence: list[dict]
    tool_results: list[dict]
    denial_reason: str | None

    confidence: float
    answer: str
    citations: list[Citation]
    table_data: dict[str, Any] | None
    chart_spec: dict[str, Any] | None
