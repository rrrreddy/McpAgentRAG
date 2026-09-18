"""How this maps onto a real Oracle-backed DataHub (read this before you
mistake the Postgres demo schema for the whole design).

The reference stack in this repo runs Postgres so the whole thing is
docker-compose-able without an Oracle license. The SECURITY MODEL is
built to be a direct, deliberate analog of the Oracle controls a real
bank DataHub would use — the same *shape*, different engine:

┌────────────────────────────┬─────────────────────────────────────────────┬──────────────────────────────────────────┐
│ Control                    │ Oracle (production)                          │ Postgres (this repo's demo)               │
├────────────────────────────┼─────────────────────────────────────────────┼────────────────────────────────────────── │
│ Service identity            │ Dedicated DB user (e.g. RAGMCP_RO) granted    │ `ragmcp_readonly` role: SELECT-only on    │
│                              │ SELECT ONLY on views/synonyms, no DML,       │ masked views, no DML grants, no access to │
│                              │ no access to base tables                     │ raw base tables                           │
│ Row-level security          │ Virtual Private Database (DBMS_RLS.ADD_POLICY)│ Postgres native Row-Level Security (RLS)  │
│                              │ — a PL/SQL policy function appends a WHERE   │ policies (`CREATE POLICY ... USING (...)`)│
│                              │ predicate at parse time based on             │ that read a per-transaction session GUC   │
│                              │ SYS_CONTEXT('DATAHUB_CTX','SECURITY_GROUPS') │ (`current_setting('app.user_security_     │
│                              │ set via DBMS_SESSION.SET_CONTEXT             │ groups')`) set by this adapter            │
│ Column-level masking        │ Oracle Data Redaction (DBMS_REDACT) or        │ Masked views compute a CASE expression:   │
│                              │ Transparent Sensitive Data Protection (TSDP) │ real value if the session GUC contains    │
│                              │ policies applied to PII columns (SSN, account│ the required unmask group, else a fixed   │
│                              │ number, DOB) — masking happens in the        │ redaction pattern — evaluated server-side │
│                              │ database engine, invisible to the query text │ in the view, never in application code    │
│ Fine-grained roles           │ Oracle Real Application Security (RAS) or    │ `security_groups` array on the `users`    │
│                              │ database roles mapped from an enterprise IdP │ table, issued as JWT claims, forwarded as │
│                              │ (often via a mid-tier proxy user / OCI IAM)  │ trusted headers to db-mcp                 │
│ "Never trust the app tier"  │ VPD/TSDP policies are enforced by the Oracle  │ RLS + masked views are enforced by        │
│                              │ engine itself — even a mis-written query     │ Postgres itself — even if db-mcp's SQL    │
│                              │ cannot bypass them from the app tier         │ template had a bug, the engine still      │
│                              │                                               │ restricts rows/columns returned            │
└────────────────────────────┴─────────────────────────────────────────────┴──────────────────────────────────────────┘

The critical design point (D3, D5, D10) is unchanged regardless of engine:
db-mcp NEVER accepts or constructs free-form SQL from an agent. It exposes
a small allowlist of typed, parameterized tools (get_metric, get_record,
compare_periods) whose SQL text is fixed in metrics_registry.py. The only
thing that varies per call is bound parameter *values*, and the only thing
that varies per caller is which rows/columns the database engine itself
is willing to return, decided by RLS + masked views — never by the agent,
never by string-built SQL, never by the LLM's judgment about what the user
"should" be allowed to see.

See sample_data/datahub_schema.sql for the concrete RLS policies and
masked views backing this demo, and docs/oracle_datahub_security.md for
the full walkthrough (including the actual DBMS_RLS/DBMS_REDACT syntax
you'd write against real Oracle).
"""
from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def apply_security_context(session: AsyncSession, *, security_groups: list[str], user_id: str | None) -> None:
    """Set the per-transaction session context that RLS policies and
    masked views read. Analog of Oracle's DBMS_SESSION.SET_CONTEXT feeding
    a VPD policy function via SYS_CONTEXT.

    Uses `set_config(..., is_local=true)` (the third argument) so the
    setting is automatically cleared at transaction end and can NEVER leak
    across pooled connections to a different caller — the single most
    important correctness property of this pattern.
    """
    groups_csv = ",".join(security_groups)
    await session.execute(text("SELECT set_config('app.user_security_groups', :groups, true)"), {"groups": groups_csv})
    await session.execute(text("SELECT set_config('app.user_id', :uid, true)"), {"uid": user_id or ""})
