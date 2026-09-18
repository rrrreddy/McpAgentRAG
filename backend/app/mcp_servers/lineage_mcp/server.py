"""lineage-mcp: typed tools over the decoded Informatica PowerCenter
lineage graph (D5/D7).

Tools: get_mapping, get_transform_rule, get_source_target_fields,
get_workflow_summary.

Reads only from the persisted `lineage_nodes` / `lineage_edges` /
`workflows` tables built by app.informatica.lineage_graph — never
re-parses XML per question (D7.3/D11: "re-parsing raw XML per query
doesn't scale and risks inconsistent answers").
"""
from __future__ import annotations

import uvicorn
from mcp.server.fastmcp import FastMCP
from sqlalchemy import select

from app.config import get_settings
from app.db.models import LineageEdge, LineageNode, Workflow
from app.db.session import SessionLocal
from app.mcp_servers.base import audited_tool, build_secured_app

settings = get_settings()
mcp = FastMCP("lineage-mcp", host="0.0.0.0", port=9103)


@mcp.tool()
@audited_tool("lineage_mcp")
async def get_mapping(mapping_name: str) -> dict:
    """Return the decoded transformation graph for a mapping: every node
    (source field / transformation / target field) and the edges between
    them, as persisted from the PowerCenter XML export."""
    async with SessionLocal() as session:
        nodes = (await session.execute(select(LineageNode).where(LineageNode.mapping_name == mapping_name))).scalars().all()
        edges = (await session.execute(select(LineageEdge).where(LineageEdge.mapping_name == mapping_name))).scalars().all()
    if not nodes:
        raise ValueError(f"mapping '{mapping_name}' not found in the lineage store — has it been parsed/persisted yet?")
    return {
        "mapping_name": mapping_name,
        "nodes": [
            {"node_key": n.node_key, "node_type": n.node_type, "transformation_type": n.transformation_type,
             "datatype": n.datatype, "expression": n.expression}
            for n in nodes
        ],
        "edges": [{"from": e.from_node_key, "to": e.to_node_key} for e in edges],
    }


@mcp.tool()
@audited_tool("lineage_mcp")
async def get_transform_rule(mapping_name: str, target_field: str) -> dict:
    """Return the decoded field-level transformation rule for a mapping —
    i.e. for a given target field, the full upstream chain of source
    field(s) and the expression/lookup/filter logic applied at each hop.
    This is the direct implementation of D5's example tool contract."""
    async with SessionLocal() as session:
        nodes = (await session.execute(select(LineageNode).where(LineageNode.mapping_name == mapping_name))).scalars().all()
        edges = (await session.execute(select(LineageEdge).where(LineageEdge.mapping_name == mapping_name))).scalars().all()
    if not nodes:
        raise ValueError(f"mapping '{mapping_name}' not found in the lineage store")

    node_by_key = {n.node_key: n for n in nodes}
    target_keys = [k for k in node_by_key if k.endswith(f".{target_field}") and node_by_key[k].node_type == "target_field"]
    if not target_keys:
        raise ValueError(f"target field '{target_field}' not found in mapping '{mapping_name}'")

    parents: dict[str, list[str]] = {}
    for e in edges:
        parents.setdefault(e.to_node_key, []).append(e.from_node_key)

    def trace(node_key: str, depth: int = 0) -> dict:
        node = node_by_key.get(node_key)
        step = {
            "node_key": node_key,
            "transformation_type": node.transformation_type if node else None,
            "expression": node.expression if node else None,
            "datatype": node.datatype if node else None,
        }
        if depth < 20:
            step["upstream"] = [trace(p, depth + 1) for p in parents.get(node_key, [])]
        return step

    return {
        "mapping_name": mapping_name,
        "target_field": target_field,
        "lineage_chains": [trace(k) for k in target_keys],
    }


@mcp.tool()
@audited_tool("lineage_mcp")
async def get_source_target_fields(mapping_name: str) -> dict:
    """List every source field -> target field pair for a mapping — the
    flattened "literal source-field -> target-field lineage graph" view
    called out in D7.1's <CONNECTOR> row."""
    async with SessionLocal() as session:
        nodes = (await session.execute(select(LineageNode).where(LineageNode.mapping_name == mapping_name))).scalars().all()
        edges = (await session.execute(select(LineageEdge).where(LineageEdge.mapping_name == mapping_name))).scalars().all()
    if not nodes:
        raise ValueError(f"mapping '{mapping_name}' not found in the lineage store")

    node_by_key = {n.node_key: n for n in nodes}
    graph: dict[str, list[str]] = {}
    for e in edges:
        graph.setdefault(e.from_node_key, []).append(e.to_node_key)

    sources = [k for k, n in node_by_key.items() if n.node_type == "source_field"]
    targets = [k for k, n in node_by_key.items() if n.node_type == "target_field"]

    pairs = []
    for s in sources:
        stack = [s]
        visited = set()
        while stack:
            current = stack.pop()
            if current in targets:
                pairs.append({"source_field": s, "target_field": current})
                continue
            for nxt in graph.get(current, []):
                if nxt not in visited:
                    visited.add(nxt)
                    stack.append(nxt)
    return {"mapping_name": mapping_name, "field_pairs": pairs}


@mcp.tool()
@audited_tool("lineage_mcp")
async def get_workflow_summary(workflow_name: str) -> dict:
    """Return session execution order and connection/load-type bindings
    for a decoded workflow (D7.1's <WORKFLOW>/<SESSION> extraction)."""
    async with SessionLocal() as session:
        row = (await session.execute(select(Workflow).where(Workflow.workflow_name == workflow_name))).scalar_one_or_none()
    if row is None:
        raise ValueError(f"workflow '{workflow_name}' not found in the lineage store")
    return {"workflow_name": row.workflow_name, "sessions": row.sessions, "source_file": row.source_file}


def create_app():
    return build_secured_app(mcp, shared_secret=settings.mcp_shared_secret)


if __name__ == "__main__":
    uvicorn.run(create_app(), host="0.0.0.0", port=9103)
