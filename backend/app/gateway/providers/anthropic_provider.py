from __future__ import annotations

import anthropic

from app.gateway.providers.base import CompletionResult, ModelProvider


class AnthropicProvider(ModelProvider):
    name = "anthropic"

    def __init__(self, api_key: str, model: str):
        self._client = anthropic.AsyncAnthropic(api_key=api_key)
        self._model = model

    async def complete(self, *, system: str, messages: list[dict], max_tokens: int = 1024, temperature: float = 0.1) -> CompletionResult:
        response = await self._client.messages.create(
            model=self._model,
            system=system,
            max_tokens=max_tokens,
            temperature=temperature,
            messages=[{"role": m["role"], "content": m["content"]} for m in messages],
        )
        text = "".join(block.text for block in response.content if block.type == "text")
        return CompletionResult(
            text=text,
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
            provider=self.name,
            model=self._model,
        )

    async def health_check(self) -> bool:
        try:
            await self._client.messages.create(
                model=self._model, max_tokens=1, messages=[{"role": "user", "content": "ping"}]
            )
            return True
        except Exception:
            return False
