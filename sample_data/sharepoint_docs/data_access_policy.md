---
document_id: POLICY-123
title: Data Access Policy
source_url: https://bank.sharepoint.com/sites/DataGovernance/Data-Access-Policy
source_system: sharepoint
classification: INTERNAL
security_groups: [DATA-POLICY-READ]
modified_at: 2026-08-30T10:00:00Z
---

# Data Access Policy

## Purpose

This policy defines who may access customer and account data held in the
bank's DataHub warehouse, and under what conditions.

## Principles

1. **Least privilege.** Every employee, service account, and AI agent is
   granted the minimum set of entitlements needed to do their job — never
   broad, standing access "just in case."
2. **PII is masked by default.** Personally identifiable information
   (Social Security Number, full account number, date of birth, phone,
   email) is masked at the database layer for every reader. Only an
   explicit `PII-UNMASK` entitlement, granted by a Data Steward after a
   documented business justification, reveals the underlying value.
3. **Row-level entitlement by region.** Analysts are scoped to the
   region(s) they support (`REGION-NORTHEAST`, `REGION-SOUTHEAST`,
   `REGION-WEST`). A `REGION-ALL` grant is reserved for enterprise risk
   and compliance roles.
4. **No AI agent bypasses these controls.** Any AI assistant or agent
   querying DataHub does so through the same read-only, masked,
   row-level-secured interface as a human analyst — through the typed
   `db-mcp` service, never direct SQL access, and never with elevated
   privileges "on behalf of" the user beyond what that user is already
   entitled to.
5. **Every access is logged.** All reads of customer or account data,
   whether by a human or an AI agent, are recorded in the audit log with
   who asked, what was returned (masked or unmasked), and when.

## Entitlements Reference

| Security group | Grants |
|---|---|
| `CUSTOMER-DATA-READ` | Read masked customer records |
| `ACCOUNT-DATA-READ` | Read masked account records |
| `PII-UNMASK` | See unmasked SSN/phone/email on records you're otherwise entitled to read |
| `REGION-<name>` / `REGION-ALL` | Row-level scope for which regions' records are visible |
| `FINANCE-METRICS-READ` | Read certified finance metrics (deposits, average balance) |
| `RISK-METRICS-READ` | Read certified risk metrics (delinquency rate) |
| `HR-METRICS-READ` | Read certified workforce metrics (headcount) |
| `DATA-POLICY-READ` | Read this policy and related governance documents |

## Requesting Access

Submit an entitlement request through the Data Governance portal. Requests
for `PII-UNMASK` or `REGION-ALL` require a manager's approval and are
reviewed quarterly.
