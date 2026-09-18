from __future__ import annotations

import httpx

from app.gateway.providers.base import CompletionResult, ModelProvider


class OllamaProvider(ModelProvider):
    """Fully local fallback provider — no external API key required.

    Used as MODEL_GATEWAY_FALLBACK_PROVIDER so the platform keeps
    answering (in degraded quality) if the primary hosted provider is
    unavailable, per D8's "model health monitoring with automatic
    fallback."
    """

    name = "ollama"

    def __init__(self, base_url: str, model: str):
        self._base_url = base_url.rstrip("/")
        self._model = model

    async def complete(self, *, system: str, messages: list[dict], max_tokens: int = 1024, temperature: float = 0.1) -> CompletionResult:
        prompt_messages = [{"role": "system", "content": system}, *messages]
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f"{self._base_url}/api/chat",
                json={
                    "model": self._model,
                    "messages": prompt_messages,
                    "stream": False,
                    "options": {"temperature": temperature, "num_predict": max_tokens},
                },
            )
            response.raise_for_status()
            data = response.json()
        text = data.get("message", {}).get("content", "")
        return CompletionResult(
            text=text,
            input_tokens=data.get("prompt_eval_count", 0),
            output_tokens=data.get("eval_count", 0),
            provider=self.name,
            model=self._model,
        )

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                response = await client.get(f"{self._base_url}/api/tags")
                return response.status_code == 200
        except Exception:
            return False
