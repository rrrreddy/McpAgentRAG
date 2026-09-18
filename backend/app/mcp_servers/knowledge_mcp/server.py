"""knowledge-mcp: narrow, typed tools over SharePoint/wiki content (D5).

Tools: search_policy, retrieve_document, get_definition, list_sources.
No tool accepts free-form SQL, HTTP, or file paths — every input is a
plain string/int and every output is a pre-shaped, ACL-filtered payload.
Retrieval ACL enforcement happens in app.rag.retrieval.retrieve, which is
a hard, code-level filter — this server never trusts a caller-supplied
"user is authorized" flag; it derives entitlements only from the
service-auth-verified caller context (see base.py).
"""
from __future__ import annotations

import uvicorn
from mcp.server.fastmcp import FastMCP

from app.config import get_settings
from app.db.session import SessionLocal
from app.mcp_servers.base import audited_tool, build_secured_app, get_caller_context
from app.rag.retrieval import retrieve

settings = get_settings()
mcp = FastMCP("knowledge-mcp", host="0.0.0.0", port=9101)


@mcp.tool()
@audited_tool("knowledge_mcp")
async def search_policy(query: str, top_k: int = 5) -> dict:
    """Search internal policy/wiki documents relevant to a natural-language
    question. Returns ACL-filtered passages with citation metadata only —
    never the full document and never documents outside the caller's
    security_groups."""
    ctx = get_caller_context()
    if not ctx.security_groups:
        raise PermissionError("caller has no security_groups; cannot authorize any document")
    async with SessionLocal() as session:
        chunks = await retrieve(
            session, query, user_groups=ctx.security_groups, k=min(top_k, 10),
            correlation_id=ctx.correlation_id, user_id=ctx.user_id, actor=ctx.actor,
        )
    return {
        "results": [
            {
                "document_id": c.document_id,
                "chunk_id": c.chunk_id,
                "title": c.title,
                "source_url": c.source_url,
                "classification": c.classification,
                "excerpt": c.content[:1200],
                "relevance_score": round(c.score, 4),
            }
            for c in chunks
        ]
    }


@mcp.tool()
@audited_tool("knowledge_mcp")
async def retrieve_document(document_id: str) -> dict:
    """Fetch all authorized chunks for a single document_id (used once the
    caller already knows which document they want, e.g. from a citation)."""
    ctx = get_caller_context()
    if not ctx.security_groups:
        raise PermissionError("caller has no security_groups; cannot authorize any document")
    async with SessionLocal() as session:
        chunks = await retrieve(
            session, document_id, user_groups=ctx.security_groups, k=50,
            correlation_id=ctx.correlation_id, user_id=ctx.user_id, actor=ctx.actor,
        )
    matching = [c for c in chunks if c.document_id == document_id]
    if not matching:
        raise PermissionError(f"document {document_id} not found or not authorized for caller")
    matching.sort(key=lambda c: c.chunk_id)
    return {
        "document_id": document_id,
        "title": matching[0].title,
        "source_url": matching[0].source_url,
        "classification": matching[0].classification,
        "content": "\n\n".join(c.content for c in matching),
    }


@mcp.tool()
@audited_tool("knowledge_mcp")
async def get_definition(term: str) -> dict:
    """Look up a governed business-glossary definition for a term (e.g.
    "what counts as a delinquent account"). Backed by the same ACL-filtered
    knowledge base as search_policy, scoped to glossary-classified docs."""
    ctx = get_caller_context()
    async with SessionLocal() as session:
        chunks = await retrieve(
            session, f"definition of {term}", user_groups=ctx.security_groups, k=3,
            correlation_id=ctx.correlation_id, user_id=ctx.user_id, actor=ctx.actor,
        )
    if not chunks:
        return {"term": term, "definition": None, "message": "No authorized definition found."}
    top = chunks[0]
    return {"term": term, "definition": top.content[:800], "source_document_id": top.document_id, "source_url": top.source_url}


@mcp.tool()
@audited_tool("knowledge_mcp")
async def list_sources() -> dict:
    """List the document source systems this server can search (metadata
    only — never enumerates individual document titles/ids in bulk, which
    would itself be a disclosure of what exists behind the ACL)."""
    return {"sources": [{"source_system": "sharepoint", "description": "Bank policy wiki and internal documentation"}]}


def create_app():
    return build_secured_app(mcp, shared_secret=settings.mcp_shared_secret)


if __name__ == "__main__":
    uvicorn.run(create_app(), host="0.0.0.0", port=9101)
