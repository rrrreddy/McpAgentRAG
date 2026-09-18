"""Index every sample SharePoint doc under sample_data/sharepoint_docs
into the vector store, using each file's YAML front matter as ACL/source
metadata (D4.1's metadata example).

Run inside the backend container: `python -m scripts.index_documents`
"""
from __future__ import annotations

import asyncio
from datetime import datetime
from pathlib import Path

import yaml

from app.db.session import SessionLocal
from app.paths import sample_data_dir
from app.rag.indexing import SourceDocument, index_document

DOCS_DIR = sample_data_dir() / "sharepoint_docs"


def _parse_front_matter(raw: str) -> tuple[dict, str]:
    assert raw.startswith("---"), "expected YAML front matter delimited by ---"
    _, front_matter_raw, body = raw.split("---", 2)
    metadata = yaml.safe_load(front_matter_raw)
    return metadata, body.strip()


async def main() -> None:
    if not DOCS_DIR.exists():
        raise SystemExit(f"sample docs directory not found: {DOCS_DIR}")

    async with SessionLocal() as session:
        for path in sorted(DOCS_DIR.glob("*.md")):
            metadata, body = _parse_front_matter(path.read_text())
            doc = SourceDocument(
                document_id=metadata["document_id"],
                title=metadata["title"],
                text=body,
                source_url=metadata["source_url"],
                source_system=metadata.get("source_system", "sharepoint"),
                classification=metadata.get("classification", "INTERNAL"),
                modified_at=datetime.fromisoformat(str(metadata["modified_at"]).replace("Z", "+00:00")) if metadata.get("modified_at") else None,
            )
            count = await index_document(session, doc, metadata["security_groups"])
            print(f"indexed {doc.document_id} ({path.name}): {count} chunks, groups={metadata['security_groups']}")


if __name__ == "__main__":
    asyncio.run(main())
