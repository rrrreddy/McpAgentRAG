from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Port:
    name: str
    datatype: str | None
    expression: str | None
    port_type: str | None = None  # INPUT | OUTPUT | INPUT/OUTPUT | LOOKUP


@dataclass
class Transformation:
    name: str
    type: str
    ports: list[Port] = field(default_factory=list)


@dataclass
class Connector:
    from_field: str
    from_instance: str
    to_field: str
    to_instance: str


@dataclass
class ParsedMapping:
    name: str
    transformations: dict[str, Transformation]
    connectors: list[Connector]
    source_file: str


@dataclass
class SessionBinding:
    session_name: str
    mapping_name: str
    source_connection: str | None
    target_connection: str | None
    load_type: str | None  # NORMAL (full) | BULK | INCREMENTAL (via param)
    parameter_file: str | None


@dataclass
class ParsedWorkflow:
    name: str
    sessions: list[SessionBinding]
    execution_order: list[str]  # session names, in dependency order
    source_file: str
