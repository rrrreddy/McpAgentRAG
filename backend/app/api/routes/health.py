from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends

from app.db.session import get_db_session
from app.memory.redis_client import get_redis

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/live")
async def liveness():
    return {"status": "ok"}


@router.get("/ready")
async def readiness(session: AsyncSession = Depends(get_db_session)):
    checks = {"database": False, "redis": False}
    try:
        await session.execute(text("SELECT 1"))
        checks["database"] = True
    except Exception:
        pass
    try:
        await get_redis().ping()
        checks["redis"] = True
    except Exception:
        pass
    status_ok = all(checks.values())
    return {"status": "ok" if status_ok else "degraded", "checks": checks}
