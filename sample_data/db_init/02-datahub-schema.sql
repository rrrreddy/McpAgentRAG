-- =============================================================================
-- datahub schema: a stand-in for the bank's real DataHub warehouse.
--
-- Ownership: the whole schema is created AUTHORIZATION ragmcp_app, and every
-- subsequent statement runs `SET ROLE ragmcp_app` first, so every table and
-- view here is owned by a plain, non-superuser role. That is what makes the
-- Row-Level Security policies and column-masking views below actually take
-- effect for ragmcp_readonly instead of being silently skipped — see
-- sample_data/db_init/README.md.
--
-- Row-level control: `region`. A caller's security_groups must include
-- 'REGION-ALL' or 'REGION-<the row's region>' to see that row at all — this
-- is the Postgres-native analog of an Oracle VPD policy keyed off
-- SYS_CONTEXT('DATAHUB_CTX','SECURITY_GROUPS').
--
-- Column-level control: PII columns (ssn, phone, email) are only returned
-- unmasked if security_groups includes 'PII-UNMASK' — analog of Oracle Data
-- Redaction / TSDP. This is enforced in the VIEW, in the database, not in
-- application code — db-mcp's Python never sees the unmasked value unless
-- Postgres itself decided to hand it over.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS datahub AUTHORIZATION ragmcp_app;

SET ROLE ragmcp_app;

-- --- Base tables (never granted to ragmcp_readonly) -------------------------

CREATE TABLE datahub.customers (
    customer_id   TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    ssn           TEXT NOT NULL,
    phone         TEXT NOT NULL,
    email         TEXT NOT NULL,
    region        TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE datahub.accounts (
    account_id      TEXT PRIMARY KEY,
    customer_id     TEXT NOT NULL REFERENCES datahub.customers(customer_id),
    account_type    TEXT NOT NULL,
    balance         NUMERIC(14, 2) NOT NULL,
    region          TEXT NOT NULL,
    delinquent_days INTEGER NOT NULL DEFAULT 0,
    opened_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE datahub.employees (
    employee_id   TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    department    TEXT NOT NULL,
    region        TEXT NOT NULL,
    hire_date     DATE NOT NULL,
    term_date     DATE
);

-- Certified metric snapshots (pre-computed by the batch/ETL layer, exactly
-- like a real DataHub's curated marts — db-mcp never aggregates raw
-- transactional data live).
CREATE TABLE datahub.metric_total_deposits    (period TEXT PRIMARY KEY, total_deposits NUMERIC(16, 2) NOT NULL);
CREATE TABLE datahub.metric_delinquency_rate  (period TEXT PRIMARY KEY, delinquency_rate NUMERIC(6, 3) NOT NULL);
CREATE TABLE datahub.metric_avg_balance       (period TEXT PRIMARY KEY, avg_balance NUMERIC(14, 2) NOT NULL);
CREATE TABLE datahub.metric_headcount         (period TEXT PRIMARY KEY, headcount INTEGER NOT NULL);

-- --- Row-Level Security ------------------------------------------------------

ALTER TABLE datahub.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE datahub.customers FORCE ROW LEVEL SECURITY;
CREATE POLICY customers_region_rls ON datahub.customers
    USING (
        current_setting('app.user_security_groups', true) LIKE '%REGION-ALL%'
        OR current_setting('app.user_security_groups', true) LIKE '%REGION-' || region || '%'
    );

ALTER TABLE datahub.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE datahub.accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY accounts_region_rls ON datahub.accounts
    USING (
        current_setting('app.user_security_groups', true) LIKE '%REGION-ALL%'
        OR current_setting('app.user_security_groups', true) LIKE '%REGION-' || region || '%'
    );

-- --- Masked views (the ONLY thing ragmcp_readonly can select from) ----------

CREATE VIEW datahub.v_customers_masked AS
SELECT
    customer_id,
    name,
    region,
    CASE WHEN current_setting('app.user_security_groups', true) LIKE '%PII-UNMASK%'
         THEN ssn ELSE 'XXX-XX-' || right(ssn, 4) END AS ssn,
    CASE WHEN current_setting('app.user_security_groups', true) LIKE '%PII-UNMASK%'
         THEN phone ELSE regexp_replace(phone, '\d(?=\d{2})', '*', 'g') END AS phone,
    CASE WHEN current_setting('app.user_security_groups', true) LIKE '%PII-UNMASK%'
         THEN email ELSE regexp_replace(email, '^(.).*(@.*)$', '\1***\2') END AS email,
    created_at
FROM datahub.customers;

CREATE VIEW datahub.v_accounts_masked AS
SELECT
    account_id,
    customer_id,
    account_type,
    region,
    CASE WHEN current_setting('app.user_security_groups', true) LIKE '%PII-UNMASK%'
         THEN balance ELSE round(balance, -2) END AS balance,  -- coarsened, not hidden, without unmask
    delinquent_days,
    opened_at
FROM datahub.accounts;

CREATE VIEW datahub.v_metric_total_deposits   AS SELECT period, total_deposits   FROM datahub.metric_total_deposits;
CREATE VIEW datahub.v_metric_delinquency_rate AS SELECT period, delinquency_rate FROM datahub.metric_delinquency_rate;
CREATE VIEW datahub.v_metric_avg_balance      AS SELECT period, avg_balance      FROM datahub.metric_avg_balance;
CREATE VIEW datahub.v_metric_headcount        AS SELECT period, headcount        FROM datahub.metric_headcount;

-- --- Grants: ragmcp_readonly gets SELECT on views only, nothing on base tables

GRANT USAGE ON SCHEMA datahub TO ragmcp_readonly;
GRANT SELECT ON
    datahub.v_customers_masked,
    datahub.v_accounts_masked,
    datahub.v_metric_total_deposits,
    datahub.v_metric_delinquency_rate,
    datahub.v_metric_avg_balance,
    datahub.v_metric_headcount
TO ragmcp_readonly;

-- --- Seed data ---------------------------------------------------------------

INSERT INTO datahub.customers (customer_id, name, ssn, phone, email, region) VALUES
    ('CUST-1001', 'Alicia Chen',    '123-45-6789', '555-201-1001', 'alicia.chen@example.com',    'NORTHEAST'),
    ('CUST-1002', 'Brian Okafor',   '234-56-7890', '555-201-1002', 'brian.okafor@example.com',   'SOUTHEAST'),
    ('CUST-1003', 'Carmen Diaz',    '345-67-8901', '555-201-1003', 'carmen.diaz@example.com',    'WEST'),
    ('CUST-1004', 'Devon Walsh',    '456-78-9012', '555-201-1004', 'devon.walsh@example.com',    'NORTHEAST'),
    ('CUST-1005', 'Elif Yilmaz',    '567-89-0123', '555-201-1005', 'elif.yilmaz@example.com',    'WEST');

INSERT INTO datahub.accounts (account_id, customer_id, account_type, balance, region, delinquent_days) VALUES
    ('ACCT-2001', 'CUST-1001', 'CHECKING', 4521.33,  'NORTHEAST', 0),
    ('ACCT-2002', 'CUST-1002', 'SAVINGS',  18230.10, 'SOUTHEAST', 45),
    ('ACCT-2003', 'CUST-1003', 'CHECKING', 980.55,   'WEST',      0),
    ('ACCT-2004', 'CUST-1004', 'SAVINGS',  102340.00,'NORTHEAST', 0),
    ('ACCT-2005', 'CUST-1005', 'CHECKING', 3120.75,  'WEST',      12);

INSERT INTO datahub.employees (employee_id, name, department, region, hire_date, term_date) VALUES
    ('EMP-01', 'Priya Nandan',   'DATA-ENGINEERING', 'NORTHEAST', '2022-03-01', NULL),
    ('EMP-02', 'Tomas Herrera',  'DATA-ENGINEERING', 'SOUTHEAST', '2021-07-15', NULL),
    ('EMP-03', 'Grace Kim',      'DATA-ENGINEERING', 'WEST',      '2023-01-10', NULL),
    ('EMP-04', 'Samuel Osei',    'DATA-ENGINEERING', 'NORTHEAST', '2020-11-02', '2026-05-30');

INSERT INTO datahub.metric_total_deposits (period, total_deposits) VALUES
    ('2026-01', 128340210.55), ('2026-02', 129875643.20), ('2026-03', 131204455.90),
    ('2026-04', 132980100.10), ('2026-05', 134502233.75), ('2026-06', 136118820.40),
    ('2026-07', 137400590.05), ('2026-Q1', 131204455.90), ('2026-Q2', 136118820.40);

INSERT INTO datahub.metric_delinquency_rate (period, delinquency_rate) VALUES
    ('2026-01', 3.10), ('2026-02', 3.05), ('2026-03', 2.98), ('2026-04', 3.20),
    ('2026-05', 3.35), ('2026-06', 3.42), ('2026-07', 3.28),
    ('2026-Q1', 2.98), ('2026-Q2', 3.42);

INSERT INTO datahub.metric_avg_balance (period, avg_balance) VALUES
    ('2026-01', 21500.10), ('2026-02', 21780.44), ('2026-03', 22015.90),
    ('2026-04', 22340.15), ('2026-05', 22590.60), ('2026-06', 22810.25),
    ('2026-07', 23012.80);

INSERT INTO datahub.metric_headcount (period, headcount) VALUES
    ('2026-01', 41), ('2026-02', 42), ('2026-03', 44), ('2026-04', 44),
    ('2026-05', 45), ('2026-06', 44), ('2026-07', 43);

RESET ROLE;
