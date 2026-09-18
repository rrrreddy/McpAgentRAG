"""db-mcp: typed, allowlisted, read-only access to certified DataHub
metrics and records (D5).

Tools: get_metric, get_record, compare_periods, list_metrics.

Hard boundaries enforced here, in order:
  1. Application-level authorization: is the caller's role/security_groups
     even allowed to ask for this metric/record at all (metrics_registry).
  2. Database-level row/column security: the actual SQL runs through the
     READ-ONLY engine against masked, RLS-protected views, so even a
     correctly-authorized call only ever sees rows/columns the database
     itself is willing to hand back for that session's security_groups
     (see oracle_adapter.py for the Oracle VPD/Data Redaction analogy).

No tool here ever accepts a SQL fragment, table name, or column name as
input — only metric names and record ids checked against fixed allowlists.
"""
from __future__ import annotations

import uvicorn
from mcp.server.fastmcp import FastMCP
from sqlalchemy import text

from app.config import get_settings
from app.db.session import ReadOnlySessionLocal
from app.mcp_servers.base import audited_tool, build_secured_app, get_caller_context
from app.mcp_servers.db_mcp.metrics_registry import METRIC_REGISTRY, RECORD_TABLES, TIMESERIES_SQL
from app.mcp_servers.db_mcp.oracle_adapter import apply_security_context

settings = get_settings()
mcp = FastMCP("db-mcp", host="0.0.0.0", port=9102)


def _require_group(required_group: str) -> None:
    ctx = get_caller_context()
    if required_group not in ctx.security_groups:
        raise PermissionError(f"caller lacks required entitlement '{required_group}' for this metric/record")


@mcp.tool()
@audited_tool("db_mcp")
async def get_metric(metric_name: str, period: str) -> dict:
    """Return a single certified metric value for a period (format
    'YYYY-MM' or 'YYYY-Qn'). metric_name must be one of list_metrics()'s
    names — there is no way to pass arbitrary SQL or table names here."""
    definition = METRIC_REGISTRY.get(metric_name)
    if definition is None:
        raise ValueError(f"unknown metric_name '{metric_name}'; call list_metrics() for the allowlist")
    _require_group(definition.required_group)

    ctx = get_caller_context()
    async with ReadOnlySessionLocal() as session:
        await apply_security_context(session, security_groups=ctx.security_groups, user_id=ctx.user_id)
        result = await session.execute(text(definition.sql), {"period": period})
        row = result.mappings().first()
    if row is None:
        return {"metric_name": metric_name, "period": period, "value": None, "unit": definition.unit, "found": False}
    return {"metric_name": metric_name, "period": row["period"], "value": row["value"], "unit": definition.unit, "found": True}


@mcp.tool()
@audited_tool("db_mcp")
async def compare_periods(metric_name: str, period_a: str, period_b: str) -> dict:
    """Return metric values for two periods plus the delta and percent
    change — used for "how did X change between Q1 and Q2" questions and
    to drive time-series charts in the UI."""
    a = await get_metric(metric_name, period_a)
    b = await get_metric(metric_name, period_b)
    delta = None
    pct_change = None
    if a["found"] and b["found"] and isinstance(a["value"], (int, float)) and isinstance(b["value"], (int, float)):
        delta = b["value"] - a["value"]
        pct_change = (delta / a["value"] * 100) if a["value"] else None
    return {"metric_name": metric_name, "period_a": a, "period_b": b, "delta": delta, "pct_change": pct_change}


@mcp.tool()
@audited_tool("db_mcp")
async def get_metric_timeseries(metric_name: str) -> dict:
    """Return the full authorized time series for a metric — this is what
    the chat UI charts when a user asks a trend question ("plot deposits
    over the last year")."""
    definition = METRIC_REGISTRY.get(metric_name)
    if definition is None:
        raise ValueError(f"unknown metric_name '{metric_name}'; call list_metrics() for the allowlist")
    _require_group(definition.required_group)

    ctx = get_caller_context()
    async with ReadOnlySessionLocal() as session:
        await apply_security_context(session, security_groups=ctx.security_groups, user_id=ctx.user_id)
        result = await session.execute(text(TIMESERIES_SQL[metric_name]))
        rows = result.mappings().all()
    return {"metric_name": metric_name, "unit": definition.unit, "series": [{"period": r["period"], "value": r["value"]} for r in rows]}


@mcp.tool()
@audited_tool("db_mcp")
async def get_record(record_type: str, record_id: str) -> dict:
    """Fetch a single certified record by id (record_type in {'customer',
    'account'}). PII columns are returned pre-masked by the database view
    unless the caller's security_groups include the relevant unmask
    entitlement — masking happens server-side, this server never sees the
    unmasked value unless it was already entitled to it by the engine."""
    entry = RECORD_TABLES.get(record_type)
    if entry is None:
        raise ValueError(f"unknown record_type '{record_type}'; allowed: {list(RECORD_TABLES)}")
    view_name, id_column, required_group = entry
    _require_group(required_group)

    ctx = get_caller_context()
    async with ReadOnlySessionLocal() as session:
        await apply_security_context(session, security_groups=ctx.security_groups, user_id=ctx.user_id)
        result = await session.execute(text(f"SELECT * FROM {view_name} WHERE {id_column} = :rid"), {"rid": record_id})  # noqa: S608 - view_name/id_column come only from the fixed RECORD_TABLES allowlist, never caller input
        row = result.mappings().first()
    if row is None:
        raise PermissionError(f"{record_type} '{record_id}' not found or not authorized for caller (row-level security may have filtered it)")
    return dict(row)


@mcp.tool()
@audited_tool("db_mcp")
async def list_metrics() -> dict:
    """List certified metrics this server can answer, with descriptions
    and the entitlement each requires — lets an agent (or a developer)
    discover capabilities without ever seeing raw schema."""
    return {
        "metrics": [
            {"name": m.name, "description": m.description, "unit": m.unit, "required_group": m.required_group}
            for m in METRIC_REGISTRY.values()
        ]
    }


def create_app():
    return build_secured_app(mcp, shared_secret=settings.mcp_shared_secret)


if __name__ == "__main__":
    uvicorn.run(create_app(), host="0.0.0.0", port=9102)
