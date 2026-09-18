"""FastAPI application entrypoint (D2's "Serving: FastAPI endpoint,
JWT-authenticated").

Middleware stack (outermost to innermost) implements the "User -> API"
trust boundary from D3:
  1. CORS — only the configured frontend origin(s) may call this API from
     a browser.
  2. Request size limit — a naive but effective guard against a client
     trying to stuff megabytes into a chat message to pad the LLM prompt.
  3. Correlation ID — every request gets one (generated if the client
     didn't send one), propagated into every log line and MCP call.
"""
from __future__ import annotations

import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import admin, auth, chat, documents, health
from app.config import get_settings
from app.logging_config import configure_logging, correlation_id_var, get_logger

settings = get_settings()
configure_logging(settings.log_level)
logger = get_logger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("app_startup", env=settings.app_env, vector_store=settings.vector_store_backend)
    yield
    logger.info("app_shutdown")


app = FastAPI(
    title="Enterprise RAG + MCP Agents",
    description="RAG + MCP multi-agent platform over bank databases, SharePoint, and decoded Informatica PowerCenter lineage.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-Correlation-Id"],
)


@app.middleware("http")
async def request_size_limit_middleware(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length is not None and int(content_length) > settings.max_request_body_bytes:
        return JSONResponse(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, content={"detail": "Request body too large"})
    return await call_next(request)


@app.middleware("http")
async def correlation_id_middleware(request: Request, call_next):
    correlation_id = request.headers.get("x-correlation-id") or str(uuid.uuid4())
    token = correlation_id_var.set(correlation_id)
    try:
        response = await call_next(request)
    finally:
        correlation_id_var.reset(token)
    response.headers["X-Correlation-Id"] = correlation_id
    return response


app.include_router(health.router)
app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(documents.router)
app.include_router(admin.router)
