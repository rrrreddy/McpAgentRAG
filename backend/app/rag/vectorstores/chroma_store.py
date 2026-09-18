"""ChromaDB-backed vector store — alternate backend selectable via
VECTOR_STORE_BACKEND=chroma. Useful for local development without a
Postgres instance, or when experimenting with different index/ranking
strategies than pgvector's ivfflat/HNSW.
"""
from __future__ import annotations

from datetime import datetime

import chromadb

from app.config import get_settings
from app.rag.embeddings import embed_query, embed_texts
from app.rag.vectorstores.base import RetrievedChunk, VectorStore

COLLECTION_NAME = "sharepoint_docs"


class ChromaVectorStore(VectorStore):
    def __init__(self) -> None:
        settings = get_settings()
        self._client = chromadb.HttpClient(host=settings.chroma_host, port=settings.chroma_port)
        self._collection = self._client.get_or_create_collection(COLLECTION_NAME)

    async def upsert_chunks(self, *, document_id, title, source_url, source_system, classification,
                             security_groups, modified_at, chunks: list[str]) -> int:
        existing = self._collection.get(where={"document_id": document_id})
        if existing and existing.get("ids"):
            self._collection.delete(ids=existing["ids"])

        ids = [f"{document_id}:{i}" for i in range(len(chunks))]
        vectors = embed_texts(chunks)
        metadatas = [
            {
                "document_id": document_id,
                "title": title,
                "source_url": source_url,
                "source_system": source_system,
                "classification": classification,
                "security_groups": ",".join(security_groups),
                "modified_at": modified_at.isoformat() if modified_at else "",
                "chunk_id": ids[i],
            }
            for i in range(len(chunks))
        ]
        self._collection.add(ids=ids, embeddings=vectors, documents=chunks, metadatas=metadatas)
        return len(chunks)

    async def similarity_search(self, query: str, *, k: int) -> list[RetrievedChunk]:
        query_vector = embed_query(query)
        results = self._collection.query(query_embeddings=[query_vector], n_results=k)
        out: list[RetrievedChunk] = []
        for doc, meta, distance in zip(results["documents"][0], results["metadatas"][0], results["distances"][0]):
            modified_at = datetime.fromisoformat(meta["modified_at"]) if meta.get("modified_at") else None
            out.append(
                RetrievedChunk(
                    document_id=meta["document_id"],
                    chunk_id=meta["chunk_id"],
                    title=meta["title"],
                    source_url=meta["source_url"],
                    source_system=meta["source_system"],
                    classification=meta["classification"],
                    security_groups=[g for g in meta["security_groups"].split(",") if g],
                    modified_at=modified_at,
                    content=doc,
                    score=1.0 - float(distance),
                )
            )
        return out

    async def delete_document(self, document_id: str) -> None:
        existing = self._collection.get(where={"document_id": document_id})
        if existing and existing.get("ids"):
            self._collection.delete(ids=existing["ids"])
