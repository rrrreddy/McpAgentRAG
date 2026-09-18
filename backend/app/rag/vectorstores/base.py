from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime


@dataclass
class RetrievedChunk:
    document_id: str
    chunk_id: str
    title: str
    source_url: str
    source_system: str
    classification: str
    security_groups: list[str]
    modified_at: datetime | None
    content: str
    score: float


class VectorStore(ABC):
    @abstractmethod
    async def upsert_chunks(self, *, document_id: str, title: str, source_url: str, source_system: str,
                             classification: str, security_groups: list[str], modified_at: datetime | None,
                             chunks: list[str]) -> int: ...

    @abstractmethod
    async def similarity_search(self, query: str, *, k: int) -> list[RetrievedChunk]: ...

    @abstractmethod
    async def delete_document(self, document_id: str) -> None: ...
