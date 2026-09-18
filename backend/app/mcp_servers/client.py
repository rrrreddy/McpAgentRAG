"""Unified MCP client used by agent code to call knowledge-mcp/db-mcp/
lineage-mcp/governance-mcp over the streamable-http transport.

This is the ONLY way agent code talks to those servers — there is no
direct database or HTTP client anywhere in app/agents/. Every call:
  - authenticates as the backend's service identity (shared secret)
  - forwards the already-authenticated end user's identity/entitlements
    as trusted headers (never the user's own JWT/password)
  - propagates the request's correlation id for end-to-end tracing
  - can only invoke one of the server's pre-declared typed tools
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

from app.auth.deps import CurrentUser
from app.config import get_settings

settings = get_settings()

MCP_SERVER_URLS = {
    "knowledge": settings.knowledge_mcp_url,
    "data": settings.db_mcp_url,
    "lineage": settings.lineage_mcp_url,
    "governance": settings.governance_mcp_url,
}


class MCPToolError(Exception):
    def __init__(self, server: str, tool: str, message: str):
        self.server = server
        self.tool = tool
        super().__init__(f"{server}.{tool}: {message}")


@asynccontextmanager
async def _session_for(server: str, *, user: CurrentUser, correlation_id: str):
    url = MCP_SERVER_URLS[server]
    headers = {
        "Authorization": f"Bearer {settings.mcp_shared_secret}",
        "X-Correlation-Id": correlation_id,
        "X-User-Id": user.id,
        "X-User-Email": user.email,
        "X-User-Role": user.role,
        "X-User-Groups": ",".join(user.security_groups),
    }
    async with streamablehttp_client(url, headers=headers) as (read, write, _get_session_id):
        async with ClientSession(read, write) as session:
            await session.initialize()
            yield session


async def call_tool(server: str, tool: str, arguments: dict[str, Any], *, user: CurrentUser, correlation_id: str) -> dict:
    """Call one typed tool on one MCP server and return its structured
    result as a plain dict. Raises MCPToolError on any failure (auth
    denial, unknown tool, unknown metric/record, timeout) so callers can
    turn it into a user-facing "I can't answer that" rather than a crash.
    """
    try:
        async with _session_for(server, user=user, correlation_id=correlation_id) as session:
            result = await session.call_tool(tool, arguments)
    except Exception as exc:  # noqa: BLE001 - normalized into MCPToolError for agent code
        raise MCPToolError(server, tool, str(exc)) from exc

    if result.isError:
        message = "; ".join(getattr(block, "text", str(block)) for block in result.content)
        raise MCPToolError(server, tool, message)

    if result.structuredContent is not None:
        return result.structuredContent
    # Fallback: some tool results only populate unstructured text content.
    text_blocks = [getattr(block, "text", "") for block in result.content]
    return {"text": "\n".join(text_blocks)}
