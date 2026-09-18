"""Async SQLAlchemy engine/session management.

Two engines are exposed on purpose:

- `engine` / `get_db_session`: the application's read-write identity, used
  by the API for auth, conversations, audit logging, and RAG indexing.
- `readonly_engine` / `get_readonly_session`: a SEPARATE database identity
  with SELECT-only grants, used exclusively by db-mcp. This mirrors how the
  real Oracle-backed DataHub deployment works: the service account MCP uses
  to reach the warehouse cannot write, alter, or see tables outside its
  granted views, no matter what an agent asks it to do.
"""
from __future__ import annotations

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings

settings = get_settings()

engine = create_async_engine(settings.database_url, pool_pre_ping=True, pool_size=10, max_overflow=10)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

# Read-only engine — points at the same database but authenticates as a
# role that PostgreSQL (or, in production, Oracle) will refuse to let write.
readonly_engine = create_async_engine(settings.database_url_readonly, pool_pre_ping=True, pool_size=5, max_overflow=5)
ReadOnlySessionLocal = async_sessionmaker(readonly_engine, expire_on_commit=False, class_=AsyncSession)


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session


async def get_readonly_session() -> AsyncGenerator[AsyncSession, None]:
    async with ReadOnlySessionLocal() as session:
        yield session


@asynccontextmanager
async def readonly_session_scope() -> AsyncGenerator[AsyncSession, None]:
    async with ReadOnlySessionLocal() as session:
        yield session


@asynccontextmanager
async def session_scope() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
