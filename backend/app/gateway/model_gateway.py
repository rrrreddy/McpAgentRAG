"""The model gateway — the single choke point between agent code and any
LLM provider (D8).

Responsibilities implemented here:
  - provider allowlist + routing by workload size (small/general/complex)
  - automatic fallback to a secondary provider on primary failure
  - outbound guardrail scanning (secrets) before any prompt leaves
  - per-day token budget enforcement (Redis counter)
  - request/response logging WITHOUT prompt/response content (only
    metadata) so logs can't themselves become a data-exfiltration path
"""
from __future__ import annotations

import datetime as dt

from app.config import get_settings
from app.gateway.guardrails import GuardrailViolation, scan_outbound_prompt
from app.gateway.providers.anthropic_provider import AnthropicProvider
from app.gateway.providers.base import CompletionResult, ModelProvider
from app.gateway.providers.ollama_provider import OllamaProvider
from app.gateway.providers.openai_provider import OpenAIProvider
from app.logging_config import get_logger
from app.memory.redis_client import get_redis

logger = get_logger("model_gateway")


class TokenBudgetExceeded(Exception):
    pass


class ModelGateway:
    def __init__(self) -> None:
        self._settings = get_settings()
        self._providers: dict[str, ModelProvider] = {}
        self._build_providers()

    def _build_providers(self) -> None:
        s = self._settings
        if s.anthropic_api_key:
            self._providers["anthropic"] = AnthropicProvider(s.anthropic_api_key, s.anthropic_model)
        if s.openai_api_key:
            self._providers["openai"] = OpenAIProvider(s.openai_api_key, s.openai_model)
        # Ollama needs no key — always registered as the offline-capable fallback.
        self._providers["ollama"] = OllamaProvider(s.ollama_base_url, s.ollama_model)

    async def _check_budget(self, estimated_tokens: int) -> None:
        budget = self._settings.model_gateway_daily_token_budget
        if budget <= 0:
            return
        redis = get_redis()
        today = dt.date.today().isoformat()
        key = f"gateway:tokens:{today}"
        used = int(await redis.get(key) or 0)
        if used + estimated_tokens > budget:
            raise TokenBudgetExceeded(f"Daily token budget of {budget} would be exceeded ({used} already used).")

    async def _record_usage(self, tokens: int) -> None:
        redis = get_redis()
        today = dt.date.today().isoformat()
        key = f"gateway:tokens:{today}"
        await redis.incrby(key, tokens)
        await redis.expire(key, 60 * 60 * 30)

    async def complete(
        self,
        *,
        system: str,
        messages: list[dict],
        workload: str = "general",  # "small" | "general" | "complex"
        max_tokens: int = 1024,
        temperature: float = 0.1,
    ) -> CompletionResult:
        for msg in messages:
            try:
                scan_outbound_prompt(msg.get("content", ""))
            except GuardrailViolation:
                logger.warning("outbound_guardrail_blocked", workload=workload)
                raise

        estimated_tokens = sum(len(m.get("content", "")) for m in messages) // 4 + max_tokens
        await self._check_budget(estimated_tokens)

        provider_order = self._resolve_provider_order(workload)
        last_error: Exception | None = None
        for provider_name in provider_order:
            provider = self._providers.get(provider_name)
            if provider is None:
                continue
            try:
                result = await provider.complete(system=system, messages=messages, max_tokens=max_tokens, temperature=temperature)
                await self._record_usage(result.input_tokens + result.output_tokens)
                logger.info(
                    "gateway_completion",
                    provider=result.provider,
                    model=result.model,
                    workload=workload,
                    input_tokens=result.input_tokens,
                    output_tokens=result.output_tokens,
                )
                return result
            except Exception as exc:  # noqa: BLE001 - fall through to next provider
                logger.warning("provider_failed", provider=provider_name, error=str(exc))
                last_error = exc
                continue
        raise RuntimeError(f"All providers failed for workload={workload}") from last_error

    def _resolve_provider_order(self, workload: str) -> list[str]:
        primary = self._settings.model_gateway_primary_provider
        fallback = self._settings.model_gateway_fallback_provider
        # "small" workloads (structured extraction, typed output) prefer the
        # cheapest available provider first, per D8's routing table.
        if workload == "small" and "ollama" in self._providers:
            return ["ollama", primary, fallback]
        order = [primary]
        if fallback not in order:
            order.append(fallback)
        for name in self._providers:
            if name not in order:
                order.append(name)
        return order

    async def health(self) -> dict[str, bool]:
        return {name: await provider.health_check() for name, provider in self._providers.items()}


_gateway: ModelGateway | None = None


def get_model_gateway() -> ModelGateway:
    global _gateway
    if _gateway is None:
        _gateway = ModelGateway()
    return _gateway
