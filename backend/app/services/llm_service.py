from typing import Optional, List
from .openai_provider import OpenAIProvider
from .anthropic_provider import AnthropicProvider
from .openrouter_provider import OpenRouterProvider


class LLMService:
    def __init__(self, provider: str, api_key: Optional[str], model: str):
        self.provider = provider
        self.api_key = api_key
        self.model = model
        self.client = self._get_provider()

    def _get_provider(self):
        if self.provider == "openai":
            if not self.api_key:
                raise ValueError("API key is required for OpenAI provider")
            return OpenAIProvider(self.api_key, self.model)
        elif self.provider == "anthropic":
            if not self.api_key:
                raise ValueError("API key is required for Anthropic provider")
            return AnthropicProvider(self.api_key, self.model)
        elif self.provider == "openrouter":
            if not self.api_key:
                raise ValueError("API key is required for OpenRouter provider")
            return OpenRouterProvider(self.api_key, self.model)
        else:
            raise ValueError(f"Unsupported provider: {self.provider}. Supported: openai, anthropic, openrouter")

    async def generate(
        self,
        prompt: str,
        images: Optional[List[bytes]] = None,
        max_tokens: int = 4000
    ) -> str:
        return await self.client.generate(prompt, images, max_tokens)