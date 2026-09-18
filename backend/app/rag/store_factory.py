from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.rag.vectorstores.base import VectorStore


def get_vector_store(session: AsyncSession) -> VectorStore:
    settings = get_settings()
    if settings.vector_store_backend == "chroma":
        # Imported lazily: the chromadb client is only needed when this
        # backend is actually selected, so the default pgvector-only
        # deployment (and test code that never touches vector search at
        # all) doesn't have to install/import it.
        from app.rag.vectorstores.chroma_store import ChromaVectorStore

        return ChromaVectorStore()
    from app.rag.vectorstores.pgvector_store import PgVectorStore

    return PgVectorStore(session)
