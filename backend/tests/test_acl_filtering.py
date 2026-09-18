"""D4.2's core security property: ACL filtering is a hard, code-level gate
applied AFTER similarity search, never delegated to the model. These tests
exercise app.rag.retrieval.retrieve directly against a fake vector store so
they run with no real Postgres/embedding model.
"""
from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.rag import retrieval
from app.rag.vectorstores.base import RetrievedChunk


class FakeVectorStore:
    def __init__(self, chunks: list[RetrievedChunk]):
        self._chunks = chunks

    async def similarity_search(self, query: str, *, k: int) -> list[RetrievedChunk]:
        return self._chunks[:k]


def _chunk(document_id: str, groups: list[str], score: float = 0.9) -> RetrievedChunk:
    return RetrievedChunk(
        document_id=document_id, chunk_id=f"{document_id}:0", title=document_id, source_url="https://example/" + document_id,
        source_system="sharepoint", classification="INTERNAL", security_groups=groups,
        modified_at=datetime.now(timezone.utc), content="secret content", score=score,
    )


@pytest.mark.asyncio
async def test_retrieve_filters_out_unauthorized_chunks(monkeypatch):
    chunks = [
        _chunk("DOC-A", ["FINANCE-METRICS-READ"]),
        _chunk("DOC-B", ["HR-METRICS-READ"]),
        _chunk("DOC-C", ["DATA-POLICY-READ"]),
    ]
    monkeypatch.setattr(retrieval, "get_vector_store", lambda session: FakeVectorStore(chunks))
    monkeypatch.setattr(retrieval, "record_audit_event", _noop_audit)

    results = await retrieval.retrieve(session=None, query="q", user_groups=["DATA-POLICY-READ"], k=6)

    assert [r.document_id for r in results] == ["DOC-C"]


@pytest.mark.asyncio
async def test_retrieve_returns_nothing_for_zero_overlap(monkeypatch):
    chunks = [_chunk("DOC-A", ["RESTRICTED-GROUP"])]
    monkeypatch.setattr(retrieval, "get_vector_store", lambda session: FakeVectorStore(chunks))
    monkeypatch.setattr(retrieval, "record_audit_event", _noop_audit)

    results = await retrieval.retrieve(session=None, query="q", user_groups=["SOME-OTHER-GROUP"], k=6)

    assert results == []


@pytest.mark.asyncio
async def test_retrieve_never_returns_more_than_k(monkeypatch):
    chunks = [_chunk(f"DOC-{i}", ["G"]) for i in range(20)]
    monkeypatch.setattr(retrieval, "get_vector_store", lambda session: FakeVectorStore(chunks))
    monkeypatch.setattr(retrieval, "record_audit_event", _noop_audit)

    results = await retrieval.retrieve(session=None, query="q", user_groups=["G"], k=3)

    assert len(results) == 3


async def _noop_audit(**kwargs):
    return None
