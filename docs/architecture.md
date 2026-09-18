# Architecture

This document is the detailed companion to the [README](../README.md)'s
architecture summary. All diagrams are Mermaid and render natively on
GitHub — no extra tooling needed to view them.

## 1. System overview

```mermaid
flowchart TB
    subgraph Sources["Sources"]
        DB[("Bank DataHub<br/>(Oracle in prod / Postgres here)<br/>read-only")]
        SP[("SharePoint<br/>policy docs / wiki")]
        IFA[("Informatica PowerCenter<br/>XML exports")]
    end

    subgraph Ingest["Ingest / Index (offline, batch)"]
        CHUNK["Chunk + embed<br/>(sentence-transformers)"]
        PARSE["Parse WORKFLOW/SESSION/<br/>MAPPING/CONNECTOR XML"]
    end

    VEC[("pgvector / ChromaDB<br/>document_chunks")]
    LIN[("lineage_nodes / lineage_edges<br/>(Postgres)")]

    SP --> CHUNK --> VEC
    IFA --> PARSE --> LIN

    subgraph MCP["MCP layer — narrow, typed, audited tools only"]
        KMCP["knowledge-mcp<br/>search_policy, retrieve_document,<br/>get_definition, list_sources"]
        DMCP["db-mcp<br/>get_metric, get_record,<br/>compare_periods, get_metric_timeseries"]
        LMCP["lineage-mcp<br/>get_mapping, get_transform_rule,<br/>get_source_target_fields,<br/>get_workflow_summary"]
        GMCP["governance-mcp<br/>check_user_entitlement,<br/>classification_policy, audit_event"]
    end

    VEC -.ACL-filtered read.-> KMCP
    DB -.read-only, RLS + masked views.-> DMCP
    LIN -.-> LMCP

    subgraph Agents["LangGraph agents"]
        SUP["Supervisor / Router<br/>(rules + small-model classifier)"]
        KA["Knowledge Agent"]
        DA["Data Agent"]
        LA["Lineage Agent"]
        GA["Governance Agent"]
        SYN["Synthesis Agent"]
    end

    SUP --> KA & DA & LA
    KA --> KMCP
    DA --> DMCP
    LA --> LMCP
    KA & DA & LA -. denial .-> GA
    GA --> GMCP
    KA & DA & LA --> SYN

    GW["Model Gateway<br/>Anthropic / OpenAI / Ollama<br/>guardrails + budget + fallback"]
    SUP -. small-model classify .-> GW
    DA -. structured extraction .-> GW
    LA -. structured extraction .-> GW
    SYN -. grounded synthesis .-> GW

    subgraph Serving["Serving"]
        API["FastAPI<br/>JWT-authenticated"]
        UI["React chat UI<br/>citations + tables + charts"]
    end

    UI -->|HTTPS + JWT| API --> SUP
    SYN --> API
    GA --> API
    API --> UI
```

## 2. Trust boundaries (D3)

Every hop between "outside" and "inside" enforces a specific rule. This is
the fastest way to reason about the system's security posture:

```mermaid
flowchart LR
    U["User / Browser"] -->|"JWT/OAuth2, scope + role\nvalidation, request size limits"| API["FastAPI"]
    API -->|"Only agents the user's\nrole is entitled to invoke"| AG["Agent graph"]
    AG -->|"Allowlisted, typed tools only;\ntyped inputs; timeouts;\nNO free-form SQL/HTTP"| MCP["MCP servers"]
    MCP -->|"Read-only service identity;\nrow/column policy enforced\nserver-side (RLS + masked views)"| DATA["DataHub / SharePoint index /\nLineage store"]
    DATA -->|"Only ACL-filtered,\nretrieved evidence enters\nthe prompt context"| LLM["LLM (via Model Gateway)"]
    LLM -->|"No invented facts;\nevery claim carries a citation"| U
```

Each arrow above maps directly to a piece of code:

| Boundary | Enforced in |
|---|---|
| User → API | `app/auth/*`, `app/main.py` middleware (CORS, size limit, rate limit) |
| API → Agents | `app/auth/rbac.py` (`AGENT_CAPABILITIES`), checked in `app/agents/supervisor.py` |
| Agent → MCP | `app/mcp_servers/*/server.py` — every tool is `@mcp.tool()` with scalar-typed params only |
| MCP → Data | `app/mcp_servers/db_mcp/oracle_adapter.py` (RLS + masked views), `app/rag/retrieval.py` (ACL hard-filter) |
| RAG → LLM | `app/gateway/guardrails.py::wrap_untrusted_evidence` |
| LLM → User | `app/agents/synthesis_agent.py` (citations required, confidence derived from real signals) |

## 3. Request sequence (a single chat turn)

```mermaid
sequenceDiagram
    participant U as User (browser)
    participant API as FastAPI /api/chat
    participant SUP as Supervisor
    participant DA as Data Agent
    participant MCP as db-mcp
    participant PG as Postgres (RLS + masked views)
    participant GW as Model Gateway
    participant SYN as Synthesis Agent

    U->>API: POST /api/chat {question} + JWT
    API->>API: verify JWT, rate limit, load conversation memory
    API->>SUP: invoke agent graph (question, user, groups)
    SUP->>GW: (if no keyword rule matches) classify intent
    GW-->>SUP: route = "data"
    SUP->>DA: dispatch
    DA->>MCP: list_metrics()
    MCP-->>DA: allowlisted metric catalog
    DA->>GW: extract {metric_name, period} (structured, small model)
    GW-->>DA: {"metric_name": "total_deposits", "period": "2026-06"}
    DA->>MCP: get_metric("total_deposits", "2026-06")
    MCP->>PG: SET app.user_security_groups; SELECT ... FROM v_metric_total_deposits
    PG-->>MCP: value (only if entitlement check passed)
    MCP-->>DA: {value, unit, found}
    DA->>DA: build chart_spec + table_data
    DA-->>SYN: evidence + tool_results
    SYN->>GW: synthesize grounded answer (evidence wrapped as untrusted data)
    GW-->>SYN: answer text
    SYN-->>API: answer + citations + confidence + chart + table
    API-->>U: ChatResponse (persisted to conversations/messages)
```

## 4. RAG indexing + ACL-filtered retrieval (D4)

```mermaid
flowchart LR
    DOC["SharePoint doc\n+ security_groups metadata"] --> SPLIT["chunk (800/120 overlap)"]
    SPLIT --> EMB["embed (bge-small-en-v1.5)"]
    EMB --> STORE[("document_chunks\n(pgvector) or Chroma")]

    Q["query + user's security_groups"] --> SEARCH["similarity_search(k*3)"]
    STORE --> SEARCH
    SEARCH --> GATE{"hard ACL gate:\nintersect chunk.security_groups\nwith user.security_groups?"}
    GATE -->|no overlap| DROP["dropped — never reaches the model"]
    GATE -->|overlap| KEEP["kept, capped at k"]
    KEEP --> EVID["evidence, wrapped as untrusted data"]
```

The gate happens in `app/rag/retrieval.py::retrieve` — strictly after
similarity search, entirely in application code, never delegated to the
model. See `docs/oracle_datahub_security.md` for the equivalent
enforcement on the structured-data side (row/column security in Postgres
RLS / Oracle VPD).

## 5. Informatica decoding pipeline (D7)

```mermaid
flowchart LR
    XML["PowerCenter XML export\n(mapping / session / workflow)"] --> PARSE["app.informatica.parser\n(lxml)"]
    PARSE --> MODEL["ParsedMapping / ParsedWorkflow\n(transformations, ports, connectors,\nsessions, execution order)"]
    MODEL --> GRAPH["app.informatica.lineage_graph\nbuild_networkx_graph()\n+ intra-transformation wiring\nfrom port expressions"]
    GRAPH --> PERSIST[("lineage_nodes / lineage_edges /\nworkflows (Postgres)")]
    PERSIST --> LMCP["lineage-mcp tools\n(get_mapping, get_transform_rule, ...)"]
    LMCP --> QUERY["Agent Q&A:\n'where does target field X come from?'"]
```

The one subtlety worth calling out explicitly (it cost a real bug during
development — see `app/informatica/lineage_graph.py`'s docstring): a
PowerCenter `<CONNECTOR>` only wires a port on one transformation instance
to a port on another. It never describes how a transformation's own input
ports flow into its own output ports — that logic lives implicitly in each
output port's `EXPRESSION` attribute. The lineage graph builder adds those
intra-transformation edges explicitly by matching input port names inside
each output port's expression text; skip that step and every expression
transformation silently truncates the traced lineage by one hop.

## 6. Multi-agent responsibility table (D6)

| Agent | Responsibility | Must not do |
|---|---|---|
| Supervisor | Classify intent (rules → small-model fallback → policy gate), delegate | Directly query arbitrary data |
| Knowledge Agent | SharePoint/wiki retrieval via `knowledge-mcp` | Bypass ACL filtering |
| Data Agent | Certified metrics/records via `db-mcp` only | Invent a metric definition or run raw SQL |
| Lineage Agent | Informatica mapping/workflow decoding Q&A via `lineage-mcp` | Guess a mapping rule it hasn't actually parsed |
| Governance Agent | Explain denials, entitlements, audit narrative events | Grant access itself |
| Synthesis Agent | Combine evidence into one grounded, cited answer | Override authorization or invent facts |

## 7. Deployment topology (docker-compose)

```mermaid
flowchart TB
    subgraph Docker["docker compose"]
        FE["frontend (nginx)\n:5173"]
        BE["backend (FastAPI)\n:8000"]
        KM["knowledge-mcp\n:9101"]
        DM["db-mcp\n:9102"]
        LM["lineage-mcp\n:9103"]
        GM["governance-mcp\n:9104"]
        PG[("postgres + pgvector\n:5432")]
        RD[("redis\n:6379")]
        CH[("chroma (optional)\n:8001")]
        OL[("ollama (optional profile)\n:11434")]
    end
    FE --> BE
    BE --> KM & DM & LM & GM
    BE --> PG & RD
    KM --> PG
    DM --> PG
    LM --> PG
    GM --> PG
    BE -.-> CH
    BE -.fallback provider.-> OL
```

Every backend-family container (`backend`, the four MCP servers, and the
one-shot `migrate` job) is built from the **same image** — only the
`command:` differs — so there is exactly one Dockerfile and one
`requirements.txt` to keep in sync. See `docker-compose.yml`.
