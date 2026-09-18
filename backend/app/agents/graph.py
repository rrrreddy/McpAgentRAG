"""LangGraph state machine wiring the supervisor + specialist + synthesis
agents into one deterministic pipeline (D6).

    supervisor --route--> knowledge | data | lineage | governance(denied) | clarify
    knowledge/data/lineage --(denial_reason present)--> governance
    knowledge/data/lineage --(route downgraded to clarify)--> clarify
    knowledge/data/lineage --(evidence gathered)--> synthesis
    governance/clarify/synthesis --> END
"""
from __future__ import annotations

from langgraph.graph import END, StateGraph

from app.agents.data_agent import data_agent_node
from app.agents.governance_agent import governance_agent_node
from app.agents.knowledge_agent import knowledge_agent_node
from app.agents.lineage_agent import lineage_agent_node
from app.agents.state import AgentState
from app.agents.supervisor import route_edge, supervisor_node
from app.agents.synthesis_agent import clarify_node, synthesis_agent_node


def _after_specialist_edge(state: AgentState) -> str:
    if state.get("denial_reason"):
        return "governance"
    if state.get("route") == "clarify":
        return "clarify"
    return "synthesis"


def build_agent_graph():
    graph = StateGraph(AgentState)

    graph.add_node("supervisor", supervisor_node)
    graph.add_node("knowledge", knowledge_agent_node)
    graph.add_node("data", data_agent_node)
    graph.add_node("lineage", lineage_agent_node)
    graph.add_node("governance", governance_agent_node)
    graph.add_node("clarify", clarify_node)
    graph.add_node("synthesis", synthesis_agent_node)

    graph.set_entry_point("supervisor")
    graph.add_conditional_edges(
        "supervisor",
        route_edge,
        {"knowledge": "knowledge", "data": "data", "lineage": "lineage", "denied": "governance", "clarify": "clarify"},
    )

    for specialist in ("knowledge", "data", "lineage"):
        graph.add_conditional_edges(
            specialist, _after_specialist_edge, {"governance": "governance", "clarify": "clarify", "synthesis": "synthesis"}
        )

    graph.add_edge("governance", END)
    graph.add_edge("clarify", END)
    graph.add_edge("synthesis", END)

    return graph.compile()


_compiled_graph = None


def get_agent_graph():
    global _compiled_graph
    if _compiled_graph is None:
        _compiled_graph = build_agent_graph()
    return _compiled_graph
