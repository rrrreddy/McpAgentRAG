"""Centralized application configuration.

All runtime configuration is sourced from environment variables (see
.env.example). Nothing sensitive ever has a real default here — secrets
default to an obviously-fake placeholder so misconfiguration fails loudly
instead of silently running "secure" with a known key.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: Literal["development", "staging", "production"] = "development"
    log_level: str = "INFO"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: str = "http://localhost:5173"

    # --- Auth ---
    jwt_secret_key: str = "change-me-to-a-random-48-byte-secret"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_minutes: int = 10080

    # --- Postgres ---
    database_url: str = "postgresql+asyncpg://ragmcp_app:app@localhost:5432/ragmcp"
    database_url_readonly: str = "postgresql+asyncpg://ragmcp_readonly:ro@localhost:5432/ragmcp"

    # --- Redis ---
    redis_url: str = "redis://localhost:6379/0"

    # --- Vector store ---
    vector_store_backend: Literal["pgvector", "chroma"] = "pgvector"
    chroma_host: str = "localhost"
    chroma_port: int = 8001
    embedding_model: str = "BAAI/bge-small-en-v1.5"

    # --- Model gateway ---
    model_gateway_primary_provider: Literal["anthropic", "openai", "ollama"] = "anthropic"
    model_gateway_fallback_provider: Literal["anthropic", "openai", "ollama"] = "ollama"

    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-5"
    anthropic_small_model: str = "claude-haiku-4-5"

    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"

    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.1:8b"

    model_gateway_daily_token_budget: int = 2_000_000

    # --- MCP servers ---
    knowledge_mcp_url: str = "http://localhost:9101/mcp"
    db_mcp_url: str = "http://localhost:9102/mcp"
    lineage_mcp_url: str = "http://localhost:9103/mcp"
    governance_mcp_url: str = "http://localhost:9104/mcp"
    mcp_shared_secret: str = "change-me-mcp-service-secret"

    # --- Audit ---
    audit_log_retention_days: int = 365

    # --- Request limits ---
    max_request_body_bytes: int = 1_000_000
    chat_rate_limit_per_minute: int = 30

    @field_validator("cors_origins")
    @classmethod
    def _split_noop(cls, v: str) -> str:
        return v

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
