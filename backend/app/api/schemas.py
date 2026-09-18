from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class RefreshRequest(BaseModel):
    refresh_token: str


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=255)


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    display_name: str
    role: str
    security_groups: list[str]


class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    conversation_id: uuid.UUID | None = None


class CitationOut(BaseModel):
    source_type: str
    title: str
    reference: str
    excerpt: str | None = None


class ChatResponse(BaseModel):
    conversation_id: uuid.UUID
    message_id: uuid.UUID
    route: str
    answer: str
    citations: list[CitationOut]
    confidence: float
    table_data: dict | None = None
    chart_spec: dict | None = None
    correlation_id: str


class ConversationOut(BaseModel):
    id: uuid.UUID
    title: str
    created_at: datetime
    updated_at: datetime


class MessageOut(BaseModel):
    id: uuid.UUID
    role: str
    content: str
    route: str | None
    citations: list[dict]
    confidence: float | None
    chart_spec: dict | None
    table_data: dict | None
    created_at: datetime
