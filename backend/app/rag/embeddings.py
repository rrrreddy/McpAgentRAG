"""Embedding model wrapper.

Uses a local sentence-transformers model (bge-small-en-v1.5, 384-dim) so
indexing/embedding never has to leave the network perimeter or depend on a
paid API — only the LLM reasoning/synthesis step goes through the model
gateway to an external provider.
"""
from __future__ import annotations

from functools import lru_cache
from typing import TYPE_CHECKING

from app.config import get_settings

if TYPE_CHECKING:
    from sentence_transformers import SentenceTransformer

EMBEDDING_DIM = 384


@lru_cache
def _model() -> "SentenceTransformer":
    # Imported lazily: only the process that actually embeds text (the API
    # server during RAG indexing/retrieval) needs to pull in
    # sentence-transformers/torch. lineage-mcp, governance-mcp, and test
    # code that only exercises routing/ACL logic never pay that cost.
    from sentence_transformers import SentenceTransformer

    settings = get_settings()
    return SentenceTransformer(settings.embedding_model)


def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    vectors = _model().encode(texts, normalize_embeddings=True, show_progress_bar=False)
    return [v.tolist() for v in vectors]


def embed_query(text: str) -> list[float]:
    return embed_texts([text])[0]
