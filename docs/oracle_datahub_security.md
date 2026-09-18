# How `db-mcp`'s security model maps onto a real Oracle DataHub

This project's source-of-truth warehouse is called **DataHub** throughout —
matching the real engagement this repo models. The reference stack here
runs **Postgres + pgvector** end-to-end so the whole thing is
`docker compose up`-able without an Oracle license, but the *security
model* is a deliberate, point-for-point analog of what a bank's real
Oracle-backed DataHub does. This document is the detailed version of the
table in `backend/app/mcp_servers/db_mcp/oracle_adapter.py`.

## Why this matters

The task explicitly calls out: *"the source database here used is DataHub
and PII information is hidden from the LLM and unauthorized/limited-access
people — think about how this works on Oracle."* Two separate problems
have to be solved, at two separate layers:

1. **The LLM must never see raw PII it isn't supposed to reason about.**
   Solved by masking at the database layer — the LLM (and the Python code
   in `db-mcp`) only ever receives what the database decided to hand back.
2. **A user with limited access must not be able to see another user's
   (or another region's) data, even by asking the AI assistant nicely.**
   Solved by row-level security enforced by the database engine itself,
   keyed off the caller's real entitlements — never by the agent's or the
   LLM's own judgment about what "should" be allowed.

Both controls are enforced **server-side, in the database**, not in
`db-mcp`'s Python code and not in the LLM's prompt. This is intentional:
prompt-based "please don't show SSNs" instructions are not access control
— a sufficiently adversarial or confused prompt can talk a model out of
following them. A masked view and an RLS policy cannot be talked out of
anything.

## Side-by-side: Postgres (this repo) vs. Oracle (production)

| Control | Oracle (production) | Postgres (this repo's demo) |
|---|---|---|
| Service identity | A dedicated DB user (e.g. `RAGMCP_RO`) granted `SELECT` **only** on views/synonyms, never on base tables, never `INSERT`/`UPDATE`/`DELETE` | `ragmcp_readonly` role: `SELECT` only on masked views (`v_customers_masked`, `v_accounts_masked`, `v_metric_*`), **zero grants** on base tables |
| Row-level security | **Virtual Private Database** (`DBMS_RLS.ADD_POLICY`) — a PL/SQL policy function appends a `WHERE` predicate at parse time, driven by an application context (`SYS_CONTEXT('DATAHUB_CTX', 'SECURITY_GROUPS')`) set via `DBMS_SESSION.SET_CONTEXT` | Postgres native **Row-Level Security** (`CREATE POLICY ... USING (...)`) reading a per-transaction session GUC (`current_setting('app.user_security_groups')`) set by `db-mcp` before every query |
| Column-level masking | **Oracle Data Redaction** (`DBMS_REDACT.ADD_POLICY`) or **Transparent Sensitive Data Protection** (TSDP) policies applied directly to PII columns (SSN, account number, DOB) | A `CASE WHEN <unmask-entitled> THEN real ELSE redacted END` expression baked into the masked view |
| Fine-grained entitlements | **Oracle Real Application Security** (RAS), or database roles mapped from an enterprise IdP via a mid-tier proxy user / OCI IAM | `security_groups TEXT[]` on the `users` table, issued as JWT claims at login, forwarded to `db-mcp` as trusted headers over the authenticated service channel |
| "Never trust the app tier" | VPD/TSDP policies are enforced **by the database engine itself** — a buggy or compromised app-tier query still can't see rows/columns it isn't entitled to | RLS + masked views are enforced **by Postgres itself** — same guarantee, same reason |
| Superuser bypass hazard | A DBA account with `EXEMPT ACCESS POLICY` silently bypasses VPD/Redaction — never let application objects be owned by such an account | A Postgres superuser (or any role with `BYPASSRLS`) silently bypasses RLS for anything it owns — see `sample_data/db_init/README.md` for how this repo avoids that trap |

## What the Postgres demo actually does

See `sample_data/db_init/02-datahub-schema.sql` for the full SQL. In short:

```sql
-- Row-level: only see rows in your assigned region(s)
CREATE POLICY customers_region_rls ON datahub.customers
    USING (
        current_setting('app.user_security_groups', true) LIKE '%REGION-ALL%'
        OR current_setting('app.user_security_groups', true) LIKE '%REGION-' || region || '%'
    );

-- Column-level: PII is masked unless PII-UNMASK is granted
CREATE VIEW datahub.v_customers_masked AS
SELECT
    customer_id, name, region,
    CASE WHEN current_setting('app.user_security_groups', true) LIKE '%PII-UNMASK%'
         THEN ssn ELSE 'XXX-XX-' || right(ssn, 4) END AS ssn,
    ...
FROM datahub.customers;
```

And before every query, `db-mcp` (in `oracle_adapter.py::apply_security_context`)
sets that session variable **scoped to the current transaction only**:

```python
await session.execute(
    text("SELECT set_config('app.user_security_groups', :groups, true)"),
    {"groups": ",".join(security_groups)},
)
```

The third argument to `set_config` (`is_local = true`) is load-bearing: it
means the setting is automatically cleared at transaction end and can
**never leak across a pooled connection** to a different caller. This is
the same reason a real Oracle deployment sets its application context
per-session/per-call rather than as a long-lived connection property.

## The equivalent, if you were writing this against real Oracle

```sql
-- 1. An application context, populated by a trusted PL/SQL package
CREATE OR REPLACE CONTEXT datahub_ctx USING pkg_datahub_security;

-- 2. A VPD policy function consulting that context
CREATE OR REPLACE FUNCTION region_rls_predicate(schema_name VARCHAR2, table_name VARCHAR2)
RETURN VARCHAR2 IS
BEGIN
    IF SYS_CONTEXT('datahub_ctx', 'security_groups') LIKE '%REGION-ALL%' THEN
        RETURN NULL;  -- no restriction
    END IF;
    RETURN 'region IN (SELECT region FROM TABLE(pkg_datahub_security.regions_for_caller()))';
END;
/

BEGIN
    DBMS_RLS.ADD_POLICY(
        object_schema   => 'DATAHUB',
        object_name     => 'CUSTOMERS',
        policy_name     => 'CUSTOMERS_REGION_POLICY',
        function_schema => 'DATAHUB_SEC',
        policy_function => 'REGION_RLS_PREDICATE',
        statement_types => 'SELECT'
    );
END;
/

-- 3. Data Redaction for PII columns
BEGIN
    DBMS_REDACT.ADD_POLICY(
        object_schema   => 'DATAHUB',
        object_name     => 'CUSTOMERS',
        column_name     => 'SSN',
        policy_name     => 'CUSTOMERS_SSN_REDACT',
        function_type   => DBMS_REDACT.PARTIAL,
        function_parameters => 'VVVVVVVVVVV,VVVV,*,1,5',
        expression      => 'SYS_CONTEXT(''datahub_ctx'',''security_groups'') NOT LIKE ''%PII-UNMASK%'''
    );
END;
/
```

Swapping the demo for real Oracle means: replace `app/db/session.py`'s
async engine with an Oracle-capable async driver (e.g. `oracledb` in thin
mode via SQLAlchemy's `oracledb` dialect), replace
`oracle_adapter.py::apply_security_context` with a call to the
`pkg_datahub_security` context-setting package instead of `set_config`,
and replace the Postgres RLS/redaction DDL in
`sample_data/db_init/02-datahub-schema.sql` with the `DBMS_RLS` /
`DBMS_REDACT` statements above. **`db-mcp`'s Python code — the typed tool
surface in `metrics_registry.py` and `server.py` — does not change at
all**, which is the entire point of putting the security boundary in the
database rather than in application code.

## Defense in depth, not defense in one place

Note that `db-mcp` checks entitlements at **two** independent layers, and
both have to agree before data comes back:

1. **Application-level allowlist check** (`_require_group` in
   `db_mcp/server.py`): is the caller's `security_groups` even allowed to
   ask for this metric/record class at all?
2. **Database-level RLS + masking** (this document): of the rows the
   query would otherwise return, which ones — and which column values —
   is the engine willing to hand back for this session's entitlements?

A bug in either layer alone is contained by the other. This is the same
principle as D5's MCP hardening checklist: "authorization check before
every query" (layer 1) **and** "row/column policies enforced server-side,
not by the agent" (layer 2).
