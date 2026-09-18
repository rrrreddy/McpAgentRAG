# API reference

Full interactive reference: `GET /docs` (Swagger UI) or `GET /redoc` on the
running backend. This page covers the shape of the main endpoints and a
couple of things the OpenAPI schema doesn't make obvious.

## Auth

| Endpoint | Method | Notes |
|---|---|---|
| `/api/auth/register` | POST | Creates an `analyst` with **no** security_groups — entitlements are granted separately by an admin/steward, never self-assigned |
| `/api/auth/token` | POST | OAuth2 password flow (`application/x-www-form-urlencoded`: `username`, `password`) → access + refresh token |
| `/api/auth/refresh` | POST | Rotates the refresh token (old one is revoked) |
| `/api/auth/logout` | POST | Revokes the given refresh token server-side |
| `/api/auth/me` | GET | Returns the caller's own profile, incl. `security_groups` |

```bash
curl -X POST http://localhost:8000/api/auth/token \
  -d "username=analyst.northeast@bank.example&password=AnalystPass123!"
```

## Chat

| Endpoint | Method | Notes |
|---|---|---|
| `/api/chat` | POST | `{question, conversation_id?}` → one full agent-graph pass; rate-limited per user |
| `/api/chat/conversations` | GET | List the caller's own conversations |
| `/api/chat/conversations/{id}/messages` | GET | Full message history for one conversation (ownership-checked) |

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/token \
  -d "username=analyst.northeast@bank.example&password=AnalystPass123!" | jq -r .access_token)

curl -X POST http://localhost:8000/api/chat \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"question": "What was total_deposits for 2026-06?"}'
```

Response shape (`ChatResponse`):

```json
{
  "conversation_id": "...",
  "message_id": "...",
  "route": "data",
  "answer": "...",
  "citations": [{"source_type": "datahub", "title": "Total Deposits", "reference": "total_deposits", "excerpt": "..."}],
  "confidence": 0.75,
  "table_data": {"columns": ["metric", "period", "value", "unit"], "rows": [...]},
  "chart_spec": {"type": "stat", "label": "Total Deposits", "value": 136118820.4, "unit": "USD", "period": "2026-06"},
  "correlation_id": "..."
}
```

`chart_spec.type` is one of `stat` (single value), `bar` (two-period
comparison), or `line` (time series) — see
`backend/app/analytics/chart_builder.py`.

## Documents (data steward / admin only)

| Endpoint | Method | Notes |
|---|---|---|
| `/api/documents/index` | POST | Index a SharePoint export; `security_groups` is required and non-empty — there is no "public by default" path |

## Admin

| Endpoint | Method | Notes |
|---|---|---|
| `/api/admin/users/{id}/entitlements` | PATCH | Set a user's `security_groups` (admin or data_steward) |
| `/api/admin/audit-log` | GET | Recent audit events, filterable by `event_type` |
| `/api/admin/gateway/health` | GET | Live health of each configured model provider (admin only) |

## Correlation IDs

Every response carries an `X-Correlation-Id` header (generated if the
client didn't send one). Pass the same value back in a support request or
`/api/admin/audit-log?...` lookup to reconstruct exactly what a single
request did across every agent hop and MCP tool call.
