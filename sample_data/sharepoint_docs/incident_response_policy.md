---
document_id: POLICY-207
title: AI Assistant Incident Response Policy
source_url: https://bank.sharepoint.com/sites/DataGovernance/AI-Incident-Response
source_system: sharepoint
classification: CONFIDENTIAL
security_groups: [DATA-POLICY-READ]
modified_at: 2026-06-01T14:00:00Z
---

# AI Assistant Incident Response Policy

## Scope

Applies to the Enterprise RAG + MCP Agents platform and any successor
system that answers employee questions using retrieval-augmented
generation over bank data.

## What counts as an incident

- The assistant returns unmasked PII to a user not entitled to `PII-UNMASK`.
- The assistant returns a record or metric to a user outside their
  region/entitlement scope.
- The assistant's answer contains a fabricated citation (a source that
  does not exist or does not say what the answer claims).
- A prompt injection embedded in a retrieved document causes the
  assistant to take an unintended action or disclose data it should not.

## Response steps

1. **Contain**: disable the affected MCP tool or knowledge source via the
   admin console immediately; this does not require code deployment.
2. **Assess**: pull the correlation ID from the flagged conversation and
   query the audit log (`audit_log` table / governance-mcp) for every
   tool call in that request, to determine exactly what data was
   returned and to whom.
3. **Notify**: Data Governance and, if PII was disclosed, the Privacy
   Office, within 4 business hours.
4. **Remediate**: fix the root cause (ACL bug, missing RLS policy,
   prompt-injection guardrail gap) and add a regression case to the
   golden evaluation dataset before re-enabling the affected capability.
5. **Review**: post-incident review within 5 business days; findings feed
   back into this policy and the platform's threat model.
