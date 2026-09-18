"""SQLAlchemy ORM models.

Tables fall into four groups:
  1. Identity & entitlements (users, security groups) — drives every ACL
     check in D3/D4.
  2. Conversation memory (conversations, messages) — persisted agent state
     so a session survives restarts and can be audited.
  3. Governance (audit_log) — one row per MCP tool invocation / retrieval,
     per the "audit record per tool invocation" hardening requirement.
  4. Lineage (lineage_nodes, lineage_edges) — the queryable graph produced
     by the Informatica decoding pipeline (D7), so lineage-mcp answers by
     traversal instead of re-parsing XML per question.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


def _uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = _uuid_pk()
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Coarse RBAC role: analyst | data_steward | admin
    role: Mapped[str] = mapped_column(String(50), nullable=False, default="analyst")
    # Fine-grained entitlements used for ACL filtering of RAG documents and
    # row/column level security in db-mcp (analog of Oracle roles/VPD
    # predicates). e.g. ["DATA-POLICY-READ", "HR-METRICS-READ"]
    security_groups: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    conversations: Mapped[list["Conversation"]] = relationship(back_populates="user")


class RefreshToken(Base):
    """Server-side allowlist of active refresh tokens so they can be revoked."""

    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_jti: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(500), default="New conversation")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user: Mapped["User"] = relationship(back_populates="conversations")
    messages: Mapped[list["Message"]] = relationship(back_populates="conversation", order_by="Message.created_at")


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = _uuid_pk()
    conversation_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # user | assistant | system
    content: Mapped[str] = mapped_column(Text, nullable=False)
    route: Mapped[str | None] = mapped_column(String(50), nullable=True)  # knowledge | data | lineage | clarify
    citations: Mapped[list[dict]] = mapped_column(JSON, default=list)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    chart_spec: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    table_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    conversation: Mapped["Conversation"] = relationship(back_populates="messages")


class AuditEvent(Base):
    """One row per MCP tool invocation / retrieval / auth decision.

    This is the backbone of D5's "audit record per tool invocation" and
    D3's trust-boundary enforcement — every cross-boundary hop is logged
    with the correlation id so a full request can be reconstructed.
    """

    __tablename__ = "audit_log"

    id: Mapped[uuid.UUID] = _uuid_pk()
    correlation_id: Mapped[str] = mapped_column(String(64), index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    actor: Mapped[str] = mapped_column(String(255))  # user email or service identity
    event_type: Mapped[str] = mapped_column(String(100), index=True)  # e.g. "mcp_tool_call", "auth_login", "acl_denied"
    resource: Mapped[str] = mapped_column(String(255))  # tool name / document id / table name
    decision: Mapped[str] = mapped_column(String(20))  # allow | deny | error
    detail: Mapped[dict] = mapped_column(JSON, default=dict)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class DocumentChunk(Base):
    """pgvector-backed chunk store for SharePoint/document RAG (D4.2).

    ACL enforcement happens in application code as a hard post-filter on
    `security_groups`, never by trusting the model — see rag/retrieval.py.
    """

    __tablename__ = "document_chunks"

    id: Mapped[uuid.UUID] = _uuid_pk()
    document_id: Mapped[str] = mapped_column(String(255), index=True)
    chunk_id: Mapped[str] = mapped_column(String(300), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(500))
    source_url: Mapped[str] = mapped_column(String(1000))
    source_system: Mapped[str] = mapped_column(String(50), default="sharepoint")
    classification: Mapped[str] = mapped_column(String(50), default="INTERNAL")
    security_groups: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    modified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list[float]] = mapped_column(Vector(384))  # bge-small-en-v1.5 dim
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (Index("ix_document_chunks_embedding", "embedding", postgresql_using="ivfflat"),)


class LineageNode(Base):
    """A field, transformation, or connection instance decoded from a
    PowerCenter mapping export (D7.3)."""

    __tablename__ = "lineage_nodes"

    id: Mapped[uuid.UUID] = _uuid_pk()
    mapping_name: Mapped[str] = mapped_column(String(255), index=True)
    node_key: Mapped[str] = mapped_column(String(500), index=True)  # e.g. "Exp_CalcBalance.OUT_BALANCE"
    node_type: Mapped[str] = mapped_column(String(50))  # source_field | transformation | target_field
    transformation_type: Mapped[str | None] = mapped_column(String(100), nullable=True)  # Expression, Lookup, Router...
    datatype: Mapped[str | None] = mapped_column(String(100), nullable=True)
    expression: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)

    __table_args__ = (UniqueConstraint("mapping_name", "node_key", name="uq_lineage_node"),)


class LineageEdge(Base):
    __tablename__ = "lineage_edges"

    id: Mapped[uuid.UUID] = _uuid_pk()
    mapping_name: Mapped[str] = mapped_column(String(255), index=True)
    from_node_key: Mapped[str] = mapped_column(String(500), index=True)
    to_node_key: Mapped[str] = mapped_column(String(500), index=True)


class Workflow(Base):
    """Top-level PowerCenter workflow metadata (session order/dependencies)."""

    __tablename__ = "workflows"

    id: Mapped[uuid.UUID] = _uuid_pk()
    workflow_name: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    sessions: Mapped[list[dict]] = mapped_column(JSON, default=list)  # ordered session -> mapping bindings
    source_file: Mapped[str] = mapped_column(String(500))
    parsed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
