from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class CompletionResult:
    text: str
    input_tokens: int
    output_tokens: int
    provider: str
    model: str


class ModelProvider(ABC):
    name: str

    @abstractmethod
    async def complete(self, *, system: str, messages: list[dict], max_tokens: int = 1024, temperature: float = 0.1) -> CompletionResult: ...

    @abstractmethod
    async def health_check(self) -> bool: ...
