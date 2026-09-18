"""Allowlist of typed, parameterized queries db-mcp is permitted to run.

This IS the "typed MCP tool, never execute_sql(sql)" boundary made
concrete: every query the service can possibly issue is enumerated here,
at deploy time, by a human — an agent's request can only ever select
*which* pre-approved query to run and *what parameter values* to bind, it
can never construct new SQL. All queries target masked, RLS-protected
views in the `datahub` schema (see sample_data/datahub_schema.sql), never
base tables.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class MetricDefinition:
    name: str
    description: str
    sql: str
    required_group: str  # security group needed to read this metric at all
    unit: str


METRIC_REGISTRY: dict[str, MetricDefinition] = {
    "total_deposits": MetricDefinition(
        name="total_deposits",
        description="Sum of deposit account balances for a given period, in USD.",
        sql="SELECT period, total_deposits AS value FROM datahub.v_metric_total_deposits WHERE period = :period",
        required_group="FINANCE-METRICS-READ",
        unit="USD",
    ),
    "delinquency_rate": MetricDefinition(
        name="delinquency_rate",
        description="Percentage of accounts 30+ days past due for a given period.",
        sql="SELECT period, delinquency_rate AS value FROM datahub.v_metric_delinquency_rate WHERE period = :period",
        required_group="RISK-METRICS-READ",
        unit="percent",
    ),
    "avg_account_balance": MetricDefinition(
        name="avg_account_balance",
        description="Average account balance across active accounts for a given period.",
        sql="SELECT period, avg_balance AS value FROM datahub.v_metric_avg_balance WHERE period = :period",
        required_group="FINANCE-METRICS-READ",
        unit="USD",
    ),
    "workforce_headcount": MetricDefinition(
        name="workforce_headcount",
        description="Active employee headcount for the data engineering org, for a given period.",
        sql="SELECT period, headcount AS value FROM datahub.v_metric_headcount WHERE period = :period",
        required_group="HR-METRICS-READ",
        unit="count",
    ),
}

TIMESERIES_SQL = {
    "total_deposits": "SELECT period, total_deposits AS value FROM datahub.v_metric_total_deposits ORDER BY period",
    "delinquency_rate": "SELECT period, delinquency_rate AS value FROM datahub.v_metric_delinquency_rate ORDER BY period",
    "avg_account_balance": "SELECT period, avg_balance AS value FROM datahub.v_metric_avg_balance ORDER BY period",
    "workforce_headcount": "SELECT period, headcount AS value FROM datahub.v_metric_headcount ORDER BY period",
}

# record_type -> (masked view, id column, required group)
RECORD_TABLES: dict[str, tuple[str, str, str]] = {
    "customer": ("datahub.v_customers_masked", "customer_id", "CUSTOMER-DATA-READ"),
    "account": ("datahub.v_accounts_masked", "account_id", "ACCOUNT-DATA-READ"),
}
