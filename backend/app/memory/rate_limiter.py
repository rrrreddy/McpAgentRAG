"""Fixed-window rate limiting backed by Redis.

Enforces D3's "API -> Agents" request-size/rate boundary so a single user
or compromised token cannot flood the agent graph (and, transitively, the
LLM gateway and MCP servers) with requests.
"""
from __future__ import annotations

from app.memory.redis_client import get_redis


class RateLimitExceeded(Exception):
    def __init__(self, retry_after_seconds: int):
        self.retry_after_seconds = retry_after_seconds
        super().__init__(f"Rate limit exceeded, retry after {retry_after_seconds}s")


async def check_rate_limit(key: str, *, max_requests: int, window_seconds: int = 60) -> None:
    redis = get_redis()
    bucket_key = f"ratelimit:{key}"
    current = await redis.incr(bucket_key)
    if current == 1:
        await redis.expire(bucket_key, window_seconds)
    if current > max_requests:
        ttl = await redis.ttl(bucket_key)
        raise RateLimitExceeded(retry_after_seconds=max(ttl, 1))
