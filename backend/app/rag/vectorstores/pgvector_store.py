"""pgvector-backed vector store — the default/recommended backend.

Chosen over a fully-managed Azure AI Search stack per D11's trade-off
table: keeps embeddings/chunks colocated with the rest of the app's
relational data (conversations, audit log) in one database to operate,
at the cost of owning the vector index ourselves.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import DocumentChunk
from app.rag.embeddings import embed_query, embed_texts
from app.rag.vectorstores.base import RetrievedChunk, VectorStore


class PgVectorStore(VectorStore):
    def __init__(self, session: AsyncSession):
        self._session = session

    async def upsert_chunks(self, *, document_id, title, source_url, source_system, classification,
                             security_groups, modified_at, chunks: list[str]) -> int:
        await self._session.execute(delete(DocumentChunk).where(DocumentChunk.document_id == document_id))
        vectors = embed_texts(chunks)
        for i, (chunk_text, vector) in enumerate(zip(chunks, vectors)):
            self._session.add(
                DocumentChunk(
                    document_id=document_id,
                    chunk_id=f"{document_id}:{i}",
                    title=title,
                    source_url=source_url,
                    source_system=source_system,
                    classification=classification,
                    security_groups=security_groups,
                    modified_at=modified_at,
                    content=chunk_text,
                    embedding=vector,
                )
            )
        await self._session.commit()
        return len(chunks)

    async def similarity_search(self, query: str, *, k: int) -> list[RetrievedChunk]:
        query_vector = embed_query(query)
        # cosine distance via pgvector's <=> operator; lower is more similar
        stmt = (
            select(DocumentChunk, DocumentChunk.embedding.cosine_distance(query_vector).label("distance"))
            .order_by(text("distance ASC"))
            .limit(k)
        )
        result = await self._session.execute(stmt)
        rows = result.all()
        return [
            RetrievedChunk(
                document_id=row.DocumentChunk.document_id,
                chunk_id=row.DocumentChunk.chunk_id,
                title=row.DocumentChunk.title,
                source_url=row.DocumentChunk.source_url,
                source_system=row.DocumentChunk.source_system,
                classification=row.DocumentChunk.classification,
                security_groups=row.DocumentChunk.security_groups,
                modified_at=row.DocumentChunk.modified_at,
                content=row.DocumentChunk.content,
                score=1.0 - float(row.distance),
            )
            for row in rows
        ]

    async def delete_document(self, document_id: str) -> None:
        await self._session.execute(delete(DocumentChunk).where(DocumentChunk.document_id == document_id))
        await self._session.commit()
