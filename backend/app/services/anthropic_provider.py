from anthropic import Anthropic
from typing import List, Optional
import base64


class AnthropicProvider:
    def __init__(self, api_key: str, model: str = "claude-3-opus-20240229"):
        self.client = Anthropic(api_key=api_key)
        self.model = model

    async def generate(
        self,
        prompt: str,
        images: Optional[List[bytes]] = None,
        max_tokens: int = 4000
    ) -> str:
        messages = []
        
        if images:
            content = [{"type": "text", "text": prompt}]
            for image in images:
                base64_image = base64.b64encode(image).decode('utf-8')
                content.append({
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/png",
                        "data": base64_image
                    }
                })
            messages.append({"role": "user", "content": content})
        else:
            messages.append({"role": "user", "content": prompt})

        response = self.client.messages.create(
            model=self.model,
            max_tokens=max_tokens,
            messages=messages
        )

        return response.content[0].text