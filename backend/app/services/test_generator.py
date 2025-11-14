from typing import Optional, List, Dict, Any
import json
import re
import logging
from .llm_service import LLMService
from ..models.schemas import TestCase, TestStep, GenerateResponse

logger = logging.getLogger(__name__)


class TestGenerator:
    def __init__(self, llm_service: LLMService):
        self.llm_service = llm_service

    def build_prompt(
        self,
        description: Optional[str],
        source_code: Optional[Dict[str, Any]]
    ) -> str:
        prompt = """You are a manual QA tester who tests frontend web applications by clicking buttons, filling forms, and checking what appears on screen. You don't need to understand backend code or technical details - just focus on what users see and do.

"""

        if description:
            prompt += f"**What the feature does (from user's perspective):**\n{description}\n\n"

        # Skip source code entirely for manual QA - they don't need technical details
        if source_code:
            prompt += "**Note:** Ignore any technical code information provided - focus only on user interface testing.\n\n"

        prompt += f"""
Create simple test cases that test what users actually do:
- Click buttons and links
- Type text into fields
- Check if messages or content appear
- Try wrong inputs to see error messages
- Test basic functionality

Keep test cases simple and focused on user actions. Avoid any backend or technical details.

IMPORTANT: Return ONLY raw JSON (no markdown formatting, no code blocks, no additional text):

{{
  "test_cases": [
    {{
      "id": "TC001",
      "title": "Test case title",
      "description": "Simple description of what to test",
      "steps": [
        {{
          "step": 1,
          "action": "What the tester should do",
          "expected": "What should happen on screen"
        }}
      ],
      "expected_result": "Overall result",
      "priority": "high"
    }}
  ],
  "markdown": "# Test Cases\\n\\n## TC001: Test Title\\nDetails..."
}}

JSON VALIDATION REQUIREMENTS:
- All property values must be properly quoted
- No trailing commas after the last element
- Proper nesting with correct braces and brackets
- Step numbers must be sequential integers starting from 1
- Priority must be one of: "high", "medium", "low"

Make sure to:
- Include 3-5 simple test cases
- Focus only on user interface actions
- Keep descriptions clear and non-technical
- Test basic happy path and common error scenarios
- Use proper JSON syntax (no syntax errors)
- Make the markdown simple and readable
"""

        return prompt

    async def generate(
        self,
        description: Optional[str],
        source_code: Optional[str],
        images: Optional[List[bytes]]
    ) -> GenerateResponse:
        prompt = self.build_prompt(description, source_code)

        response_text = await self.llm_service.generate(
            prompt=prompt,
            images=images,
            max_tokens=4000
        )

        return self.parse_response(response_text)

    def parse_response(self, response_text: str) -> GenerateResponse:
        # Используем более точный поиск JSON объектов
        json_patterns = [
            r'```json\s*(\{[\s\S]*?"test_cases"[\s\S]*?\})\s*```',  # JSON в markdown блоке с test_cases
            r'```\s*(\{[\s\S]*?"test_cases"[\s\S]*?\})\s*```',     # JSON в code блоке с test_cases
            r'(\{[\s\S]*?"test_cases"[\s\S]*?\})',  # JSON с test_cases без markdown
            r'(\{[\s\S]*?\})'  # Любой JSON объект (запасной вариант)
        ]
        
        for pattern in json_patterns:
            json_match = re.search(pattern, response_text, re.DOTALL)
            if json_match:
                try:
                    json_str = json_match.group(1) if json_match.groups() else json_match.group()

                    # Сначала пробуем парсить как есть
                    try:
                        data = json.loads(json_str)
                    except json.JSONDecodeError:
                        # Если не получилось, пытаемся исправить
                        json_str = self._fix_json_string(json_str)
                        data = json.loads(json_str)
                    
                    # Проверяем обязательные поля
                    if "test_cases" not in data:
                        continue
                    
                    test_cases = []
                    for tc_data in data.get("test_cases", []):
                        try:
                            steps = []
                            for step_data in tc_data.get("steps", []):
                                step = TestStep(
                                    step=step_data.get("step", 1),
                                    action=step_data.get("action", ""),
                                    expected=step_data.get("expected", "")
                                )
                                steps.append(step)
                            
                            test_case = TestCase(
                                id=tc_data.get("id", f"TC{len(test_cases)+1:03d}"),
                                title=tc_data.get("title", "Generated Test Case"),
                                description=tc_data.get("description", ""),
                                steps=steps,
                                expected_result=tc_data.get("expected_result", ""),
                                priority=tc_data.get("priority", "medium")
                            )
                            test_cases.append(test_case)
                        except (KeyError, TypeError, ValueError) as e:
                            logger.warning(f"Error parsing test case: {e}, data: {tc_data}")
                            continue

                    markdown = data.get("markdown", self.generate_default_markdown(test_cases))

                    return GenerateResponse(
                        test_cases=test_cases,
                        markdown=markdown
                    )
                except (json.JSONDecodeError, TypeError, ValueError) as e:
                    logger.warning(f"JSON parsing failed: {e}, json_str: {json_str[:500]}...")
                    continue

        logger.warning("No valid JSON found in response, using fallback")
        return self.generate_fallback_response(response_text)

    def generate_fallback_response(self, response_text: str) -> GenerateResponse:
        test_case = TestCase(
            id="TC001",
            title="Generated Test Case",
            description=response_text[:200],
            steps=[
                TestStep(
                    step=1,
                    action="Review the generated content",
                    expected="Content is clear and actionable"
                )
            ],
            expected_result="Test execution completes successfully",
            priority="medium"
        )

        markdown = self.generate_default_markdown([test_case])

        return GenerateResponse(
            test_cases=[test_case],
            markdown=markdown
        )

    def generate_default_markdown(self, test_cases: List[TestCase]) -> str:
        markdown = "# Test Cases\n\n"
        
        for i, tc in enumerate(test_cases, 1):
            markdown += f"## {i}. {tc.title}\n\n"
            markdown += f"**ID:** {tc.id}\n\n"
            markdown += f"**Priority:** {tc.priority.upper()}\n\n"
            markdown += f"**Description:**\n{tc.description}\n\n"
            markdown += "### Steps:\n\n"
            
            for step in tc.steps:
                markdown += f"{step.step}. **{step.action}**\n"
                markdown += f"   - *Expected:* {step.expected}\n\n"
            
            markdown += f"### Expected Result:\n{tc.expected_result}\n\n"
            markdown += "---\n\n"

        return markdown

    def _fix_json_string(self, json_str: str) -> str:
        """Агрессивный JSON repair"""
        import re

        # Сначала пробуем простой repair
        repaired = self._simple_json_repair(json_str)
        try:
            import json
            json.loads(repaired)
            return repaired
        except:
            pass

        # Если не получилось, пробуем извлечь все возможные JSON кандидаты
        candidates = self._extract_json_candidates(json_str)
        for candidate in candidates:
            try:
                import json
                json.loads(candidate)
                return candidate
            except:
                continue

        # Если ничего не помогло, пробуем экстремальный fallback
        return self._extreme_json_fallback(json_str)

    def _extreme_json_fallback(self, json_str: str) -> str:
        """Экстремальный fallback для очень сломанного JSON"""
        import re

        # Пытаемся найти хотя бы основные структуры
        # Ищем "test_cases": [ ... ]
        test_cases_match = re.search(r'"test_cases"\s*:\s*\[[\s\S]*?\]', json_str, re.IGNORECASE)
        if test_cases_match:
            # Создаем минимальный валидный JSON
            return f'{{"test_cases": {test_cases_match.group(0)}}}'

        # Если совсем ничего, возвращаем базовый JSON
        return '{"test_cases": []}'

    def _simple_json_repair(self, json_str: str) -> str:
        """Простой JSON repair"""
        import re

        # Удаляем лишние пробелы
        json_str = json_str.strip()

        # Ищем корректный JSON блок
        start_brace = json_str.find('{')
        last_brace = json_str.rfind('}')

        if start_brace != -1 and last_brace != -1 and last_brace > start_brace:
            json_str = json_str[start_brace:last_brace + 1]

        # Исправляем проблемы внутри строк
        in_string = False
        escape_next = False
        result = []

        for char in json_str:
            if escape_next:
                result.append(char)
                escape_next = False
                continue

            if char == '\\':
                escape_next = True
                result.append(char)
                continue

            if char == '"' and not escape_next:
                in_string = not in_string
                result.append(char)
                continue

            if in_string and char == '\n':
                result.append('\\n')
            elif in_string and char == '\t':
                result.append(' ')
            elif in_string and char == '\r':
                continue
            else:
                result.append(char)

        json_str = ''.join(result)

        # Удаляем висячие запятые
        json_str = re.sub(r',(\s*[}\]])', r'\1', json_str)

        # Исправляем незавершенные кавычки
        quote_count = json_str.count('"')
        if quote_count % 2 != 0:
            json_str += '"'

        # Исправляем отсутствующие запятые между свойствами
        json_str = re.sub(r'}(\s*)"([^"]+)":', r'},$1"$2":', json_str)
        json_str = re.sub(r'](\s*)"([^"]+)":', r'],$1"$2":', json_str)

        return json_str

    def _extract_json_candidates(self, json_str: str) -> list:
        """Извлекает все возможные JSON кандидаты"""
        candidates = []

        # Ищем все возможные JSON объекты
        brace_count = 0
        start_pos = -1
        in_string = False
        escape_next = False

        for i, char in enumerate(json_str):
            if escape_next:
                escape_next = False
                continue

            if char == '\\':
                escape_next = True
                continue

            if char == '"' and not escape_next:
                in_string = not in_string
                continue

            if not in_string:
                if char == '{':
                    if brace_count == 0:
                        start_pos = i
                    brace_count += 1
                elif char == '}':
                    brace_count -= 1
                    if brace_count == 0 and start_pos != -1:
                        candidate = json_str[start_pos:i + 1]
                        candidates.append(candidate)

        # Сортируем по длине, самые длинные первыми
        return sorted(candidates, key=len, reverse=True)