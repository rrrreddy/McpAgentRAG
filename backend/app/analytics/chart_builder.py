"""Turns a db-mcp tool result into a chart spec + table the frontend can
render directly (the project's "chatbot builds graphs also for db queries
for basic analysis along with tabular data" requirement).

This module only shapes ALREADY-AUTHORIZED data returned by db-mcp — it
never queries anything itself and has no database access. Chart "type"
selection follows the dataviz method's form heuristic: a single value is a
stat tile (not a one-bar chart), two values are a comparison bar, and a
series is a line chart — never a dual-axis chart, never more series than
the data actually has.
"""
from __future__ import annotations

from typing import Any

# Categorical slots from the validated reference palette (dataviz skill).
SERIES_COLOR_PRIMARY = "#2a78d6"  # slot 1 (blue)
SERIES_COLOR_SECONDARY = "#eb6834"  # slot 2 (orange)
STATUS_GOOD = "#0ca30c"
STATUS_CRITICAL = "#d03b3b"


def build_table(columns: list[str], rows: list[dict[str, Any]]) -> dict:
    return {"columns": columns, "rows": rows}


def from_single_metric(result: dict) -> tuple[dict | None, dict]:
    """get_metric result -> a stat tile (not a chart — a single number is
    a headline, per the dataviz form heuristic) + a one-row table."""
    table = build_table(
        columns=["metric", "period", "value", "unit"],
        rows=[{"metric": result["metric_name"], "period": result["period"], "value": result["value"], "unit": result["unit"]}],
    )
    if not result.get("found") or result.get("value") is None:
        return None, table
    chart_spec = {
        "type": "stat",
        "label": result["metric_name"].replace("_", " ").title(),
        "value": result["value"],
        "unit": result["unit"],
        "period": result["period"],
        "color": SERIES_COLOR_PRIMARY,
    }
    return chart_spec, table


def from_compare_periods(result: dict) -> tuple[dict | None, dict]:
    """compare_periods result -> a two-bar comparison chart + table."""
    a, b = result["period_a"], result["period_b"]
    table = build_table(
        columns=["period", "value", "unit"],
        rows=[
            {"period": a["period"], "value": a["value"], "unit": a["unit"]},
            {"period": b["period"], "value": b["value"], "unit": b["unit"]},
        ],
    )
    if not (a.get("found") and b.get("found")):
        return None, table

    delta = result.get("delta")
    delta_color = STATUS_GOOD if (delta is not None and delta >= 0) else STATUS_CRITICAL
    chart_spec = {
        "type": "bar",
        "x_field": "period",
        "y_field": "value",
        "y_label": a["unit"],
        "data": [
            {"period": a["period"], "value": a["value"]},
            {"period": b["period"], "value": b["value"]},
        ],
        "series_color": SERIES_COLOR_PRIMARY,
        "delta": delta,
        "pct_change": result.get("pct_change"),
        "delta_color": delta_color,
    }
    return chart_spec, table


def from_timeseries(result: dict) -> tuple[dict | None, dict]:
    """get_metric_timeseries result -> a line chart + full table."""
    series = result.get("series", [])
    table = build_table(columns=["period", "value"], rows=series)
    if len(series) < 2:
        return None, table
    chart_spec = {
        "type": "line",
        "x_field": "period",
        "y_field": "value",
        "y_label": result.get("unit", ""),
        "data": series,
        "series_color": SERIES_COLOR_PRIMARY,
        "title": result.get("metric_name", "").replace("_", " ").title(),
    }
    return chart_spec, table


def build_chart_and_table(tool_name: str, result: dict) -> tuple[dict | None, dict | None]:
    if tool_name == "get_metric":
        return from_single_metric(result)
    if tool_name == "compare_periods":
        return from_compare_periods(result)
    if tool_name == "get_metric_timeseries":
        return from_timeseries(result)
    return None, None
