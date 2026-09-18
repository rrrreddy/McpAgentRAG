"""ACL-filtered retrieval (D4.2 / D10).

WATCH OUT (from the spec, and worth repeating in code): ACL filtering
happens here as a hard, code-level gate applied AFTER vector similarity
search, never by asking the model to "only use documents you're allowed
to see." An LLM is not an access-control mechanism. Every chunk that
reaches the synthesis agent has already been proven authorized.
"""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.logger import record_audit_event
from app.rag.store_factory import get_vector_store
from app.rag.vectorstores.base import RetrievedChunk

OVERFETCH_MULTIPLIER = 3


async def retrieve(
    session: AsyncSession,
    query: str,
    *,
    user_groups: list[str],
    k: int = 6,
    correlation_id: str = "-",
    user_id: str | None = None,
    actor: str = "unknown",
) -> list[RetrievedChunk]:
    store = get_vector_store(session)
    candidates = await store.similarity_search(query, k=k * OVERFETCH_MULTIPLIER)

    authorized: list[RetrievedChunk] = []
    denied_count = 0
    for chunk in candidates:
        if set(chunk.security_groups) & set(user_groups):
            authorized.append(chunk)
        else:
            denied_count += 1
        if len(authorized) >= k:
            break

    await record_audit_event(
        correlation_id=correlation_id,
        user_id=user_id,
        actor=actor,
        event_type="rag_retrieval",
        resource="knowledge_base",
        decision="allow",
        detail={
            "query_preview": query[:200],
            "candidates_considered": len(candidates),
            "authorized_returned": len(authorized),
            "denied_by_acl": denied_count,
        },
    )
    return authorized
