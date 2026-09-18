"""Informatica PowerCenter XML export parser (D7.2/D7.3).

Reads <MAPPING>, <TRANSFORMATION>, <CONNECTOR>, <SESSION>, and <WORKFLOW>
elements out of a PowerCenter repository export and reconstructs:
  - per-mapping transformation graphs (field-level ports + expressions)
  - the field-to-field lineage edges (<CONNECTOR> -> lineage_edges)
  - workflow-level session ordering/dependencies

This is intentionally a *reader*, not a PowerCenter API client: it works
directly against the XML files exported via Repository Manager / pmrep,
which is how these decoding engagements actually receive the legacy
metadata (no live PowerCenter connection required or assumed).
"""
from __future__ import annotations

from lxml import etree

from app.informatica.models import (
    Connector,
    ParsedMapping,
    ParsedWorkflow,
    Port,
    SessionBinding,
    Transformation,
)


def parse_mapping_file(xml_path: str) -> ParsedMapping:
    tree = etree.parse(xml_path)
    mapping_el = tree.find(".//MAPPING")
    if mapping_el is None:
        raise ValueError(f"No <MAPPING> element found in {xml_path}")

    transformations: dict[str, Transformation] = {}
    for t_el in mapping_el.findall("TRANSFORMATION"):
        name = t_el.get("NAME", "")
        ports = [
            Port(
                name=p.get("NAME", ""),
                datatype=p.get("DATATYPE"),
                expression=p.get("EXPRESSION"),
                port_type=p.get("PORTTYPE"),
            )
            for p in t_el.findall("TRANSFORMFIELD")
        ]
        transformations[name] = Transformation(name=name, type=t_el.get("TYPE", "UNKNOWN"), ports=ports)

    connectors = [
        Connector(
            from_field=c.get("FROMFIELD", ""),
            from_instance=c.get("FROMINSTANCE", ""),
            to_field=c.get("TOFIELD", ""),
            to_instance=c.get("TOINSTANCE", ""),
        )
        for c_el in [mapping_el]
        for c in c_el.findall("CONNECTOR")
    ]

    return ParsedMapping(
        name=mapping_el.get("NAME", ""),
        transformations=transformations,
        connectors=connectors,
        source_file=xml_path,
    )


def parse_workflow_file(xml_path: str) -> ParsedWorkflow:
    tree = etree.parse(xml_path)
    workflow_el = tree.find(".//WORKFLOW")
    if workflow_el is None:
        raise ValueError(f"No <WORKFLOW> element found in {xml_path}")

    sessions: list[SessionBinding] = []
    for s_el in tree.findall(".//SESSION"):
        sessions.append(
            SessionBinding(
                session_name=s_el.get("NAME", ""),
                mapping_name=s_el.get("MAPPINGNAME", s_el.get("NAME", "")),
                source_connection=s_el.get("SOURCECONNECTIONVALUE"),
                target_connection=s_el.get("TARGETCONNECTIONVALUE"),
                load_type=s_el.get("LOADTYPE", "NORMAL"),
                parameter_file=s_el.get("PARAMETERFILENAME"),
            )
        )

    # Execution order: derive from <WORKFLOWLINK> FROM/TO chains if present,
    # else fall back to document order of <SESSION> elements.
    links = tree.findall(".//WORKFLOWLINK")
    if links:
        order_pairs = [(link.get("FROMTASK", ""), link.get("TOTASK", "")) for link in links]
        seen: list[str] = []
        for frm, to in order_pairs:
            if frm not in seen and frm not in ("START", ""):
                seen.append(frm)
            if to not in seen and to != "":
                seen.append(to)
        execution_order = [s for s in seen if any(sess.session_name == s for sess in sessions)]
    else:
        execution_order = [s.session_name for s in sessions]

    return ParsedWorkflow(
        name=workflow_el.get("NAME", ""),
        sessions=sessions,
        execution_order=execution_order,
        source_file=xml_path,
    )
