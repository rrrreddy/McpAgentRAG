"""Chunking for SharePoint/document ingestion (D4.2).

A thin, dependency-light re-implementation of the "RecursiveCharacterTextSplitter
with overlap" shape shown in the source spec — kept here instead of pulling in
all of langchain-community just for splitting, since the vector store
integration is custom anyway.
"""
from __future__ import annotations

from dataclasses import dataclass

DEFAULT_SEPARATORS = ["\n\n", "\n", ". ", " ", ""]


@dataclass
class Chunk:
    index: int
    text: str


def split_text(text: str, *, chunk_size: int = 800, chunk_overlap: int = 120) -> list[Chunk]:
    if chunk_overlap >= chunk_size:
        raise ValueError("chunk_overlap must be smaller than chunk_size")

    segments = _recursive_split(text, DEFAULT_SEPARATORS, chunk_size)
    chunks: list[str] = []
    buffer = ""
    for segment in segments:
        if len(buffer) + len(segment) <= chunk_size:
            buffer += segment
            continue
        if buffer:
            chunks.append(buffer)
            buffer = buffer[-chunk_overlap:] if chunk_overlap else ""
        if len(segment) > chunk_size:
            for i in range(0, len(segment), chunk_size - chunk_overlap):
                chunks.append(segment[i : i + chunk_size])
            buffer = ""
        else:
            buffer += segment
    if buffer:
        chunks.append(buffer)

    return [Chunk(index=i, text=c.strip()) for i, c in enumerate(chunks) if c.strip()]


def _recursive_split(text: str, separators: list[str], chunk_size: int) -> list[str]:
    if not separators:
        return [text]
    sep, *rest = separators
    if sep == "":
        return list(text)
    parts = text.split(sep)
    return [p + sep for p in parts[:-1]] + ([parts[-1]] if parts[-1] else [])
