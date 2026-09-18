"""Document ingestion endpoint — lets a data steward/admin index a
SharePoint export into the RAG store with explicit ACL metadata (D4.2).

Deliberately requires an explicit, non-empty security_groups list: there
is no "public by default" path here, matching app.rag.indexing's own
hard refusal to index an ungoverned document.
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import CurrentUser, require_role
from app.db.session import get_db_session
from app.rag.indexing import SourceDocument, index_document

router = APIRouter(prefix="/api/documents", tags=["documents"])


class IndexDocumentRequest(BaseModel):
    document_id: str = Field(min_length=1, max_length=255)
    title: str
    text: str = Field(min_length=1)
    source_url: str
    source_system: str = "sharepoint"
    classification: str = "INTERNAL"
    security_groups: list[str] = Field(min_length=1)
    modified_at: datetime | None = None


class IndexDocumentResponse(BaseModel):
    document_id: str
    chunks_indexed: int


@router.post("/index", response_model=IndexDocumentResponse, status_code=status.HTTP_201_CREATED)
async def index_document_endpoint(
    payload: IndexDocumentRequest,
    current_user: CurrentUser = Depends(require_role("data_steward", "admin")),
    session: AsyncSession = Depends(get_db_session),
) -> IndexDocumentResponse:
    if payload.classification.upper() in ("CONFIDENTIAL", "RESTRICTED") and current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins may index CONFIDENTIAL/RESTRICTED documents")

    doc = SourceDocument(
        document_id=payload.document_id, title=payload.title, text=payload.text, source_url=payload.source_url,
        source_system=payload.source_system, classification=payload.classification.upper(), modified_at=payload.modified_at,
    )
    count = await index_document(session, doc, payload.security_groups)
    return IndexDocumentResponse(document_id=payload.document_id, chunks_indexed=count)
