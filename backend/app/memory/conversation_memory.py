"""Two-tier conversation memory.

- Hot tier (Redis): the last N turns of a conversation, cached for fast
  reload into LangGraph state without a DB round-trip on every message.
- Durable tier (Postgres `conversations`/`messages`): the system of record,
  used for audit, cross-device continuity, and re-hydrating the cache after
  a restart or cache eviction.

This gives the agent graph real short-term memory (recent turns available
to the supervisor for follow-up questions like "what about last quarter?")
without ever making Redis the source of truth for anything that must
survive a restart.
"""
from __future__ import annotations

import json
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Conversation, Message
from app.memory.redis_client import get_redis

HOT_TURNS = 12
HOT_TTL_SECONDS = 60 * 60 * 6  # 6 hours


def _hot_key(conversation_id: str) -> str:
    return f"conv:{conversation_id}:turns"


async def append_turn(conversation_id: str, role: str, content: str) -> None:
    redis = get_redis()
    key = _hot_key(conversation_id)
    await redis.rpush(key, json.dumps({"role": role, "content": content}))
    await redis.ltrim(key, -HOT_TURNS, -1)
    await redis.expire(key, HOT_TTL_SECONDS)


async def get_recent_turns(conversation_id: str) -> list[dict]:
    redis = get_redis()
    raw = await redis.lrange(_hot_key(conversation_id), 0, -1)
    if raw:
        return [json.loads(r) for r in raw]
    return []


async def hydrate_from_db(session: AsyncSession, conversation_id: uuid.UUID) -> list[dict]:
    """Fallback path when the Redis cache is cold (restart, eviction)."""
    result = await session.execute(
        select(Message).where(Message.conversation_id == conversation_id).order_by(Message.created_at.desc()).limit(HOT_TURNS)
    )
    messages = list(reversed(result.scalars().all()))
    turns = [{"role": m.role, "content": m.content} for m in messages]
    redis = get_redis()
    key = _hot_key(str(conversation_id))
    if turns:
        await redis.delete(key)
        await redis.rpush(key, *[json.dumps(t) for t in turns])
        await redis.expire(key, HOT_TTL_SECONDS)
    return turns


async def get_or_create_conversation(session: AsyncSession, *, user_id: uuid.UUID, conversation_id: uuid.UUID | None) -> Conversation:
    if conversation_id is not None:
        result = await session.execute(select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == user_id))
        existing = result.scalar_one_or_none()
        if existing is not None:
            return existing
    conversation = Conversation(user_id=user_id, title="New conversation")
    session.add(conversation)
    await session.flush()
    return conversation
