"""Shared hardening for every MCP server (D5's production checklist):

  - service-identity auth: only the backend (proven via a shared-secret
    bearer token) may call an MCP server at all — this is the "Agent -> MCP"
    trust boundary from D3.
  - the ALREADY-AUTHENTICATED end user's identity/entitlements travel with
    each call as trusted headers set by the backend, so tools can enforce
    row/column policy and ACLs server-side without re-authenticating the
    user themselves (the MCP server never sees the user's JWT or password).
  - one audit record per tool invocation, with latency and allow/deny/error
    outcome, correlated end-to-end via `correlation_id`.
  - a hard per-call timeout so a slow downstream query can't hang an agent
    turn indefinitely.

Every concrete server (knowledge/db/lineage/governance) builds on this
instead of hand-rolling auth, which is exactly the point: a narrow, typed,
consistently-audited capability interface, never an ad hoc endpoint.
"""
from __future__ import annotations

import asyncio
import time
from contextvars import ContextVar
from dataclasses import dataclass, field
from functools import wraps
from typing import Any, Callable

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.audit.logger import record_audit_event
from app.logging_config import get_logger

logger = get_logger("mcp_server")

TOOL_TIMEOUT_SECONDS = 15


@dataclass
class CallerContext:
    correlation_id: str = "-"
    user_id: str | None = None
    user_role: str | None = None
    security_groups: list[str] = field(default_factory=list)
    actor: str = "service"


caller_context_var: ContextVar[CallerContext] = ContextVar("mcp_caller_context", default=CallerContext())


def get_caller_context() -> CallerContext:
    return caller_context_var.get()


class ServiceAuthMiddleware:
    """Pure-ASGI middleware — enforces the Agent -> MCP trust boundary."""

    def __init__(self, app: ASGIApp, shared_secret: str):
        self._app = app
        self._shared_secret = shared_secret

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self._app(scope, receive, send)
            return

        headers = {k.decode().lower(): v.decode() for k, v in scope.get("headers", [])}
        if headers.get("authorization") != f"Bearer {self._shared_secret}":
            logger.warning("mcp_unauthorized_caller", path=scope.get("path"))
            response = JSONResponse({"error": "unauthorized service caller"}, status_code=401)
            await response(scope, receive, send)
            return

        ctx = CallerContext(
            correlation_id=headers.get("x-correlation-id", "-"),
            user_id=headers.get("x-user-id") or None,
            user_role=headers.get("x-user-role") or None,
            security_groups=[g for g in headers.get("x-user-groups", "").split(",") if g],
            actor=headers.get("x-user-email", "service"),
        )
        token = caller_context_var.set(ctx)
        try:
            await self._app(scope, receive, send)
        finally:
            caller_context_var.reset(token)


def build_secured_app(mcp: Any, *, shared_secret: str):
    """Wrap a FastMCP instance's ASGI app with the service-auth middleware."""
    app = mcp.streamable_http_app()
    app.add_middleware(ServiceAuthMiddleware, shared_secret=shared_secret)
    return app


def audited_tool(resource_prefix: str) -> Callable:
    """Decorator applied to every @mcp.tool() function: enforces a hard
    timeout and writes exactly one audit_log row per call."""

    def decorator(fn: Callable) -> Callable:
        @wraps(fn)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            ctx = get_caller_context()
            start = time.perf_counter()
            decision = "allow"
            error_detail: dict[str, Any] = {}
            try:
                return await asyncio.wait_for(fn(*args, **kwargs), timeout=TOOL_TIMEOUT_SECONDS)
            except PermissionError as exc:
                decision = "deny"
                error_detail = {"reason": str(exc)}
                raise
            except asyncio.TimeoutError as exc:
                decision = "error"
                error_detail = {"reason": "tool_timeout"}
                raise TimeoutError(f"{fn.__name__} exceeded {TOOL_TIMEOUT_SECONDS}s timeout") from exc
            except Exception as exc:  # noqa: BLE001 - audited then re-raised
                decision = "error"
                error_detail = {"reason": str(exc)}
                raise
            finally:
                latency_ms = int((time.perf_counter() - start) * 1000)
                await record_audit_event(
                    correlation_id=ctx.correlation_id,
                    user_id=ctx.user_id,
                    actor=ctx.actor,
                    event_type="mcp_tool_call",
                    resource=f"{resource_prefix}.{fn.__name__}",
                    decision=decision,
                    detail={"args": _safe_repr(kwargs), **error_detail},
                    latency_ms=latency_ms,
                )

        return wrapper

    return decorator


def _safe_repr(kwargs: dict) -> dict:
    """Truncate argument values before they hit the audit log — typed tool
    args are small by construction, but this caps pathological input."""
    return {k: (str(v)[:300] if v is not None else None) for k, v in kwargs.items()}
