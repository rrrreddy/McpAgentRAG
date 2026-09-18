from __future__ import annotations

from redis.asyncio import Redis, from_url

from app.config import get_settings

_settings = get_settings()
_redis: Redis | None = None


def get_redis() -> Redis:
    global _redis
    if _redis is None:
        _redis = from_url(_settings.redis_url, decode_responses=True)
    return _redis
