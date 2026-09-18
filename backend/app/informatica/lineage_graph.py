"""Build and persist a queryable field-level lineage graph from a parsed
PowerCenter mapping (D7.3).

Nodes are `<transformation_instance>.<port_name>` keys (source qualifier
output ports and target ports included), edges are the <CONNECTOR>
bindings. Chaining these edges end-to-end lets us answer "where does
target field X actually come from, and through what expression logic"
by graph traversal instead of re-reading raw XML on every question —
exactly the persistence requirement called out in D7.3/D11.
"""
from __future__ import annotations

import re

import networkx as nx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import LineageEdge, LineageNode, Workflow
from app.informatica.models import ParsedMapping, ParsedWorkflow


def build_networkx_graph(mapping: ParsedMapping) -> nx.DiGraph:
    graph = nx.DiGraph()
    for t_name, transformation in mapping.transformations.items():
        for port in transformation.ports:
            node_key = f"{t_name}.{port.name}"
            graph.add_node(
                node_key,
                transformation=t_name,
                transformation_type=transformation.type,
                datatype=port.datatype,
                expression=port.expression,
                port_type=port.port_type,
            )

    # Intra-transformation wiring: <CONNECTOR> elements only ever wire a
    # port on one transformation instance to a port on another — they never
    # describe how a transformation's own input ports flow into its own
    # output ports. That wiring lives implicitly in each output port's
    # EXPRESSION (e.g. OUT_BALANCE's "ROUND(IN_RAW_BALANCE, 2)" references
    # IN_RAW_BALANCE), so we add that edge explicitly here. Without this,
    # every output port with an expression looks like a false root and
    # upstream tracing silently stops one hop early.
    for t_name, transformation in mapping.transformations.items():
        input_ports = [p for p in transformation.ports if p.port_type in ("INPUT", "INPUT/OUTPUT")]
        output_ports = [p for p in transformation.ports if p.port_type in ("OUTPUT", "INPUT/OUTPUT")]
        for out_port in output_ports:
            if not out_port.expression:
                continue
            for in_port in input_ports:
                if in_port.name == out_port.name:
                    continue
                if re.search(rf"\b{re.escape(in_port.name)}\b", out_port.expression):
                    graph.add_edge(f"{t_name}.{in_port.name}", f"{t_name}.{out_port.name}")

    for c in mapping.connectors:
        from_key = f"{c.from_instance}.{c.from_field}"
        to_key = f"{c.to_instance}.{c.to_field}"
        graph.add_edge(from_key, to_key)
    return graph


def trace_upstream(graph: nx.DiGraph, target_node_key: str) -> list[list[str]]:
    """Return every root-to-target path feeding a given target field —
    the "for target field X, which source field(s) fed it, and through
    what expression/lookup/filter logic" answer from D7.3."""
    if target_node_key not in graph:
        return []
    roots = [n for n in graph.nodes if graph.in_degree(n) == 0]
    paths: list[list[str]] = []
    for root in roots:
        for path in nx.all_simple_paths(graph, root, target_node_key):
            paths.append(path)
    return paths


async def persist_mapping_lineage(session: AsyncSession, mapping: ParsedMapping) -> None:
    graph = build_networkx_graph(mapping)

    existing = await session.execute(select(LineageNode).where(LineageNode.mapping_name == mapping.name))
    for row in existing.scalars():
        await session.delete(row)
    existing_edges = await session.execute(select(LineageEdge).where(LineageEdge.mapping_name == mapping.name))
    for row in existing_edges.scalars():
        await session.delete(row)
    await session.flush()

    for node_key, data in graph.nodes(data=True):
        is_source = graph.in_degree(node_key) == 0
        is_target = graph.out_degree(node_key) == 0
        node_type = "source_field" if is_source else ("target_field" if is_target else "transformation")
        session.add(
            LineageNode(
                mapping_name=mapping.name,
                node_key=node_key,
                node_type=node_type,
                transformation_type=data.get("transformation_type"),
                datatype=data.get("datatype"),
                expression=data.get("expression"),
                metadata_json={"transformation": data.get("transformation"), "port_type": data.get("port_type")},
            )
        )
    for from_key, to_key in graph.edges():
        session.add(LineageEdge(mapping_name=mapping.name, from_node_key=from_key, to_node_key=to_key))

    await session.commit()


async def persist_workflow(session: AsyncSession, workflow: ParsedWorkflow) -> None:
    existing = await session.execute(select(Workflow).where(Workflow.workflow_name == workflow.name))
    row = existing.scalar_one_or_none()
    sessions_payload = [
        {
            "session_name": s.session_name,
            "mapping_name": s.mapping_name,
            "source_connection": s.source_connection,
            "target_connection": s.target_connection,
            "load_type": s.load_type,
            "parameter_file": s.parameter_file,
        }
        for s in workflow.sessions
    ]
    if row is None:
        row = Workflow(workflow_name=workflow.name, sessions=sessions_payload, source_file=workflow.source_file)
        session.add(row)
    else:
        row.sessions = sessions_payload
        row.source_file = workflow.source_file
    await session.commit()
