"""Governance test for the project's central design rule (D1's WATCH OUT):
"Treat MCP as a controlled capability interface ... never a generic
execute_sql(sql) or http_get(url)."

This scans every MCP server's tool function signatures (source-level, so
it doesn't depend on any particular installed `mcp` SDK version's runtime
introspection API) and fails the build if a tool ever grows a parameter
that smells like raw SQL, a URL/HTTP passthrough, or a shell command —
the exact anti-pattern the whole project is designed around.
"""
from __future__ import annotations

import re
from pathlib import Path

SERVER_FILES = [
    "app/mcp_servers/knowledge_mcp/server.py",
    "app/mcp_servers/db_mcp/server.py",
    "app/mcp_servers/lineage_mcp/server.py",
    "app/mcp_servers/governance_mcp/server.py",
]

FORBIDDEN_PARAM_SUBSTRINGS = ["sql", "raw_query", "query_string", "url", "endpoint", "http_method", "shell", "command", "cmd", "filepath", "file_path"]

TOOL_DEF_RE = re.compile(r"@mcp\.tool\(\)\s*\n(?:@\w+\([^)]*\)\s*\n)*async def (\w+)\(([^)]*)\)")

BACKEND_DIR = Path(__file__).parent.parent


def _extract_tool_signatures(source: str) -> list[tuple[str, str]]:
    return TOOL_DEF_RE.findall(source)


def test_no_mcp_tool_ever_accepts_raw_sql_or_http_params():
    violations = []
    for rel_path in SERVER_FILES:
        source = (BACKEND_DIR / rel_path).read_text()
        for tool_name, params in _extract_tool_signatures(source):
            param_names = [p.strip().split(":")[0].split("=")[0].strip() for p in params.split(",") if p.strip()]
            for name in param_names:
                lowered = name.lower()
                for forbidden in FORBIDDEN_PARAM_SUBSTRINGS:
                    if forbidden in lowered:
                        violations.append(f"{rel_path}:{tool_name} has forbidden-looking parameter '{name}'")

    assert not violations, "MCP tools must never accept SQL/HTTP/shell-shaped parameters:\n" + "\n".join(violations)


def test_every_server_file_declares_at_least_one_tool():
    for rel_path in SERVER_FILES:
        source = (BACKEND_DIR / rel_path).read_text()
        tools = _extract_tool_signatures(source)
        assert tools, f"{rel_path} declares no @mcp.tool() functions — did the regex or the file break?"


def test_all_tool_parameters_are_simple_typed_scalars():
    """Every tool parameter must be annotated as one of a small set of
    JSON-scalar-compatible types — enforces "typed inputs" from D5's
    production hardening checklist at the source level."""
    allowed_type_hints = {"str", "int", "float", "bool"}
    violations = []
    for rel_path in SERVER_FILES:
        source = (BACKEND_DIR / rel_path).read_text()
        for tool_name, params in _extract_tool_signatures(source):
            for p in [p.strip() for p in params.split(",") if p.strip()]:
                if ":" not in p:
                    violations.append(f"{rel_path}:{tool_name} parameter '{p}' has no type annotation")
                    continue
                _, _, type_part = p.partition(":")
                type_hint = type_part.split("=")[0].strip()
                if type_hint not in allowed_type_hints:
                    violations.append(f"{rel_path}:{tool_name} parameter has non-scalar type hint '{type_hint}'")

    assert not violations, "\n".join(violations)
