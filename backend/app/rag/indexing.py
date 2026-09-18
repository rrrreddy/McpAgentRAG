"""Document indexing pipeline (D4.2): clean -> chunk -> embed -> upsert.

`index_document` is the ingestion entry point called by
scripts/index_documents.py for SharePoint exports, and could equally be
wired to a SharePoint webhook/Graph API delta sync in production.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.rag.chunking import split_text
from app.rag.store_factory import get_vector_store


@dataclass
class SourceDocument:
    document_id: str
    title: str
    text: str
    source_url: str
    source_system: str
    classification: str
    modified_at: datetime | None


async def index_document(session: AsyncSession, doc: SourceDocument, acl_groups: list[str]) -> int:
    if not acl_groups:
        raise ValueError(f"Refusing to index document {doc.document_id} with no security_groups — "
                          "an ungoverned document would be retrievable by every user.")
    chunks = [c.text for c in split_text(doc.text, chunk_size=800, chunk_overlap=120)]
    store = get_vector_store(session)
    return await store.upsert_chunks(
        document_id=doc.document_id,
        title=doc.title,
        source_url=doc.source_url,
        source_system=doc.source_system,
        classification=doc.classification,
        security_groups=acl_groups,
        modified_at=doc.modified_at,
        chunks=chunks,
    )
