---
document_id: GLOSSARY-045
title: DataHub Business Glossary
source_url: https://bank.sharepoint.com/sites/DataGovernance/Business-Glossary
source_system: sharepoint
classification: INTERNAL
security_groups: [DATA-POLICY-READ, FINANCE-METRICS-READ, RISK-METRICS-READ]
modified_at: 2026-07-15T09:30:00Z
---

# DataHub Business Glossary

Certified definitions for terms used across DataHub metrics and reports.
If a definition here conflicts with a term used informally elsewhere,
this glossary is authoritative.

## Delinquent account

An account is **delinquent** if a required minimum payment has not been
received within **30 calendar days** of its due date. Delinquency is
measured at the account level, not the customer level — a customer with
multiple accounts may have one delinquent and one current account
simultaneously.

## Delinquency rate

The **delinquency rate** for a period is the percentage of active
accounts that are delinquent as of the last calendar day of that period:

```
delinquency_rate = (delinquent_accounts / active_accounts) * 100
```

Closed and dormant (no activity for 180+ days) accounts are excluded from
both the numerator and denominator.

## Total deposits

**Total deposits** is the sum of end-of-period balances across all
CHECKING and SAVINGS account types, excluding accounts flagged as
fraudulent or under legal hold.

## Active account

An account is **active** if it has had at least one transaction in the
trailing 90 days, or was opened within the trailing 90 days.

## Region

Customers and accounts are assigned exactly one **region**
(`NORTHEAST`, `SOUTHEAST`, `WEST`) at account opening, based on the
customer's registered mailing address at that time. Region does not
change automatically if the customer later moves.
