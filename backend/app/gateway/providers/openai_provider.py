from __future__ import annotations

from openai import AsyncOpenAI

from app.gateway.providers.base import CompletionResult, ModelProvider


class OpenAIProvider(ModelProvider):
    name = "openai"

    def __init__(self, api_key: str, model: str):
        self._client = AsyncOpenAI(api_key=api_key)
        self._model = model

    async def complete(self, *, system: str, messages: list[dict], max_tokens: int = 1024, temperature: float = 0.1) -> CompletionResult:
        response = await self._client.chat.completions.create(
            model=self._model,
            max_tokens=max_tokens,
            temperature=temperature,
            messages=[{"role": "system", "content": system}, *messages],
        )
        choice = response.choices[0]
        usage = response.usage
        return CompletionResult(
            text=choice.message.content or "",
            input_tokens=usage.prompt_tokens if usage else 0,
            output_tokens=usage.completion_tokens if usage else 0,
            provider=self.name,
            model=self._model,
        )

    async def health_check(self) -> bool:
        try:
            await self._client.chat.completions.create(model=self._model, max_tokens=1, messages=[{"role": "user", "content": "ping"}])
            return True
        except Exception:
            return False
