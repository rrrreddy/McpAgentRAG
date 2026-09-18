# Setup guide — getting the whole stack running

## Prerequisites

- Docker + Docker Compose v2 (`docker compose version` should print `2.x`)
- An Anthropic API key (recommended default provider) — or skip it and run
  fully local via Ollama (see below)
- ~4 GB free disk for images/volumes on first `up`

## 1. Clone and configure

```bash
git clone <this-repo-url>
cd McpAgentRAG
cp .env.example .env
```

Open `.env` and fill in, at minimum:

- `JWT_SECRET_KEY` — generate with `python -c "import secrets; print(secrets.token_urlsafe(48))"`
- `POSTGRES_SUPERUSER_PASSWORD`, `POSTGRES_PASSWORD`, `POSTGRES_READONLY_PASSWORD` — any strong, distinct values
- `MCP_SHARED_SECRET` — another random value (generate the same way)
- `ANTHROPIC_API_KEY` — your key, **or** leave blank and set
  `MODEL_GATEWAY_PRIMARY_PROVIDER=ollama` to run fully offline (see §6)

Never commit `.env` — it's already git-ignored.

## 2. Start the stack

```bash
make up
```

This runs `docker compose up -d --build`, which:

1. Starts Postgres (with `pgvector` installed) and Redis.
2. Runs `sample_data/db_init/*.sh` / `*.sql` **once**, automatically, the
   first time the Postgres volume is created — this creates the
   `ragmcp_app` / `ragmcp_readonly` roles and the whole `datahub` schema
   (RLS policies, masked views, seed rows).
3. Runs the one-shot `migrate` service (`alembic upgrade head`) to create
   the application schema (users, conversations, messages, audit_log,
   document_chunks, lineage_nodes/edges, workflows).
4. Starts `backend`, all four MCP servers, and `frontend`.

Check everything is healthy:

```bash
docker compose ps
curl http://localhost:8000/health/ready
```

## 3. Seed demo data

```bash
make seed
```

This runs, in order:

- `scripts/seed_users.py` — creates 4 demo accounts spanning every
  role/entitlement combination the golden dataset exercises (see the
  table below).
- `scripts/index_documents.py` — chunks + embeds the 3 sample SharePoint
  markdown docs in `sample_data/sharepoint_docs/` into pgvector, using
  each file's YAML front matter as ACL metadata.
- `scripts/parse_informatica_samples.py` — parses the sample PowerCenter
  XML exports in `sample_data/informatica_exports/` and persists the
  decoded lineage graph.

### Demo accounts

| Email | Password | Role | Notable entitlements |
|---|---|---|---|
| `admin@bank.example` | `AdminPass123!` | admin | everything, incl. `PII-UNMASK`, `REGION-ALL` |
| `steward@bank.example` | `StewardPass123!` | data_steward | NE/SE regions, finance + risk metrics, no PII-UNMASK |
| `analyst.northeast@bank.example` | `AnalystPass123!` | analyst | NE region only, finance metrics |
| `analyst.limited@bank.example` | `AnalystPass123!` | analyst | **no entitlements at all** — use this one to see denials work |

**Change or remove these before deploying anywhere real** — they're
intentionally documented in this repo for demo purposes.

## 4. Try it

- **UI**: open http://localhost:5173, log in as one of the demo accounts.
- **API docs**: http://localhost:8000/docs (Swagger UI, JWT-authenticated
  — click "Authorize" after calling `/api/auth/token` once, or just use
  the UI which handles this for you).

Suggested first questions (try with `analyst.northeast@bank.example`):

1. *"What is our data access policy for customer PII?"* → routes to
   Knowledge Agent, cites `POLICY-123`.
2. *"What was total_deposits for 2026-06?"* → routes to Data Agent,
   returns a stat tile + table, cites the DataHub metric.
3. *"Plot the delinquency rate trend"* → Data Agent + a line chart.
4. *"Where does account_balance come from in M_LOAD_ACCOUNTS?"* →
   Lineage Agent traces the field back through the decoded mapping.

Then log in as `analyst.limited@bank.example` and ask question 2 again —
you should get a clear denial, not a plausible-looking (wrong) number.

## 5. Run the automated checks

```bash
make test       # backend pytest suite (auth, ACL filtering, Informatica
                 # parser, MCP tool schema governance, routing)
make evaluate    # the golden-dataset quality gate (D9) against the live stack
make lint        # syntax check
```

## 6. Running fully offline (no API key)

Set in `.env`:

```
MODEL_GATEWAY_PRIMARY_PROVIDER=ollama
```

Then start the optional `ollama` profile and pull a model:

```bash
docker compose --profile ollama up -d ollama
docker compose exec ollama ollama pull llama3.1:8b
```

Embeddings already run locally regardless of provider choice
(`sentence-transformers`, no API needed) — only the reasoning/synthesis
calls go to whichever provider you configure.

## 7. Switching the vector store backend

Default is `pgvector` (colocated with the rest of the app's relational
data). To use ChromaDB instead:

```
VECTOR_STORE_BACKEND=chroma
```

Re-run `make seed`'s indexing step after switching — the two backends
don't share data.

## Troubleshooting

These are real issues hit and fixed while building this repo — if you see
them, here's why and what already handles it:

- **`AttributeError: module 'bcrypt' has no attribute '__about__'`** —
  `passlib==1.7.4`'s bcrypt backend probes an attribute that `bcrypt>=4.1`
  removed. `requirements.txt` pins `bcrypt==4.0.1` specifically to avoid
  this; if you bump bcrypt, re-verify password hashing still works
  silently (no warning on `hash_password`/`verify_password`).
- **pip resolver conflict between `fastapi` and `starlette`** — the `mcp`
  SDK pulls in whatever `starlette` version it currently needs, and a
  hard `fastapi==` pin can end up incompatible. `requirements.txt`
  intentionally leaves `fastapi`/`uvicorn` as `>=` ranges so pip can
  resolve them together; if you need fully pinned reproducible builds,
  `pip freeze` inside a working container and pin from there.
- **MCP SDK API drift** — this repo targets `mcp>=1.9.0,<2.0.0` and was
  built/tested against `mcp==1.30.0`'s `FastMCP` (`streamable_http_app()`,
  `mcp.tool()`) and client (`mcp.client.streamable_http.streamablehttp_client`,
  3-tuple `(read, write, get_session_id)`) APIs. If a much newer SDK
  renames these, `app/mcp_servers/base.py::build_secured_app` and
  `app/mcp_servers/client.py` are the two places to adjust.
- **`ModuleNotFoundError: email_validator`** — `pydantic.EmailStr` needs
  `email-validator`, which is in `requirements.txt`; if you strip
  dependencies for a slim build, keep this one if you keep `EmailStr`.
- **RLS silently doing nothing** — see
  `sample_data/db_init/README.md`: this happens if the `datahub` schema's
  tables/views ever end up owned by a superuser. The bootstrap scripts are
  written specifically to avoid that; don't run
  `02-datahub-schema.sql` by hand as the Postgres superuser without the
  `SET ROLE ragmcp_app;` line intact.

## Repository layout

```
backend/
  app/
    auth/          JWT, password hashing, RBAC
    db/            SQLAlchemy models + session management
    memory/        Redis-backed conversation memory + rate limiting
    gateway/       Model provider abstraction + guardrails
    rag/           Chunking, embeddings, pgvector/Chroma stores, ACL retrieval
    informatica/   PowerCenter XML parser + lineage graph
    mcp_servers/   knowledge-mcp, db-mcp, lineage-mcp, governance-mcp
    agents/        LangGraph supervisor + specialist + synthesis agents
    analytics/     Chart spec builder for DB query results
    api/           FastAPI routes
    audit/         Audit log writer
    evaluation/    Golden dataset + evaluator
  scripts/         Seed/index/parse one-off scripts
  tests/           pytest suite
  migrations/      Alembic
frontend/
  src/
    api/           Fetch client with auth/refresh handling
    state/         Zustand stores (auth, chat)
    components/    Chat UI, charts, tables, citations
sample_data/
  db_init/         Postgres bootstrap (roles, datahub schema, RLS, seed rows)
  sharepoint_docs/ Sample policy docs with ACL front matter
  informatica_exports/ Sample PowerCenter mapping/workflow XML
docs/              This documentation
```
